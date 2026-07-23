const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const sql = getDb();

  // GET: Obtener datos del empleado por token (para mostrar en la página de consentimiento)
  if (req.method === 'GET') {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Token requerido' });
    }

    try {
      const [employee] = await sql(`
        SELECT e.id, e.first_name, e.last_name, e.rut, e.department, e.position, e.photo_url, e.consent_status, e.email,
               t.name as tenant_name, t.logo_url as tenant_logo, t.slug as tenant_slug
        FROM employees e
        JOIN tenants t ON e.tenant_id = t.id
        WHERE e.consent_token = $1 AND e.active = true
      `, [token]);

      if (!employee) {
        return res.status(404).json({ error: 'Token inválido o expirado' });
      }

      if (employee.consent_status === 'approved') {
        return res.status(200).json({
          already_approved: true,
          employee: {
            first_name: employee.first_name,
            last_name: employee.last_name,
            tenant_name: employee.tenant_name,
            tenant_slug: employee.tenant_slug,
          },
        });
      }

      return res.status(200).json({
        already_approved: false,
        employee: {
          first_name: employee.first_name,
          last_name: employee.last_name,
          rut: employee.rut,
          department: employee.department,
          position: employee.position,
          photo_url: employee.photo_url,
          tenant_name: employee.tenant_name,
          tenant_logo: employee.tenant_logo,
          tenant_slug: employee.tenant_slug,
        },
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST: Aprobar o rechazar el consentimiento
  if (req.method === 'POST') {
    const { token, action, photo } = req.body;

    if (!token || !action) {
      return res.status(400).json({ error: 'Token y acción son requeridos' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Acción debe ser "approve" o "reject"' });
    }

    try {
      const [employee] = await sql(
        'SELECT id, consent_status, tenant_id FROM employees WHERE consent_token = $1 AND active = true',
        [token]
      );

      if (!employee) {
        return res.status(404).json({ error: 'Token inválido o expirado' });
      }

      if (employee.consent_status === 'approved') {
        return res.status(409).json({ error: 'El consentimiento ya fue otorgado anteriormente' });
      }

      const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'desconocida';
      const timestamp = new Date().toISOString();
      const status = action === 'approve' ? 'approved' : 'rejected';

      // If approving with photo, upload it
      let photoUrl = null;
      if (action === 'approve' && photo) {
        try {
          const { put } = require('@vercel/blob');
          const buffer = Buffer.from(photo.replace(/^data:image\/\w+;base64,/, ''), 'base64');
          const [tenant] = await sql('SELECT slug FROM tenants WHERE id = $1', [employee.tenant_id]);
          const blob = await put(`employees/${tenant?.slug || 'default'}/${require('crypto').randomUUID()}.jpg`, buffer, {
            access: 'public',
            contentType: 'image/jpeg',
          });
          photoUrl = blob.url;
        } catch (e) {
          console.error('Error uploading consent photo:', e);
        }
      }

      // Update employee
      if (photoUrl) {
        await sql(`
          UPDATE employees SET consent_status = $1, consent_at = $2, consent_ip = $3, photo_url = $4, updated_at = NOW()
          WHERE consent_token = $5
        `, [status, timestamp, typeof ip === 'string' ? ip.split(',')[0].trim() : 'desconocida', photoUrl, token]);
      } else {
        await sql(`
          UPDATE employees SET consent_status = $1, consent_at = $2, consent_ip = $3, updated_at = NOW()
          WHERE consent_token = $4
        `, [status, timestamp, typeof ip === 'string' ? ip.split(',')[0].trim() : 'desconocida', token]);
      }

      // Enviar email de confirmación al trabajador
      const [empData] = await sql(`
        SELECT e.first_name, e.last_name, e.email, t.name as tenant_name
        FROM employees e JOIN tenants t ON e.tenant_id = t.id
        WHERE e.consent_token = $1
      `, [token]);

      if (empData?.email) {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        if (RESEND_API_KEY) {
          const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.NOTIFICATION_FROM_EMAIL || 'notificaciones@flexio.cl';
          const isApproved = status === 'approved';
          const fechaStr = new Date(timestamp).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

          const confirmHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <tr><td style="background:${isApproved ? '#059669' : '#6b7280'};padding:30px;text-align:center;">
          <h1 style="color:#ffffff;font-size:22px;margin:0;">${isApproved ? 'Autorización Confirmada' : 'Consentimiento Rechazado'}</h1>
          <p style="color:${isApproved ? '#d1fae5' : '#d1d5db'};font-size:14px;margin:8px 0 0 0;">Flexio · ${empData.tenant_name}</p>
        </td></tr>
        <tr><td style="padding:35px;">
          <p style="font-size:16px;color:#374151;margin:0 0 20px 0;">
            Hola <strong>${empData.first_name} ${empData.last_name}</strong>,
          </p>
          ${isApproved ? `
          <p style="font-size:14px;color:#6b7280;margin:0 0 16px 0;">
            Gracias por confirmar tu identidad y autorizar el uso de tu dato biométrico facial en <strong>${empData.tenant_name}</strong>.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:20px 0;">
            <p style="font-size:13px;color:#166534;margin:0 0 8px 0;font-weight:600;">Registro de tu decisión</p>
            <p style="font-size:12px;color:#14532d;margin:0;line-height:1.8;">
              <strong>Acción:</strong> Autorización de uso de reconocimiento facial<br>
              <strong>Fecha:</strong> ${fechaStr}<br>
              <strong>IP:</strong> ${typeof ip === 'string' ? ip.split(',')[0].trim() : 'registrada'}<br>
              <strong>Empresa:</strong> ${empData.tenant_name}
            </p>
          </div>
          <p style="font-size:13px;color:#6b7280;margin:16px 0 0 0;">
            Esta decisión fue tomada de forma voluntaria, libre e informada por ti. El uso de tu dato biométrico es tu responsabilidad y puede ser revocado en cualquier momento contactando a tu empleador.
          </p>
          <p style="font-size:13px;color:#374151;margin:16px 0 0 0;font-weight:600;">
            Ya puedes marcar asistencia con tu rostro.
          </p>
          ` : `
          <p style="font-size:14px;color:#6b7280;margin:0 0 16px 0;">
            Hemos registrado que no autorizas el uso de tu dato biométrico facial. Se te asignará un <strong>PIN personal</strong> como método alternativo para registrar asistencia.
          </p>
          <p style="font-size:13px;color:#6b7280;margin:16px 0 0 0;">
            Si cambias de opinión en el futuro, contacta al administrador de tu empresa.
          </p>
          `}
        </td></tr>
        <tr><td style="padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Este correo es un comprobante de tu decisión. Consérvalo para tus registros.</p>
          <p style="font-size:11px;color:#d1d5db;margin:5px 0 0 0;">Flexio · flexio.cl</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: `Flexio <${FROM_EMAIL}>`,
              to: [empData.email],
              subject: isApproved
                ? `Autorización confirmada — ${empData.tenant_name}`
                : `Consentimiento registrado — ${empData.tenant_name}`,
              html: confirmHtml,
            }),
          }).catch(err => console.error('Error enviando email confirmación consentimiento:', err));
        }
      }

      return res.status(200).json({
        ok: true,
        status,
        message: status === 'approved'
          ? 'Consentimiento otorgado. Ya puedes usar el reconocimiento facial.'
          : 'Has rechazado el uso de datos biométricos. Podrás marcar asistencia con PIN.',
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
