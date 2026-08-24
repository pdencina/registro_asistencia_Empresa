const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { insertAttendanceRecord } = require('../lib/integrity');
const { validateGeofence, getTenantGeoConfig, getNearestDevice } = require('../lib/geofence');

const TZ = 'America/Santiago';

/**
 * POST /api/attendance/pin-checkin
 * Marcaje alternativo por PIN personal (para quienes no dieron consentimiento biométrico).
 * 
 * Body: { pin, action: 'identify' | 'entry' | 'exit' }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    let employee;

    if (pin) {
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

      if (action === 'entry' && (currentStatus === 'present' || currentStatus === 'exited')) {
        return res.status(400).json({ error: 'Ya registraste tu ingreso hoy' });
      }
      if (action === 'exit' && currentStatus !== 'present') {
        return res.status(400).json({ error: 'Debes registrar ingreso primero' });
      }

      const id = crypto.randomUUID();
      // Si viene de sync offline, usar el timestamp original
      const now = req.body._offline_timestamp || new Date().toISOString();

      // Extraer coordenadas si vienen en el body
      const latitude = req.body.latitude || null;
      const longitude = req.body.longitude || null;

      // Validar geofence (Res. 38 DT)
      const geoConfig = await getTenantGeoConfig(sql, tenant.id);
      if (geoConfig.geolocationEnabled) {
        const nearestDevice = latitude != null
          ? await getNearestDevice(sql, tenant.id, latitude, longitude)
          : null;

        const geoResult = validateGeofence({
          latitude,
          longitude,
          device: nearestDevice,
          radiusMeters: geoConfig.radiusMeters,
          geolocationRequired: geoConfig.geolocationRequired,
        });

        if (!geoResult.valid) {
          return res.status(403).json({
            error: geoResult.message,
            distance: geoResult.distance,
            max_radius: geoConfig.radiusMeters,
            code: 'GEOFENCE_VIOLATION',
          });
        }
      }

      // Insertar con hash de integridad encadenado (Res. 38 DT)
      const method = pin ? 'pin' : 'rut';
      await insertAttendanceRecord({
        id,
        tenant_id: tenant.id,
        employee_id: employee.id,
        type: action,
        timestamp: now,
        method,
        notes: notes || `Marcaje por ${method === 'pin' ? 'PIN personal' : 'RUT'}`,
        photo_snapshot_url: null,
        latitude,
        longitude,
      });

      // Enviar email si tiene (con ubicación si hay GPS)
      if (employee.email) {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        if (RESEND_API_KEY) {
          let locationText = null;
          if (latitude && longitude) {
            try {
              locationText = await reverseGeocode(latitude, longitude);
            } catch (e) {}
          }
          sendNotification(RESEND_API_KEY, employee, action, now, tenant, locationText).catch(() => {});
        }
      }

      return res.status(201).json({ message: `${action === 'entry' ? 'Ingreso' : 'Salida'} registrado`, method: 'pin' });
    }

    return res.status(400).json({ error: 'Acción no válida' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

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
