const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * POST /api/contact
 * Recibe formulario de contacto y envía email al admin.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return res.status(200).json({ message: 'Mensaje recibido' });
  }

  try {
    const { name, company, email, phone, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Nombre, email y mensaje son obligatorios' });
    }

    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';
    const ADMIN_EMAIL = 'pablo@flexio.cl';

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="padding:24px 28px;background:#0f172a;">
          <strong style="color:#ffffff;font-size:16px;">Nuevo contacto desde flexio.cl</strong>
        </td></tr>
        <tr><td style="padding:28px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
              <span style="font-size:12px;color:#64748b;">Nombre</span><br>
              <strong style="font-size:14px;color:#0f172a;">${name}</strong>
            </td></tr>
            ${company ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
              <span style="font-size:12px;color:#64748b;">Empresa</span><br>
              <strong style="font-size:14px;color:#0f172a;">${company}</strong>
            </td></tr>` : ''}
            <tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
              <span style="font-size:12px;color:#64748b;">Email</span><br>
              <a href="mailto:${email}" style="font-size:14px;color:#2563eb;">${email}</a>
            </td></tr>
            ${phone ? `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;">
              <span style="font-size:12px;color:#64748b;">Teléfono</span><br>
              <strong style="font-size:14px;color:#0f172a;">${phone}</strong>
            </td></tr>` : ''}
            <tr><td style="padding:12px 0 0 0;">
              <span style="font-size:12px;color:#64748b;">Mensaje</span><br>
              <p style="font-size:14px;color:#374151;margin:6px 0 0 0;line-height:1.6;">${message}</p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <span style="font-size:11px;color:#94a3b8;">Formulario de contacto · flexio.cl</span>
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
        from: `Flexio Web <${FROM_EMAIL}>`,
        to: [ADMIN_EMAIL],
        reply_to: email,
        subject: `Nuevo contacto: ${name}${company ? ` — ${company}` : ''}`,
        html,
      }),
    });

    // Email de confirmación al contacto
    const confirmHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="500" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
          <strong style="font-size:17px;color:#0f172a;">flex</strong><strong style="font-size:17px;color:#2563eb;">io</strong>
        </td></tr>
        <tr><td style="padding:32px 28px;">
          <p style="font-size:16px;color:#0f172a;font-weight:600;margin:0 0 12px 0;">
            Hola ${name},
          </p>
          <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px 0;">
            Gracias por contactarnos. Hemos recibido tu mensaje correctamente.
          </p>
          <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px 0;">
            Nuestro equipo revisará tu solicitud y te contactaremos a la brevedad por email o teléfono.
          </p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:20px 0;">
            <p style="font-size:12px;color:#64748b;margin:0 0 4px 0;">Mientras tanto, puedes conocer más sobre nuestro servicio en:</p>
            <a href="https://flexio.cl" style="font-size:14px;color:#2563eb;font-weight:600;text-decoration:none;">flexio.cl</a>
          </div>
          <p style="font-size:14px;color:#374151;margin:0;">
            Saludos,<br>
            <strong>Equipo Flexio</strong>
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
        to: [email],
        subject: 'Gracias por contactarnos — Flexio',
        html: confirmHtml,
      }),
    });

    return res.status(200).json({ message: 'Mensaje enviado' });
  } catch (error) {
    return res.status(200).json({ message: 'Mensaje recibido' });
  }
};
