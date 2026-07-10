const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * POST /api/auth/recover-pin
 * Envía una contraseña temporal por email al administrador del tenant.
 * Body: { email: "admin@empresa.cl" }
 * Header: x-tenant-slug: "constructora-acme"
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Servicio de email no configurado. Contacta a soporte.' });
  }

  const sql = getDb();
  const slug = req.headers['x-tenant-slug'];

  if (!slug) {
    return res.status(400).json({ error: 'No se pudo identificar la empresa' });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email es obligatorio' });
    }

    // Buscar tenant por slug
    const [tenant] = await sql('SELECT * FROM tenants WHERE slug = $1', [slug]);
    if (!tenant) {
      // No revelar si el tenant existe o no (seguridad)
      return res.status(200).json({ message: 'Si el email es correcto, recibirás tu PIN en breve.' });
    }

    // Verificar que el email coincida con el admin del tenant
    if (tenant.admin_email.toLowerCase() !== email.toLowerCase()) {
      // No revelar que el email no coincide (seguridad)
      return res.status(200).json({ message: 'Si el email es correcto, recibirás tu PIN en breve.' });
    }

    // Generar contraseña temporal
    const tempPassword = Math.random().toString(36).slice(-8);
    
    // Guardar contraseña temporal
    await sql('UPDATE tenants SET admin_password = $1, updated_at = NOW() WHERE id = $2', [tempPassword, tenant.id]);

    // Enviar email con la contraseña temporal
    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
          <tr>
            <td style="background:#2563eb;padding:30px;text-align:center;">
              <h1 style="color:#ffffff;font-size:22px;margin:0;">Recuperación de acceso</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:30px;">
              <p style="font-size:16px;color:#374151;margin:0 0 20px 0;">
                Hola, recibimos una solicitud para recuperar el acceso de <strong>${tenant.name}</strong>.
              </p>
              <p style="font-size:14px;color:#374151;margin:0 0 10px 0;">Tu contraseña temporal es:</p>
              <div style="background:#f0f9ff;border:2px solid #bfdbfe;border-radius:12px;padding:24px;text-align:center;margin:20px 0;">
                <p style="font-size:28px;font-weight:800;color:#1e40af;margin:0;letter-spacing:2px;font-family:monospace;">${tempPassword}</p>
              </div>
              <p style="font-size:14px;color:#6b7280;margin:20px 0 0 0;">
                Accede a tu panel y cambia tu contraseña:<br>
                <a href="https://flexio.cl/admin/${tenant.slug}" style="color:#2563eb;font-weight:600;">flexio.cl/admin/${tenant.slug}</a>
              </p>
              <p style="font-size:12px;color:#9ca3af;margin:20px 0 0 0;">
                Si no solicitaste esta recuperación, contacta a soporte inmediatamente.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="font-size:12px;color:#9ca3af;margin:0;">Flexio · Control de Asistencia</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Flexio <${FROM_EMAIL}>`,
        to: [tenant.admin_email],
        subject: `Recuperación de acceso — ${tenant.name}`,
        html,
      }),
    });

    if (!response.ok) {
      console.error('Resend error:', await response.text());
    }

    // Siempre retornar el mismo mensaje (no revelar si fue exitoso o no)
    return res.status(200).json({ message: 'Si el email es correcto, recibirás tu PIN en breve.' });
  } catch (error) {
    console.error('Recover PIN error:', error);
    return res.status(200).json({ message: 'Si el email es correcto, recibirás tu PIN en breve.' });
  }
};
