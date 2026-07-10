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

    // Enviar notificación por email al colaborador (async, no bloquea la respuesta)
    if (employee.email) {
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (RESEND_API_KEY) {
        sendAttendanceEmail(RESEND_API_KEY, employee, type, now).catch(err => {
          console.error('Error enviando notificación:', err);
        });
      }
    }

    return res.status(201).json(record);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

async function sendAttendanceEmail(apiKey, employee, type, timestamp) {
  const TZ = 'America/Santiago';
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString('es-CL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = date.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

  const isEntry = type === 'entry';
  const subject = isEntry
    ? `✅ Ingreso registrado — ${timeStr}`
    : `👋 Salida registrada — ${timeStr}`;

  const color = isEntry ? '#10b981' : '#f97316';
  const icon = isEntry ? '✅' : '👋';
  const typeLabel = isEntry ? 'Ingreso' : 'Salida';
  const message = isEntry
    ? 'Tu ingreso ha sido registrado correctamente.'
    : 'Tu salida ha sido registrada correctamente.';

  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <tr><td style="background:${color};padding:30px;text-align:center;">
          <p style="font-size:36px;margin:0;">${icon}</p>
          <h1 style="color:#ffffff;font-size:20px;margin:8px 0 0 0;">${typeLabel} Registrado</h1>
        </td></tr>
        <tr><td style="padding:30px;">
          <p style="font-size:16px;color:#374151;margin:0 0 15px 0;">
            Hola <strong>${employee.first_name}</strong>, ${message}
          </p>
          <table width="100%" style="background:#f9fafb;border-radius:10px;padding:15px;">
            <tr><td style="padding:12px;">
              <p style="margin:6px 0;font-size:14px;color:#6b7280;">Hora: <strong style="color:#111827;">${timeStr} hrs</strong></p>
              <p style="margin:6px 0;font-size:14px;color:#6b7280;">Fecha: <strong style="color:#111827;">${dateStr}</strong></p>
              <p style="margin:6px 0;font-size:14px;color:#6b7280;">Tipo: <strong style="color:#111827;">${typeLabel}</strong></p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:15px 30px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Flexio · Control de Asistencia</p>
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
