const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireAuth } = require('../lib/auth');
const { revokeCredential, createResetToken } = require('../lib/credentials');
const { logAudit, auditContext } = require('../lib/auditLog');
const { getActivePolicy } = require('../lib/policy');
const { sendSystemEmail, escapeHtml } = require('../lib/mailer');

/**
 * POST /api/auth/reset-pin
 * La administración restablece el PIN de un trabajador. NO puede ver ni fijar el PIN:
 * se invalida el actual y se envía al correo del trabajador un enlace de un solo uso para que cree uno nuevo.
 * Body: { employee_id }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const tenant = await requireAuth(req, res, { roles: ['admin', 'rrhh'] });
  if (!tenant) return;

  const { employee_id } = req.body || {};
  if (!employee_id) return res.status(400).json({ error: 'employee_id es obligatorio' });

  const sql = getDb();
  try {
    // El flujo legado identifica por PIN en texto plano; restablecer con enlace solo aplica al modo con política
    if ((await getActivePolicy(sql, tenant.id)).legacy_marking !== false) {
      return res.status(409).json({ code: 'LEGACY_MODE', error: 'Esta empresa aún usa el flujo legado. Activa la política de marcación para restablecer PIN por enlace.' });
    }

    const [employee] = await sql(
      'SELECT id, first_name, email FROM employees WHERE id = $1 AND tenant_id = $2 AND active = true',
      [employee_id, tenant.id]
    );
    if (!employee) return res.status(404).json({ error: 'Trabajador no encontrado' });

    // Art. 12 y 34: el enlace solo puede llegar al correo personal del trabajador; nunca se le entrega a la administración.
    if (!employee.email) {
      return res.status(409).json({ code: 'EMAIL_REQUIRED', error: 'El trabajador no tiene correo registrado. Regístralo para poder restablecer su PIN.' });
    }
    if (!process.env.RESEND_API_KEY) {
      return res.status(503).json({ code: 'EMAIL_NOT_CONFIGURED', error: 'El envío de correos no está configurado.' });
    }

    // Constancia antes de actuar (si no se puede auditar, no se restablece nada)
    await logAudit({
      ...auditContext(req),
      tenant_id: tenant.id,
      action: 'credential.reset',
      target_type: 'employee',
      target_id: employee.id,
      details: { method: 'PIN', delivery: 'EMAIL_LINK' },
    }, { strict: true });

    const token = await createResetToken(sql, { tenantId: tenant.id, employeeId: employee.id, createdBy: req.session.email });
    const base = process.env.BASE_URL || `https://${process.env.BASE_DOMAIN || 'flexio.cl'}`;
    const link = `${base}/crear-pin/${encodeURIComponent(tenant.slug)}?token=${encodeURIComponent(token)}`;

    const out = await sendSystemEmail({
      to: employee.email,
      subject: 'Crea tu PIN de marcación',
      html: `<div style="font-family:sans-serif;padding:20px;max-width:480px">
        <p>Hola <strong>${escapeHtml(employee.first_name)}</strong>,</p>
        <p>Tu empleador (${escapeHtml(tenant.name)}) restableció tu PIN de marcación. Crea uno nuevo en este enlace (válido por 24 horas y de un solo uso):</p>
        <p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
        <p style="color:#666;font-size:13px">Nadie de tu empresa conoce tu PIN. Si no esperabas este correo, ignóralo.</p></div>`,
    });
    if (!out.sent) return res.status(502).json({ code: 'EMAIL_FAILED', error: 'No se pudo enviar el correo al trabajador.' });

    // Solo después de enviar el enlace se invalida el PIN actual (el trabajador nunca queda sin vía de recuperación)
    await revokeCredential(sql, { tenantId: tenant.id, employeeId: employee.id });
    return res.status(200).json({ ok: true, sent_to_worker_email: true });
  } catch (error) {
    console.error('[reset-pin]', error.message);
    return res.status(500).json({ error: 'Error interno' });
  }
};
