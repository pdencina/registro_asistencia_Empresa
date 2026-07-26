const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { rateLimit } = require('../lib/rateLimit');

/**
 * POST /api/auth/find-employee
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit: 15 attempts per minute per IP
  if (rateLimit(req, res, { maxAttempts: 15, windowMs: 60000, keyPrefix: 'find-emp' })) return;

  const sql = getDb();

  try {
    const { rut, tenant_slug } = req.body;

    if (!rut) {
      return res.status(400).json({ error: 'RUT es obligatorio' });
    }

    // Limpiar RUT (quitar puntos, guiones, espacios)
    const cleanRut = rut.replace(/[.\-\s]/g, '').toUpperCase();

    // Build query - optionally filter by tenant
    let query = `
      SELECT e.id, e.rut, e.first_name, e.last_name, e.photo_url, e.personal_pin, e.department, e.position,
             t.slug, t.name as tenant_name
      FROM employees e
      JOIN tenants t ON e.tenant_id = t.id
      WHERE REPLACE(REPLACE(e.rut, '.', ''), '-', '') = $1
        AND e.active = true
        AND t.active = true
    `;
    const params = [cleanRut];

    if (tenant_slug) {
      query += ' AND t.slug = $2';
      params.push(tenant_slug);
    }

    const results = await sql(query, params);

    if (results.length === 0) {
      return res.status(404).json({ error: 'RUT no encontrado. Verifica con tu administrador.' });
    }

    // Si hay más de una empresa, devolver opciones
    if (results.length > 1) {
      const options = results.map(r => ({
        slug: r.slug,
        tenant_name: r.tenant_name,
        method: (r.personal_pin && !r.photo_url) ? 'pin' : 'mobile',
        employee_name: `${r.first_name} ${r.last_name}`,
      }));
      return res.status(200).json({ multiple: true, options });
    }

    const employee = results[0];

    // Determinar método: si tiene PIN y no tiene foto → PIN, sino → marcaje móvil
    const method = (employee.personal_pin && !employee.photo_url) ? 'pin' : 'mobile';

    return res.status(200).json({
      slug: employee.slug,
      tenant_name: employee.tenant_name,
      method,
      employee_name: `${employee.first_name} ${employee.last_name}`,
      employee: {
        id: employee.id,
        first_name: employee.first_name,
        last_name: employee.last_name,
        rut: employee.rut,
        photo_url: employee.photo_url,
        department: employee.department,
        position: employee.position,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
