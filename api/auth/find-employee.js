const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * POST /api/auth/find-employee
 * Busca un empleado por RUT en todas las empresas activas.
 * Retorna el slug del tenant y el método de marcaje recomendado.
 * 
 * Body: { rut: "17339278" } (sin puntos ni guión)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();

  try {
    const { rut } = req.body;

    if (!rut) {
      return res.status(400).json({ error: 'RUT es obligatorio' });
    }

    // Limpiar RUT (quitar puntos, guiones, espacios)
    const cleanRut = rut.replace(/[.\-\s]/g, '').toUpperCase();

    // Buscar empleado en cualquier tenant activo
    const results = await sql(`
      SELECT e.id, e.rut, e.first_name, e.last_name, e.photo_url, e.personal_pin,
             t.slug, t.name as tenant_name
      FROM employees e
      JOIN tenants t ON e.tenant_id = t.id
      WHERE REPLACE(REPLACE(e.rut, '.', ''), '-', '') = $1
        AND e.active = true
        AND t.active = true
    `, [cleanRut]);

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
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
