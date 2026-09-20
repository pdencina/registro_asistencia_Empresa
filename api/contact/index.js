const { corsHeaders, handleCors } = require('../lib/cors');
const { rateLimit } = require('../lib/rateLimit');

/**
 * Calcula el plan y precio según cantidad de colaboradores.
 * Planes fijos hasta 300; sobre 300 tarifa corporativa por trabajador.
 */
function calcularCotizacion(numEmployees) {
  const n = parseInt(numEmployees);
  if (!n || n < 1) return null;

  const fmt = (v) => '$' + Math.round(v).toLocaleString('es-CL');
  const iva = (v) => Math.round(v * 1.19);

  if (n <= 30) {
    return { plan: 'Básico', empleados: n, neto: 39990, total: iva(39990), detalle: 'hasta 30 colaboradores' };
  }
  if (n <= 100) {
    return { plan: 'Profesional', empleados: n, neto: 99990, total: iva(99990), detalle: 'hasta 100 colaboradores' };
  }
  if (n <= 300) {
    return { plan: 'Enterprise', empleados: n, neto: 249990, total: iva(249990), detalle: 'hasta 300 colaboradores' };
  }
  // Corporativo: tarifa por trabajador
  let precioUnit;
  if (n <= 750) precioUnit = 700;
  else if (n <= 1500) precioUnit = 600;
  else if (n <= 3000) precioUnit = 500;
  else return { plan: 'Corporativo', empleados: n, neto: null, total: null, detalle: 'más de 3.000 colaboradores — valor a convenir', porTrabajador: true };
  const neto = n * precioUnit;
  return { plan: 'Corporativo', empleados: n, neto, total: iva(neto), detalle: `${n} trabajadores × ${fmt(precioUnit)} c/u`, precioUnit, porTrabajador: true };
}

/**
 * POST /api/contact
 * Recibe formulario de contacto y envía email al admin.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (rateLimit(req, res, { maxAttempts: 5, windowMs: 60000, keyPrefix: 'contact' })) return;

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return res.status(200).json({ message: 'Mensaje recibido' });
  }

  try {
    const { name, company, email, phone, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ error: 'Nombre, email y mensaje son obligatorios' });
    }

    // Detectar N° de colaboradores desde el mensaje para calcular cotización.
    // El formulario envía rangos ("31-50", "500+"). Usamos el límite superior
    // del rango para cotizar el plan que lo cubre.
    let cotizacion = null;
    const empMatch = message.match(/colaboradores?:\s*([\d\-+]+)/i);
    if (empMatch) {
      const raw = empMatch[1];
      let numParaCotizar;
      if (raw.includes('+')) {
        numParaCotizar = parseInt(raw); // "500+" → 500 (cae en Corporativo/Enterprise)
      } else if (raw.includes('-')) {
        numParaCotizar = parseInt(raw.split('-')[1]); // "31-50" → 50 (límite superior)
      } else {
        numParaCotizar = parseInt(raw);
      }
      cotizacion = calcularCotizacion(numParaCotizar);
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
            ${cotizacion ? `<tr><td style="padding:12px 0 0 0;">
              <span style="font-size:12px;color:#64748b;">Cotización calculada</span><br>
              <p style="font-size:14px;color:#0f172a;margin:6px 0 0 0;"><strong>Plan ${cotizacion.plan}</strong> — ${cotizacion.total ? '$' + cotizacion.total.toLocaleString('es-CL') + ' IVA incl.' : 'a convenir'} (${cotizacion.detalle})</p>
            </td></tr>` : ''}
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
          ${cotizacion ? `
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin:20px 0;">
            <p style="font-size:12px;color:#2563eb;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px 0;">Cotización estimada</p>
            <p style="font-size:15px;color:#0f172a;margin:0 0 4px 0;">Plan <strong>${cotizacion.plan}</strong> · ${cotizacion.detalle}</p>
            ${cotizacion.total ? `
            <p style="font-size:28px;font-weight:800;color:#2563eb;margin:8px 0 2px 0;">$${cotizacion.total.toLocaleString('es-CL')}</p>
            <p style="font-size:12px;color:#64748b;margin:0;">mensual · IVA incluido (neto $${cotizacion.neto.toLocaleString('es-CL')} + IVA)</p>
            ` : `
            <p style="font-size:15px;color:#0f172a;margin:8px 0 0 0;font-weight:600;">Valor a convenir según tu operación</p>
            `}
            <p style="font-size:11px;color:#94a3b8;margin:12px 0 0 0;">Valor referencial. La cotización final se confirma en la reunión. Incluye 15 días de prueba gratis.</p>
          </div>
          ` : ''}
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
