const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

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

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

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
