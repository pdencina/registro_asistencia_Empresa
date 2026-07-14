const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * POST /api/auth/login
 * Login del admin de empresa con email + contraseña.
 * Body: { email, password }
 * Header: x-tenant-slug (opcional, si no se envía busca por email en todos los tenants)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    // Buscar tenant por slug (si viene) o por email
    const slug = req.headers['x-tenant-slug'];
    let tenant;

    if (slug) {
      const rows = await sql(
        'SELECT * FROM tenants WHERE slug = $1 AND active = true',
        [slug]
      );
      tenant = rows[0];
    } else {
      // Buscar por email del admin
      const rows = await sql(
        'SELECT * FROM tenants WHERE admin_email = $1 AND active = true',
        [email.toLowerCase()]
      );
      tenant = rows[0];
    }

    if (!tenant) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // Login exitoso — check if it's the main admin or a tenant_user
    // First try: main admin
    if (tenant.admin_email.toLowerCase() === email.toLowerCase() && tenant.admin_password === password) {
      return res.status(200).json({
        success: true,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        tenant_slug: tenant.slug,
        plan: tenant.plan,
        admin_email: tenant.admin_email,
        role: 'admin',
      });
    }

    // Second try: tenant_users table
    try {
      const [user] = await sql(
        'SELECT * FROM tenant_users WHERE tenant_id = $1 AND email = $2 AND active = true',
        [tenant.id, email.toLowerCase()]
      );
      if (user && user.password === password) {
        return res.status(200).json({
          success: true,
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          tenant_slug: tenant.slug,
          plan: tenant.plan,
          admin_email: user.email,
          role: user.role,
          user_name: user.name,
          user_department: user.department,
        });
      }
    } catch (e) {
      // Table might not exist yet
    }

    return res.status(401).json({ error: 'Credenciales incorrectas' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
