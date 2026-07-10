const { getDb } = require('./db');

/**
 * Extrae el tenant desde la ruta, subdominio o header x-tenant-id.
 * Prioridad: header x-tenant-id > header x-tenant-slug > subdominio > query param
 * Ejemplo: flexio.cl/app/acme -> slug = "acme"
 */
async function getTenant(req) {
  const sql = getDb();

  // 1. Header explícito por ID (desarrollo / API)
  const headerTenantId = req.headers['x-tenant-id'];
  if (headerTenantId) {
    const rows = await sql(
      'SELECT * FROM tenants WHERE id = $1 AND active = true',
      [headerTenantId]
    );
    return rows[0] || null;
  }

  // 2. Header x-tenant-slug (desde frontend por ruta)
  const headerSlug = req.headers['x-tenant-slug'];
  if (headerSlug) {
    const rows = await sql(
      'SELECT * FROM tenants WHERE slug = $1 AND active = true',
      [headerSlug]
    );
    return rows[0] || null;
  }

  // 3. Subdominio (si tienen wildcard DNS configurado)
  const host = req.headers.host || '';
  const parts = host.split('.');

  if (parts.length >= 3) {
    const slug = parts[0];
    if (slug !== 'www' && slug !== 'app') {
      const rows = await sql(
        'SELECT * FROM tenants WHERE slug = $1 AND active = true',
        [slug]
      );
      if (rows[0]) return rows[0];
    }
  }

  // 4. Query param (fallback para dev)
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
 * Middleware que requiere tenant. Retorna el tenant o responde 401.
 * Uso: const tenant = await requireTenant(req, res); if (!tenant) return;
 */
async function requireTenant(req, res) {
  const tenant = await getTenant(req);
  if (!tenant) {
    res.status(401).json({ 
      error: 'Empresa no identificada. Verifica la URL o contacta al administrador.' 
    });
    return null;
  }
  return tenant;
}

module.exports = { getTenant, requireTenant };
