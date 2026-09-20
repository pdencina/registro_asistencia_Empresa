const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { rateLimit } = require('../lib/rateLimit');
const { getActivePolicy } = require('../lib/policy');
const { consumeResetToken, setCredential, validatePinFormat, logAttempt } = require('../lib/credentials');
const { sendSystemEmail, escapeHtml, formatChileDateTime } = require('../lib/mailer');

/**
 * POST /api/auth/set-pin
 * El trabajador crea su PIN con el enlace de un solo uso que recibió por correo.
 * Body: { token, pin }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (rateLimit(req, res, { maxAttempts: 10, windowMs: 60000, keyPrefix: 'set-pin' })) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const { token, pin } = req.body || {};
  if (!token || !pin) return res.status(400).json({ error: 'Enlace y PIN son obligatorios' });

  const sql = getDb();
  try {
    const policy = await getActivePolicy(sql, tenant.id);
    const format = validatePinFormat(String(pin), { minLength: policy.pin_min_length });
    // El formato se valida ANTES de consumir el enlace: un PIN mal escrito no lo gasta
    if (!format.ok) return res.status(422).json({ code: 'PIN_FORMAT', error: format.reason });

    const grant = await consumeResetToken(sql, token, tenant.id);
    if (!grant) {
      return res.status(410).json({ code: 'LINK_INVALID', error: 'El enlace no es válido o ya venció. Pide uno nuevo a tu empleador.' });
    }

    const [employee] = await sql(
      'SELECT id, first_name, email FROM employees WHERE id = $1 AND tenant_id = $2 AND active = true',
      [grant.employee_id, tenant.id]
    );
    if (!employee) return res.status(410).json({ code: 'LINK_INVALID', error: 'El enlace no es válido.' });

    await setCredential(sql, { tenantId: tenant.id, employeeId: employee.id, pin: String(pin), setBy: 'WORKER' });
    await logAttempt(sql, { tenantId: tenant.id, employeeId: employee.id, method: 'PIN', outcome: 'PIN_CREATED', channel: 'SELF_SERVICE' });

    if (employee.email) {
      await sendSystemEmail({
        to: employee.email,
        subject: 'Tu PIN de marcación fue creado',
        html: `<div style="font-family:sans-serif;padding:20px;max-width:480px">
          <p>Hola <strong>${escapeHtml(employee.first_name)}</strong>,</p>
          <p>Tu PIN de marcación de <strong>${escapeHtml(tenant.name)}</strong> fue <strong>creado correctamente</strong> el ${escapeHtml(formatChileDateTime())}.</p>
          <p style="color:#666;font-size:13px">Si no fuiste tú, avisa de inmediato a tu empleador.</p></div>`,
      });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[set-pin]', error.message); // nunca se registra el cuerpo (contiene el PIN)
    return res.status(500).json({ error: 'Error interno' });
  }
};
