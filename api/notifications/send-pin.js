const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

/**
 * POST /api/notifications/send-pin
 * Envía el PIN personal al colaborador por email.
 * Body: { employee_id, pin, slug }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return res.status(200).json({ message: 'Email no configurado' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    const { employee_id, pin, slug } = req.body;

    const [employee] = await sql('SELECT * FROM employees WHERE id = $1 AND tenant_id = $2', [employee_id, tenant.id]);
    if (!employee || !employee.email) {
      return res.status(200).json({ message: 'Sin email' });
    }

    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';
    const markUrl = `https://flexio.cl/pin/${slug}`;

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="padding:20px 28px;border-bottom:1px solid #e2e8f0;">
          <strong style="font-size:17px;color:#0f172a;">flex</strong><strong style="font-size:17px;color:#2563eb;">io</strong>
        </td></tr>
        <tr><td style="padding:32px 28px;">
          <p style="font-size:16px;color:#0f172a;font-weight:600;margin:0 0 12px 0;">
            Hola ${employee.first_name},
          </p>
          <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px 0;">
            Se te ha asignado un PIN personal para registrar tu asistencia. Este método no requiere reconocimiento facial.
          </p>

          <div style="background:#f0f9ff;border:2px solid #bfdbfe;border-radius:10px;padding:20px;text-align:center;margin:20px 0;">
            <p style="font-size:13px;color:#64748b;margin:0 0 8px 0;">Tu PIN personal</p>
            <p style="font-size:32px;font-weight:800;color:#1e40af;margin:0;letter-spacing:8px;font-family:monospace;">${pin}</p>
          </div>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:20px 0;">
            <p style="font-size:13px;color:#64748b;margin:0 0 6px 0;">Para marcar tu asistencia, ingresa a:</p>
            <a href="${markUrl}" style="font-size:15px;color:#2563eb;font-weight:600;text-decoration:none;">${markUrl}</a>
          </div>

          <p style="font-size:13px;color:#6b7280;margin:20px 0 0 0;">
            Ingresa tu PIN cada vez que necesites registrar entrada o salida. No compartas tu PIN con nadie.
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <span style="font-size:11px;color:#94a3b8;">Flexio · Control de Asistencia · flexio.cl</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Flexio <${FROM_EMAIL}>`,
        to: [employee.email],
        subject: 'Tu PIN de asistencia — Flexio',
        html,
      }),
    });

    return res.status(200).json({ message: 'PIN enviado por email' });
  } catch (error) {
    return res.status(200).json({ message: error.message });
  }
};
