const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { rateLimit } = require('../lib/rateLimit');
const { getActivePolicy } = require('../lib/policy');
const { verifyPinForEmployee, setCredential, validatePinFormat, logAttempt } = require('../lib/credentials');
const { sendSystemEmail, escapeHtml, formatChileDateTime } = require('../lib/mailer');

/**
 * POST /api/auth/change-pin
 * El trabajador cambia su propio PIN a su elección (Res. Ex. N.º 38, Art. 7 f).
 * Body: { rut, current_pin, new_pin }
 *
 * - Verifica el PIN actual con el mismo bloqueo por intentos que el marcaje.
 * - El nuevo PIN se guarda solo como hash.
 * - Envía un correo automático con el resultado, fecha y hora (Art. 7 f).
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (rateLimit(req, res, { maxAttempts: 10, windowMs: 60000, keyPrefix: 'change-pin' })) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const { rut, current_pin, new_pin } = req.body || {};
  if (!rut || !current_pin || !new_pin) return res.status(400).json({ error: 'RUT, PIN actual y PIN nuevo son obligatorios' });

  const sql = getDb();
  try {
    const policy = await getActivePolicy(sql, tenant.id);
    const format = validatePinFormat(String(new_pin), { minLength: policy.pin_min_length });
    if (!format.ok) return res.status(422).json({ code: 'PIN_FORMAT', error: format.reason });

    const rutClean = String(rut).replace(/[.\-\s]/g, '').toLowerCase();
    const [employee] = await sql(
      `SELECT * FROM employees WHERE REPLACE(REPLACE(LOWER(rut), '.', ''), '-', '') = $1 AND tenant_id = $2 AND active = true`,
      [rutClean, tenant.id]
    );
    const generic = () => res.status(401).json({ code: 'INVALID_CREDENTIALS', error: 'RUT o PIN actual incorrectos.' });
    if (!employee) {
      await logAttempt(sql, { tenantId: tenant.id, rut, method: 'PIN', outcome: 'INVALID', reason: 'UNKNOWN_RUT_CHANGE' });
      return generic();
    }

    const check = await verifyPinForEmployee(sql, { tenantId: tenant.id, employee, pin: String(current_pin), policy, ctx: { channel: 'SELF_SERVICE' } });
    if (!check.ok) {
      if (check.outcome === 'LOCKED') return res.status(423).json({ code: 'LOCKED', error: 'Demasiados intentos. Intenta más tarde.', retry_after_seconds: check.retryAfterSeconds });
      return generic();
    }

    await setCredential(sql, { tenantId: tenant.id, employeeId: employee.id, pin: String(new_pin), setBy: 'WORKER' });
    await logAttempt(sql, { tenantId: tenant.id, employeeId: employee.id, method: 'PIN', outcome: 'PIN_CHANGED', channel: 'SELF_SERVICE' });

    let notified = false;
    if (employee.email) {
      const when = formatChileDateTime();
      const out = await sendSystemEmail({
        to: employee.email,
        subject: 'Tu PIN de marcación fue cambiado',
        html: `<div style="font-family:sans-serif;padding:20px;max-width:480px">
          <p>Hola <strong>${escapeHtml(employee.first_name)}</strong>,</p>
          <p>Tu PIN de marcación de <strong>${escapeHtml(tenant.name)}</strong> fue <strong>cambiado correctamente</strong> el ${escapeHtml(when)}.</p>
          <p style="color:#666;font-size:13px">Si no fuiste tú, avisa de inmediato a tu empleador para que lo restablezca.</p></div>`,
      });
      notified = out.sent;
    }
    return res.status(200).json({ ok: true, notified });
  } catch (error) {
    console.error('[change-pin]', error.message); // nunca se registra el cuerpo (contiene PIN)
    return res.status(500).json({ error: 'Error interno' });
  }
};
