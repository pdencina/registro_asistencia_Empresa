const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { rateLimit } = require('../lib/rateLimit');

const { insertAttendanceRecord } = require('../lib/integrity');
const { evaluateGeo } = require('../lib/geofence');
const { resolveEventTime, parseCoordinates, normalizeChannel, sanitizeDeviceId } = require('../lib/attendanceEvents');
const { getActivePolicy, allowsMethod } = require('../lib/policy');
const { verifyPinForEmployee, logAttempt } = require('../lib/credentials');

const TZ = 'America/Santiago';

/**
 * POST /api/attendance/pin-checkin
 * Marcaje por PIN personal (alternativa no biométrica, Art. 7 g de la Res. Ex. N.º 38).
 *
 * Body: { pin, rut, action: 'identify' | 'entry' | 'exit' }
 *
 * Dos modos, según la política de la empresa (tenant_attendance_policy.legacy_marking):
 *  - legado (por defecto): comportamiento anterior; acepta PIN solo o RUT solo.
 *  - con política: exige RUT + PIN, verifica el PIN con hash y bloqueo por intentos, aplica los métodos
 *    permitidos por canal y conserva solo la primera de varias marcas seguidas del mismo tipo (Art. 36 c).
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // El PIN de 4-6 dígitos identifica al trabajador: se limita para frenar la fuerza bruta
  if (req.body && req.body.pin && rateLimit(req, res, { maxAttempts: 20, windowMs: 60000, keyPrefix: 'pin-checkin' })) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    const { pin, rut, action, notes } = req.body;

    if ((!pin && !rut) || !action) {
      return res.status(400).json({ error: 'PIN o RUT y acción son obligatorios' });
    }

    // Asegurar columna personal_pin existe
    await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS personal_pin VARCHAR(10)');

    const policy = await getActivePolicy(sql, tenant.id);
    const channel = normalizeChannel(req.body.source);
    const enforced = policy.legacy_marking === false;
    let auth = { method: pin ? 'PIN' : 'RUT_ONLY', result: pin ? 'SUCCESS' : 'IDENTIFIED_ONLY' };

    let employee;

    if (enforced) {
      const gate = await authenticateWithPolicy({ sql, tenant, policy, channel, body: req.body, req });
      if (!gate.ok) return res.status(gate.status).json(gate.body);
      employee = gate.employee;
      auth = { method: 'PIN', result: 'SUCCESS' };
    } else if (pin) {
      // Buscar por PIN personal
      const employees = await sql(
        'SELECT * FROM employees WHERE personal_pin = $1 AND tenant_id = $2 AND active = true',
        [pin, tenant.id]
      );
      if (employees.length === 0) {
        return res.status(401).json({ error: 'PIN no reconocido. Verifica con tu administrador.' });
      }
      employee = employees[0];
    } else {
      // Buscar por RUT
      const rutClean = rut.replace(/[.\-\s]/g, '').toLowerCase();
      const employees = await sql(
        `SELECT * FROM employees WHERE REPLACE(REPLACE(LOWER(rut), '.', ''), '-', '') = $1 AND tenant_id = $2 AND active = true`,
        [rutClean, tenant.id]
      );
      if (employees.length === 0) {
        return res.status(401).json({ error: 'RUT no encontrado. Verifica con tu administrador.' });
      }
      employee = employees[0];
    }

    // Acción: solo identificar
    if (action === 'identify') {
      // Obtener estado del día
      const records = await sql(`
        SELECT * FROM attendance_records 
        WHERE employee_id = $1 AND tenant_id = $2
          AND date(timestamp AT TIME ZONE $3) = date(NOW() AT TIME ZONE $3)
        ORDER BY timestamp DESC LIMIT 1
      `, [employee.id, tenant.id, TZ]);

      const lastRecord = records.length > 0 ? records[0] : null;
      const status = !lastRecord ? 'absent' :
                     lastRecord.type === 'entry' ? 'present' : 'exited';

      return res.status(200).json({
        employee: {
          id: employee.id,
          first_name: employee.first_name,
          last_name: employee.last_name,
          department: employee.department,
        },
        status: { status, last_record: lastRecord },
      });
    }

    // Acción: registrar entrada o salida
    if (action === 'entry' || action === 'exit') {
      // Verificar estado actual
      const records = await sql(`
        SELECT * FROM attendance_records 
        WHERE employee_id = $1 AND tenant_id = $2
          AND date(timestamp AT TIME ZONE $3) = date(NOW() AT TIME ZONE $3)
        ORDER BY timestamp DESC LIMIT 1
      `, [employee.id, tenant.id, TZ]);

      const lastRecord = records.length > 0 ? records[0] : null;
      const currentStatus = !lastRecord ? 'absent' :
                           lastRecord.type === 'entry' ? 'present' : 'exited';

      // Art. 36 c): si marca varias veces seguidas el mismo evento, se mantiene la primera y no se crean más
      if (enforced && lastRecord && lastRecord.type === action) {
        await logAttempt(sql, { tenantId: tenant.id, employeeId: employee.id, method: 'PIN', outcome: 'DUPLICATE_IGNORED', channel, ip: clientIp(req) });
        return res.status(200).json({ duplicate: true, message: 'Ya tenías registrada esta marcación; se conserva la primera.', method: 'pin' });
      }

      if (action === 'entry' && (currentStatus === 'present' || currentStatus === 'exited')) {
        return res.status(400).json({ error: 'Ya registraste tu ingreso hoy' });
      }
      if (action === 'exit' && currentStatus !== 'present') {
        return res.status(400).json({ error: 'Debes registrar ingreso primero' });
      }

      const id = crypto.randomUUID();

      // Hora del evento: la del servidor, o la del dispositivo solo en sincronización offline acotada
      const eventTime = resolveEventTime(req.body);
      if (!eventTime.ok) {
        return res.status(eventTime.status).json({ error: eventTime.error, code: eventTime.code });
      }
      const now = eventTime.timestamp;

      // Coordenadas validadas (body o formato legado "GPS: lat, lng" en notes)
      const { latitude, longitude, accuracy } = parseCoordinates(req.body);

      // Evaluar geofence SIN bloquear la marca (ORD. N°408 DT, 10-09-2026):
      // se permite marcar y se deja evidencia estructurada de si estuvo dentro o fuera
      // del perímetro, NO se impide el registro.
      const geo = await evaluateGeo(sql, tenant.id, latitude, longitude);

      // Insertar con hash de integridad encadenado (Res. 38 DT).
      // Se deja constancia honesta del método: la marca por RUT sin segundo factor queda como
      // RUT_ONLY / IDENTIFIED_ONLY para poder detectarla y retirarla (plan de marcación, etapa 6).
      const method = pin ? 'pin' : 'rut';
      const baseNote = notes || `Marcaje por ${method === 'pin' ? 'PIN personal' : 'RUT'}`;
      await insertAttendanceRecord({
        id,
        tenant_id: tenant.id,
        employee_id: employee.id,
        type: action,
        timestamp: now,
        method,
        notes: baseNote + geo.observacion,
        photo_snapshot_url: null,
        latitude,
        longitude,
        server_received_at: eventTime.serverReceivedAt,
        client_timestamp: eventTime.clientTimestamp,
        is_offline_sync: eventTime.isOfflineSync,
        auth_method: auth.method,
        auth_result: auth.result,
        policy_version: policy.version,
        channel,
        device_id: sanitizeDeviceId(req.body.device_id),
        geo_status: geo.geo_status,
        geo_distance_m: geo.geo_distance_m,
        geo_accuracy_m: accuracy,
      });

      // Enviar email si tiene (con ubicación si hay GPS)
      if (employee.email) {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        if (RESEND_API_KEY) {
          let locationText = null;
          try {
            let lat = latitude, lng = longitude;
            // Fallback SOLO para tótem: si es un tótem fijo y el navegador no dio
            // GPS, usar la ubicación configurada del dispositivo autorizado.
            // En marcaje móvil NUNCA se inventa ubicación: si no hay GPS real,
            // el email va sin ubicación (más honesto).
            const esTotem = req.body.source === 'totem';
            if ((lat == null || lng == null) && esTotem) {
              const [device] = await sql(
                'SELECT lat, lng FROM authorized_devices WHERE tenant_id = $1 AND active = true AND lat IS NOT NULL AND lng IS NOT NULL LIMIT 1',
                [tenant.id]
              );
              if (device) { lat = device.lat; lng = device.lng; }
            }
            if (lat != null && lng != null) {
              locationText = await reverseGeocode(lat, lng);
            }
          } catch (e) {
            // Geocoding falló, enviar sin ubicación
          }
          try {
            await sendNotification(RESEND_API_KEY, employee, action, now, tenant, locationText);
          } catch (err) {
            console.error('[PIN-checkin] Error enviando email:', err.message);
          }
        }
      }

      return res.status(201).json({ message: `${action === 'entry' ? 'Ingreso' : 'Salida'} registrado`, method });
    }

    return res.status(400).json({ error: 'Acción no válida' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  return typeof fwd === 'string' && fwd ? fwd.split(',')[0].trim() : null;
}

/**
 * Modo con política: RUT + PIN, verificado con hash y bloqueo por intentos.
 * Las respuestas de error son deliberadamente genéricas (no revelan si el RUT existe ni si tiene PIN).
 */
async function authenticateWithPolicy({ sql, tenant, policy, channel, body, req }) {
  if (policy.status === 'UNCONFIGURED') {
    return { ok: false, status: 403, body: { code: 'POLICY_UNCONFIGURED', error: 'La empresa aún no define su método de marcación.' } };
  }
  if (!allowsMethod(policy, 'PIN', channel)) {
    return { ok: false, status: 403, body: { code: 'METHOD_NOT_ALLOWED', error: 'Este método de marcación no está habilitado para este canal.' } };
  }
  if (!body.rut || !body.pin) {
    return { ok: false, status: 400, body: { code: 'RUT_AND_PIN_REQUIRED', error: 'Ingresa tu RUT y tu PIN.' } };
  }

  const ctx = { channel, deviceId: sanitizeDeviceId(body.device_id), ip: clientIp(req) };
  const rutClean = String(body.rut).replace(/[.\-\s]/g, '').toLowerCase();
  const [employee] = await sql(
    `SELECT * FROM employees WHERE REPLACE(REPLACE(LOWER(rut), '.', ''), '-', '') = $1 AND tenant_id = $2 AND active = true`,
    [rutClean, tenant.id]
  );

  const generic = { ok: false, status: 401, body: { code: 'INVALID_CREDENTIALS', error: 'RUT o PIN incorrectos.' } };

  if (!employee) {
    await logAttempt(sql, { tenantId: tenant.id, rut: body.rut, method: 'PIN', outcome: 'INVALID', reason: 'UNKNOWN_RUT', channel: ctx.channel, deviceId: ctx.deviceId, ip: ctx.ip });
    return generic;
  }

  const check = await verifyPinForEmployee(sql, { tenantId: tenant.id, employee, pin: String(body.pin), policy, ctx });
  if (check.ok) return { ok: true, employee };
  if (check.outcome === 'LOCKED') {
    return { ok: false, status: 423, body: { code: 'LOCKED', error: 'Demasiados intentos. Intenta nuevamente más tarde.', retry_after_seconds: check.retryAfterSeconds } };
  }
  return generic;
}

async function sendNotification(apiKey, employee, type, timestamp, tenant, locationText) {
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const typeLabel = type === 'entry' ? 'Entrada' : 'Salida';
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';

  const html = `<div style="font-family:sans-serif;padding:20px;">
    <p>Hola <strong>${employee.first_name}</strong>,</p>
    <p>Tu ${typeLabel.toLowerCase()} ha sido registrada.</p>
    <p><strong>Hora:</strong> ${timeStr}<br><strong>Fecha:</strong> ${dateStr}${locationText ? `<br><strong>Ubicación:</strong> 📍 ${locationText}` : ''}</p>
    <p style="color:#666;font-size:12px;">Flexio · flexio.cl</p>
  </div>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Flexio <${FROM_EMAIL}>`,
      to: [employee.email],
      subject: `Registro de ${typeLabel.toLowerCase()} — ${timeStr}`,
      html,
    }),
  });
}

/**
 * Reverse geocoding: convierte lat/lng en dirección legible.
 * Usa Google Maps API (si hay key) o Nominatim como fallback.
 */
async function reverseGeocode(lat, lng) {
  const GOOGLE_MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

  if (GOOGLE_MAPS_KEY) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=es&key=${GOOGLE_MAPS_KEY}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          return data.results[0].formatted_address;
        }
      }
    } catch (e) {}
  }

  // Fallback: OpenStreetMap Nominatim
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'Flexio/1.0 (flexio.cl)' }, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.address) {
      const a = data.address;
      const parts = [];
      if (a.road) parts.push(a.road + (a.house_number ? ' ' + a.house_number : ''));
      if (a.suburb || a.neighbourhood) parts.push(a.suburb || a.neighbourhood);
      if (a.city || a.town || a.village) parts.push(a.city || a.town || a.village);
      return parts.join(', ') || data.display_name?.split(',').slice(0, 3).join(',') || null;
    }
    return null;
  } catch {
    return null;
  }
}
