const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { verify } = require('../lib/session');
const { getActivePolicy } = require('../lib/policy');
const { rateLimit } = require('../lib/rateLimit');


/**
 * POST /api/auth/create-pin
 * Allows an employee to create or update their personal PIN using their RUT.
 * Body: { rut, pin }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (rateLimit(req, res, { maxAttempts: 10, windowMs: 60000, keyPrefix: 'create-pin' })) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const bearer = (req.headers.authorization || '').replace('Bearer ', '');
  const session = verify(bearer);
  const isTenantAdmin = !!(session && session.typ === 'admin' && session.tid === tenant.id);

  // Con política de marcación activa el PIN solo se crea con el enlace de un solo uso enviado al correo del trabajador
  // (crearlo con solo el RUT permitiría que un tercero se adelante y fije el PIN de otra persona).
  const policy = await getActivePolicy(getDb(), tenant.id);
  if (policy.legacy_marking === false) {
    return res.status(403).json({ code: 'USE_RESET_LINK', error: 'Solicita a tu empleador el enlace para crear tu PIN.' });
  }

  const sql = getDb();

  try {
    const { rut, pin } = req.body;

    if (!rut || !pin) {
      return res.status(400).json({ error: 'RUT y PIN son obligatorios' });
    }

    if (pin.length < 4 || pin.length > 6) {
      return res.status(400).json({ error: 'El PIN debe tener entre 4 y 6 dígitos' });
    }

    if (!/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'El PIN debe ser solo números' });
    }

    // Normalize RUT: remove dots and dashes for comparison
    const rutClean = rut.replace(/[.\-\s]/g, '').toLowerCase();

    // Find employee by RUT in this tenant
    const employees = await sql(
      `SELECT id, first_name, last_name, personal_pin FROM employees 
       WHERE REPLACE(REPLACE(LOWER(rut), '.', ''), '-', '') = $1 
       AND tenant_id = $2 AND active = true`,
      [rutClean, tenant.id]
    );

    if (employees.length === 0) {
      return res.status(404).json({ error: 'No se encontró un colaborador con ese RUT en esta empresa' });
    }

    const employee = employees[0];

    // Solo el primer PIN es autoservicio. Cambiarlo exige un administrador de la empresa.
    if (employee.personal_pin && !isTenantAdmin) {
      return res.status(403).json({ error: 'Ya tienes un PIN creado. Pídele a tu administrador que lo restablezca.' });
    }

    // Check if PIN is already taken by another employee in same tenant
    const existing = await sql(
      'SELECT id FROM employees WHERE personal_pin = $1 AND tenant_id = $2 AND id != $3 AND active = true',
      [pin, tenant.id, employee.id]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: 'Ese PIN ya está en uso. Elige otro.' });
    }

    // Update the employee's PIN
    await sql(
      'UPDATE employees SET personal_pin = $1, updated_at = NOW() WHERE id = $2',
      [pin, employee.id]
    );

    return res.status(200).json({
      ok: true,
      message: `PIN creado exitosamente para ${employee.first_name}`,
      employee: {
        first_name: employee.first_name,
        last_name: employee.last_name,
      },
    });
  } catch (error) {
    console.error('Error creating PIN:', error);
    return res.status(500).json({ error: 'Error interno' });
  }
};
