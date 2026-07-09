const { getDb } = require('./db');

/**
 * Extrae el tenant desde el subdominio o header x-tenant-id.
 * Ejemplo: empresa.flexio.cl -> slug = "empresa"
 * En dev, se puede pasar x-tenant-id como header.
 */
async function getTenant(req) {
  const sql = getDb();

  // 1. Header explícito (desarrollo / API)
  const headerTenantId = req.headers['x-tenant-id'];
  if (headerTenantId) {
    const rows = await sql(
      'SELECT * FROM tenants WHERE id = $1 AND active = true',
      [headerTenantId]
    );
    return rows[0] || null;
  }

  // 2. Subdominio
  const host = req.headers.host || '';
  const parts = host.split('.');

  // empresa.flexio.cl -> parts = ['empresa', 'flexio', 'cl']
  if (parts.length >= 3) {
    const slug = parts[0];
    // Ignorar 'www' y 'app'
    if (slug !== 'www' && slug !== 'app') {
      const rows = await sql(
        'SELECT * FROM tenants WHERE slug = $1 AND active = true',
        [slug]
      );
      return rows[0] || null;
    }
  }

  // 3. Query param (fallback para dev)
  const tenantSlug = req.query?.tenant;
  if (tenantSlug) {
    const rows = await sql(
      'SELECT * FROM tenants WHERE slug = $1 AND active = true',
      [tenantSlug]
    );
    return rows[0] || null;
  }

  return null;
}

/**
 * Middleware que inyecta req.tenant.
 * Retorna 401 si no se puede identificar el tenant.
 */
async function requireTenant(req, res) {
  const tenant = await getTenant(req);
  if (!tenant) {
    res.status(401).json({ error: 'Tenant no identificado. Verifica el subdominio o header x-tenant-id.' });
    return null;
  }
  return tenant;
}

module.exports = { getTenant, requireTenant };
