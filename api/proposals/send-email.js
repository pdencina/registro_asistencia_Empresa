const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');

/**
 * POST /api/proposals/send-email
 * Envía la propuesta comercial por email al contacto del cliente.
 * Body: { reference }
 * Header: Authorization Bearer (super admin)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verificar super admin
  const GLOBAL_SECRET = process.env.GLOBAL_ADMIN_SECRET;
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  let isAdmin = false;
  if (GLOBAL_SECRET) {
    if (auth === GLOBAL_SECRET) isAdmin = true;
    else { try { isAdmin = Buffer.from(auth, 'base64').toString('utf8').startsWith(GLOBAL_SECRET + ':'); } catch {} }
  }
  if (!isAdmin) return res.status(401).json({ error: 'No autorizado' });

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email no configurado' });

  const sql = getDb();

  try {
    const { reference } = req.body;
    if (!reference) return res.status(400).json({ error: 'reference es obligatorio' });

    const [p] = await sql('SELECT * FROM proposals WHERE reference = $1', [reference]);
    if (!p) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (!p.contact_email) return res.status(400).json({ error: 'La propuesta no tiene email de contacto' });

    // Calcular precio
    const rawMonthly = p.num_employees * p.price_per_user;
    const monthlyNet = Math.max(rawMonthly, p.minimum_monthly);
    const discounted = p.discount_percent > 0 ? Math.round(monthlyNet * (1 - p.discount_percent / 100)) : monthlyNet;
    const monthlyIva = Math.round(discounted * 1.19);
    const fmt = (v) => '$' + Math.round(v).toLocaleString('es-CL');

    const planNombre = p.num_employees <= 30 ? 'Básico' : p.num_employees <= 100 ? 'Profesional' : p.num_employees <= 300 ? 'Enterprise' : 'Corporativo';
    const link = `https://www.flexio.cl/propuesta/${reference}`;
    const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:32px 28px;text-align:center;">
          <span style="color:#fff;font-size:22px;font-weight:800;">flex<span style="color:#93c5fd;">io</span></span>
          <p style="color:#bfdbfe;font-size:13px;margin:8px 0 0;">Propuesta Comercial</p>
        </td></tr>
        <tr><td style="padding:32px 28px;">
          <p style="font-size:16px;color:#0f172a;font-weight:600;margin:0 0 6px;">Hola${p.contact_name ? ' ' + p.contact_name : ''},</p>
          <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px;">
            Preparamos una propuesta de control de asistencia para <strong>${p.company_name}</strong>. Aquí el resumen:
          </p>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin:0 0 20px;">
            <p style="font-size:12px;color:#2563eb;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin:0 0 6px;">Plan ${planNombre}</p>
            <p style="font-size:32px;font-weight:800;color:#2563eb;margin:0;">${fmt(monthlyIva)}</p>
            <p style="font-size:12px;color:#64748b;margin:2px 0 0;">mensual · IVA incluido · para ${p.num_employees} colaboradores</p>
          </div>
          <div style="text-align:center;margin:24px 0;">
            <a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;">Ver propuesta completa</a>
          </div>
          <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0;">
            Contrato mínimo de 6 meses con renovación automática. Implementación asistida el mismo día. En el link puedes ver el detalle y aceptar la propuesta en línea.
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="font-size:11px;color:#94a3b8;margin:0;">Flexio Technologies SpA · +56 9 4961 6038 · flexio.cl</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const resend = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Flexio <${FROM_EMAIL}>`,
        to: [p.contact_email],
        reply_to: 'pablo@flexio.cl',
        subject: `Propuesta Flexio para ${p.company_name}`,
        html,
      }),
    });

    if (!resend.ok) {
      const errBody = await resend.text();
      return res.status(500).json({ error: 'Error al enviar email', details: errBody });
    }

    // Marcar como enviada
    await sql("UPDATE proposals SET status = 'sent', updated_at = NOW() WHERE id = $1", [p.id]);

    return res.status(200).json({ ok: true, message: `Propuesta enviada a ${p.contact_email}` });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
