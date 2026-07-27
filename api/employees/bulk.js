const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

/**
 * POST /api/employees/bulk
 * 
 * Bulk import employees from a JSON array (parsed from CSV on frontend).
 * Body: { employees: [{ first_name, last_name, rut, email, department, position }] }
 * 
 * Returns: { created, skipped, errors }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();
  const { employees } = req.body;

  if (!employees || !Array.isArray(employees) || employees.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de empleados' });
  }

  if (employees.length > 500) {
    return res.status(400).json({ error: 'Máximo 500 empleados por importación' });
  }

  const results = { created: 0, skipped: 0, errors: [] };

  // Get existing RUTs to avoid duplicates
  const existingEmps = await sql(
    'SELECT rut FROM employees WHERE tenant_id = $1 AND active = true',
    [tenant.id]
  );
  const existingRuts = new Set(
    existingEmps.map(e => e.rut?.replace(/[.\-\s]/g, '').toLowerCase()).filter(Boolean)
  );

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    const row = i + 1;

    // Validate required fields
    if (!emp.first_name || !emp.first_name.trim()) {
      results.errors.push({ row, error: 'Nombre es obligatorio', data: emp });
      continue;
    }
    if (!emp.last_name || !emp.last_name.trim()) {
      results.errors.push({ row, error: 'Apellido es obligatorio', data: emp });
      continue;
    }

    // Check duplicate RUT
    const cleanRut = emp.rut ? emp.rut.replace(/[.\-\s]/g, '').toLowerCase() : '';
    if (cleanRut && existingRuts.has(cleanRut)) {
      results.skipped++;
      results.errors.push({ row, error: `RUT ${emp.rut} ya existe`, data: emp });
      continue;
    }

    // Generate consent token
    const consentToken = require('crypto').randomUUID().replace(/-/g, '').slice(0, 20);

    try {
      await sql(`
        INSERT INTO employees (id, tenant_id, first_name, last_name, rut, email, department, position, consent_token, consent_status, active, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'pending', true, NOW(), NOW())
      `, [
        tenant.id,
        emp.first_name.trim(),
        emp.last_name.trim(),
        emp.rut?.trim() || null,
        emp.email?.trim() || null,
        emp.department?.trim() || null,
        emp.position?.trim() || null,
        consentToken,
      ]);

      results.created++;
      if (cleanRut) existingRuts.add(cleanRut);
    } catch (err) {
      results.errors.push({ row, error: err.message, data: emp });
    }
  }

  return res.status(200).json({
    ok: true,
    total: employees.length,
    created: results.created,
    skipped: results.skipped,
    errors: results.errors.length > 0 ? results.errors.slice(0, 20) : undefined,
    message: `${results.created} colaboradores creados${results.skipped > 0 ? `, ${results.skipped} omitidos (RUT duplicado)` : ''}${results.errors.length > 0 ? `, ${results.errors.length} errores` : ''}`,
  });
};
