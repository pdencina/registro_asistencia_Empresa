const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

const TZ = 'America/Santiago';

/**
 * Send attendance notification email via Resend.
 * Requires RESEND_API_KEY environment variable.
 * 
 * POST body: { employee_id, type: 'entry'|'exit', timestamp }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return res.status(200).json({ message: 'RESEND_API_KEY no configurado, email no enviado' });
  }

  const sql = getDb();

  try {
    const { employee_id, type, timestamp } = req.body;

    // Ensure email/phone columns exist
    await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(200)');
    await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone VARCHAR(50)');

    const [employee] = await sql('SELECT * FROM employees WHERE id = $1', [employee_id]);
    if (!employee || !employee.email) {
      return res.status(200).json({ message: 'Empleado sin email, notificación no enviada' });
    }

    const date = new Date(timestamp || Date.now());
    const dateStr = date.toLocaleDateString('es-CL', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

    const isEntry = type === 'entry';
    const subject = isEntry
      ? `✅ Ingreso registrado — ${dateStr}`
      : `🔔 Salida registrada — ${dateStr}`;

    const html = buildEmailHtml({
      employeeName: `${employee.first_name} ${employee.last_name}`,
      type: isEntry ? 'Ingreso' : 'Salida',
      time: timeStr,
      date: dateStr,
      isEntry,
    });

    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'asistencia@marcai.cl';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Marcai <${FROM_EMAIL}>`,
        to: [employee.email],
        subject,
        html,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend error:', result);
      return res.status(200).json({ message: 'Error enviando email', error: result });
    }

    return res.status(200).json({ message: 'Email enviado', id: result.id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

function buildEmailHtml({ employeeName, type, time, date, isEntry }) {
  const color = isEntry ? '#10b981' : '#f97316';
  const icon = isEntry ? '✅' : '👋';
  const message = isEntry
    ? 'Tu ingreso ha sido registrado correctamente.'
    : 'Tu salida ha sido registrada correctamente.';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="500" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background:${color};padding:30px;text-align:center;">
              <p style="font-size:40px;margin:0;">${icon}</p>
              <h1 style="color:#ffffff;font-size:22px;margin:10px 0 0 0;">${type} Registrado</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:30px;">
              <p style="font-size:16px;color:#374151;margin:0 0 20px 0;">
                Hola <strong>${employeeName}</strong>,
              </p>
              <p style="font-size:16px;color:#374151;margin:0 0 25px 0;">
                ${message}
              </p>
              <!-- Details card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;padding:20px;">
                <tr>
                  <td style="padding:15px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#6b7280;font-size:14px;">Tipo</span><br>
                          <strong style="color:#111827;font-size:16px;">${type}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#6b7280;font-size:14px;">Hora</span><br>
                          <strong style="color:#111827;font-size:16px;">${time} hrs</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <span style="color:#6b7280;font-size:14px;">Fecha</span><br>
                          <strong style="color:#111827;font-size:16px;">${date}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="font-size:12px;color:#9ca3af;margin:0;">
                Marcai · Sistema de Registro de Asistencia
              </p>
              <p style="font-size:11px;color:#d1d5db;margin:5px 0 0 0;">
                Este es un mensaje automático, no responder.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
