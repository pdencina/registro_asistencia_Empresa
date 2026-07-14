const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

/**
 * /api/auth/users - Manage tenant users with roles
 * Roles: admin (full), supervisor (team view, no config), rrhh (people data, no config)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  // Ensure table exists
  await sql(`
    CREATE TABLE IF NOT EXISTS tenant_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      email VARCHAR(200) NOT NULL,
      password VARCHAR(200) NOT NULL,
      name VARCHAR(200),
      role VARCHAR(20) NOT NULL DEFAULT 'supervisor',
      department VARCHAR(100),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  try {
    // GET: List users for this tenant
    if (req.method === 'GET') {
      const users = await sql(
        'SELECT id, email, name, role, department, active, created_at FROM tenant_users WHERE tenant_id = $1 ORDER BY role, name',
        [tenant.id]
      );

      // Include the main admin
      const allUsers = [
        { id: 'main-admin', email: tenant.admin_email, name: 'Administrador Principal', role: 'admin', department: null, active: true, is_main: true },
        ...users,
      ];

      return res.status(200).json(allUsers);
    }

    // POST: Create a new user
    if (req.method === 'POST') {
      const { email, password, name, role, department } = req.body;

      if (!email || !password || !role) {
        return res.status(400).json({ error: 'Email, contraseña y rol son obligatorios' });
      }

      const validRoles = ['supervisor', 'rrhh'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Rol debe ser "supervisor" o "rrhh"' });
      }

      // Check unique email within tenant
      const existing = await sql('SELECT id FROM tenant_users WHERE tenant_id = $1 AND email = $2', [tenant.id, email.toLowerCase()]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
      }

      const [user] = await sql(`
        INSERT INTO tenant_users (tenant_id, email, password, name, role, department)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, name, role, department
      `, [tenant.id, email.toLowerCase(), password, name || null, role, department || null]);

      return res.status(201).json(user);
    }

    // DELETE: Remove user
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id es obligatorio' });
      await sql('DELETE FROM tenant_users WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      return res.status(200).json({ message: 'Usuario eliminado' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
