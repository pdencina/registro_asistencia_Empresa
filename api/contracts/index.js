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

    // Asegurar que la tabla contracts existe
    await sql(`
      CREATE TABLE IF NOT EXISTS contracts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        plan VARCHAR(50) NOT NULL,
        modalidad VARCHAR(20) NOT NULL DEFAULT 'mensual',
        precio INTEGER,
        firmante_nombre VARCHAR(200),
        firmante_rut VARCHAR(20),
        firmante_email VARCHAR(200),
        firma_digital TEXT,
        firmado_at TIMESTAMPTZ,
        auditoria_firma JSONB,
        estado VARCHAR(20) DEFAULT 'pendiente',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

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
