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
    ? `Ingreso registrado — ${timeStr} hrs`
    : `Salida registrada — ${timeStr} hrs`;

  const typeLabel = isEntry ? 'Ingreso' : 'Salida';
  const accentColor = isEntry ? '#2563eb' : '#0f172a';
  const badgeBg = isEntry ? '#eff6ff' : '#f8fafc';
  const badgeColor = isEntry ? '#2563eb' : '#334155';

  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';

  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        
        <!-- Header con marca -->
        <tr><td style="padding:24px 32px;border-bottom:1px solid #f1f5f9;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><strong style="font-size:18px;color:#0f172a;">flex</strong><strong style="font-size:18px;color:#2563eb;">io</strong></td>
              <td align="right"><span style="font-size:12px;color:#94a3b8;">Control de Asistencia</span></td>
            </tr>
          </table>
        </td></tr>

        <!-- Contenido -->
        <tr><td style="padding:32px;">
          <!-- Badge tipo -->
          <div style="margin-bottom:24px;">
            <span style="display:inline-block;background:${badgeBg};color:${badgeColor};font-size:13px;font-weight:600;padding:6px 14px;border-radius:6px;border:1px solid ${isEntry ? '#bfdbfe' : '#e2e8f0'};">
              ${typeLabel}
            </span>
          </div>

          <p style="font-size:15px;color:#374151;margin:0 0 6px 0;">
            Hola <strong>${employee.first_name}</strong>,
          </p>
          <p style="font-size:15px;color:#374151;margin:0 0 24px 0;">
            Tu ${typeLabel.toLowerCase()} ha sido registrado correctamente.
          </p>

          <!-- Datos del registro -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:20px 24px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
                      <span style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Hora</span><br>
                      <strong style="font-size:20px;color:#0f172a;">${timeStr} hrs</strong>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0 8px 0;">
                      <span style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Fecha</span><br>
                      <strong style="font-size:14px;color:#0f172a;">${dateStr}</strong>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <p style="font-size:12px;color:#94a3b8;margin:24px 0 0 0;">
            Este es un registro automático. Si no reconoces esta actividad, contacta a tu administrador.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td><span style="font-size:11px;color:#94a3b8;">Flexio · flexio.cl</span></td>
              <td align="right"><span style="font-size:11px;color:#cbd5e1;">No responder a este correo</span></td>
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
