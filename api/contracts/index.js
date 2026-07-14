const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();

  try {
    const { tenant: tenantSlug } = req.query;

    if (!tenantSlug) {
      return res.status(400).json({ error: 'Se requiere el parámetro tenant (slug)' });
    }

    // Buscar tenant
    const [tenant] = await sql(
      'SELECT id, name, slug, rut_empresa, plan, max_employees, admin_email, created_at FROM tenants WHERE slug = $1 AND active = true',
      [tenantSlug]
    );

    if (!tenant) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    // Buscar contrato existente
    const [contract] = await sql(
      'SELECT * FROM contracts WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
      [tenant.id]
    );

    // Precios por plan
    const precios = {
      basico: 39990,
      profesional: 79990,
      enterprise: 149990,
    };

    return res.status(200).json({
      tenant: {
        name: tenant.name,
        slug: tenant.slug,
        rut_empresa: tenant.rut_empresa,
        plan: tenant.plan,
        max_employees: tenant.max_employees,
        admin_email: tenant.admin_email,
        created_at: tenant.created_at,
      },
      contract: contract ? {
        id: contract.id,
        estado: contract.estado,
        plan: contract.plan,
        modalidad: contract.modalidad,
        precio: contract.precio,
        firmante_nombre: contract.firmante_nombre,
        firmante_rut: contract.firmante_rut,
        firmado_at: contract.firmado_at,
        firma_digital: contract.firma_digital,
      } : null,
      precio_sugerido: precios[tenant.plan] || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
