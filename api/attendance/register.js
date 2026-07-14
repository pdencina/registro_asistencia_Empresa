const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    const { employee_id, type, photo_snapshot, notes } = req.body;

    if (!employee_id || !type) {
      return res.status(400).json({ error: 'employee_id y type son obligatorios' });
    }

    if (!['entry', 'exit'].includes(type)) {
      return res.status(400).json({ error: 'type debe ser "entry" o "exit"' });
    }

    // Verificar que el empleado pertenece a ESTE tenant
    const [employee] = await sql(
      'SELECT * FROM employees WHERE id = $1 AND tenant_id = $2 AND active = true',
      [employee_id, tenant.id]
    );
    if (!employee) {
      return res.status(404).json({ error: 'Empleado no encontrado o inactivo' });
    }

    let snapshot_url = null;
    if (photo_snapshot) {
      const buffer = Buffer.from(photo_snapshot.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const blob = await put(`snapshots/${tenant.slug}/${crypto.randomUUID()}.jpg`, buffer, {
        access: 'public',
        contentType: 'image/jpeg'
      });
      snapshot_url = blob.url;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await sql(
      `INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, photo_snapshot_url, method, notes)
       VALUES ($1, $2, $3, $4, $5, $6, 'visual', $7)`,
      [id, tenant.id, employee_id, type, now, snapshot_url, notes || null]
    );

    const [record] = await sql(`
      SELECT ar.*, e.first_name, e.last_name, e.rut, e.department
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.id = $1 AND ar.tenant_id = $2
    `, [id, tenant.id]);

    // Enviar notificación por email al colaborador (await para que no se corte en serverless)
    if (employee.email) {
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (RESEND_API_KEY) {
        // Intentar obtener dirección legible de las coordenadas
        let locationText = notes || null;
        if (notes && notes.includes('GPS:')) {
          const gpsMatch = notes.match(/GPS:\s*([-\d.]+),\s*([-\d.]+)/);
          if (gpsMatch) {
            const address = await reverseGeocode(gpsMatch[1], gpsMatch[2]);
            if (address) locationText = address;
          }
        } else if (!notes) {
          // Kiosco: buscar la ubicación del dispositivo en la BD
          const [device] = await sql(
            'SELECT lat, lng, name FROM authorized_devices WHERE tenant_id = $1 AND active = true LIMIT 1',
            [tenant.id]
          );
          if (device && device.lat && device.lng) {
            const address = await reverseGeocode(device.lat, device.lng);
            locationText = address || `${device.name || 'Kiosco'} (${device.lat}, ${device.lng})`;
          }
        }

        await sendAttendanceEmail(RESEND_API_KEY, employee, type, now, locationText).catch(err => {
          console.error('Error enviando notificación:', err);
        });
      }
    }

    return res.status(201).json(record);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

async function sendAttendanceEmail(apiKey, employee, type, timestamp, notes) {
  const TZ = 'America/Santiago';
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString('es-CL', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dayStr = date.toLocaleDateString('es-CL', { timeZone: TZ, weekday: 'long' });

  const isEntry = type === 'entry';
  const typeLabel = isEntry ? 'Entrada' : 'Salida';
  const subject = `Registro de ${typeLabel.toLowerCase()} — ${dateStr}`;

  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';

  // Obtener info del tenant para mostrar razón social
  const { getDb } = require('../lib/db');
  const sql = getDb();
  let tenantName = '';
  let tenantRut = '';
  if (employee.tenant_id) {
    const tenants = await sql('SELECT name, rut_empresa FROM tenants WHERE id = $1', [employee.tenant_id]);
    if (tenants[0]) {
      tenantName = tenants[0].name;
      tenantRut = tenants[0].rut_empresa || '';
    }
  }

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        
        <!-- Header -->
        <tr><td style="padding:20px 28px;border-bottom:1px solid #e2e8f0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><strong style="font-size:17px;color:#0f172a;">flex</strong><strong style="font-size:17px;color:#2563eb;">io</strong></td>
              <td align="right"><span style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Registro de Asistencia</span></td>
            </tr>
          </table>
        </td></tr>

        <!-- Título -->
        <tr><td style="padding:28px 28px 20px 28px;text-align:center;">
          <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px 0;">Comprobante de registro</p>
          <p style="font-size:20px;font-weight:700;color:#0f172a;margin:0;">${tenantName || 'Registro'}</p>
          <div style="width:40px;height:3px;background:#2563eb;margin:12px auto 0;border-radius:2px;"></div>
        </td></tr>

        <!-- Tabla de datos -->
        <tr><td style="padding:0 28px 24px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
            <tr style="border-bottom:1px solid #f1f5f9;">
              <td style="padding:12px 16px;font-size:13px;color:#64748b;background:#f8fafc;width:120px;border-bottom:1px solid #e2e8f0;">Sentido</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">${typeLabel}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:13px;color:#64748b;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Hora</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;font-weight:600;border-bottom:1px solid #e2e8f0;">${timeStr}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px;font-size:13px;color:#64748b;background:#f8fafc;border-bottom:1px solid #e2e8f0;">Fecha</td>
              <td style="padding:12px 16px;font-size:14px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${dateStr} (${dayStr})</td>
            </tr>
            ${notes ? `<tr>
              <td style="padding:12px 16px;font-size:13px;color:#64748b;background:#f8fafc;">Ubicación</td>
              <td style="padding:12px 16px;font-size:13px;color:#0f172a;">📍 ${notes}</td>
            </tr>` : `<tr>
              <td style="padding:12px 16px;font-size:13px;color:#64748b;background:#f8fafc;">Ubicación</td>
              <td style="padding:12px 16px;font-size:13px;color:#0f172a;">📍 Dispositivo autorizado (kiosco)</td>
            </tr>`}
          </table>
        </td></tr>

        <!-- Datos del colaborador -->
        <tr><td style="padding:0 28px 24px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:16px;">
            <tr><td style="padding:16px;">
              <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px 0;">Colaborador</p>
              <p style="font-size:14px;color:#0f172a;font-weight:600;margin:0 0 4px 0;">${employee.first_name} ${employee.last_name}</p>
              <p style="font-size:13px;color:#475569;margin:0 0 2px 0;">RUT: ${employee.rut}</p>
              ${employee.department ? `<p style="font-size:13px;color:#475569;margin:0 0 2px 0;">Área: ${employee.department}</p>` : ''}
              ${employee.position ? `<p style="font-size:13px;color:#475569;margin:0;">Cargo: ${employee.position}</p>` : ''}
            </td></tr>
          </table>
        </td></tr>

        <!-- Datos de la empresa -->
        ${tenantName ? `
        <tr><td style="padding:0 28px 24px 28px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;padding:16px;">
            <tr><td style="padding:16px;">
              <p style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px 0;">Empresa</p>
              <p style="font-size:14px;color:#0f172a;font-weight:600;margin:0 0 2px 0;">${tenantName}</p>
              ${tenantRut ? `<p style="font-size:13px;color:#475569;margin:0;">RUT: ${tenantRut}</p>` : ''}
            </td></tr>
          </table>
        </td></tr>
        ` : ''}

        <!-- Footer -->
        <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="font-size:11px;color:#94a3b8;">Flexio · flexio.cl</span></td>
              <td align="right"><span style="font-size:11px;color:#cbd5e1;">Comprobante automático</span></td>
            </tr>
          </table>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Flexio <${FROM_EMAIL}>`,
      to: [employee.email],
      subject,
      html,
    }),
  });
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'Flexio/1.0 (flexio.cl)' } }
    );
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
    return data.display_name?.split(',').slice(0, 3).join(',') || null;
  } catch {
    return null;
  }
}
