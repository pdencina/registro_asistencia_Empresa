const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

/**
 * /api/users
 * Manage admin users for a tenant (roles: admin, rrhh, supervisor, jefe_area).
 * 
 * Roles:
 * - admin: Full access (default, main admin)
 * - rrhh: Reports, justifications, leaves, warnings. No settings.
 * - jefe_area: Only sees their department's employees and attendance.
 * - supervisor: Read-only attendance view.
 */

const VALID_ROLES = ['admin', 'rrhh', 'jefe_area', 'supervisor'];

const ROLE_LABELS = {
  admin: 'Administrador',
  rrhh: 'Recursos Humanos',
  jefe_area: 'Jefe de Área',
  supervisor: 'Supervisor (solo lectura)',
};

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  // Ensure table exists
  await sql(`
    CREATE TABLE IF NOT EXISTS tenant_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(200) NOT NULL,
      password VARCHAR(200) NOT NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'supervisor',
      department VARCHAR(100),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // GET: List users
  if (req.method === 'GET') {
    const users = await sql(
      'SELECT id, name, email, role, department, active, created_at FROM tenant_users WHERE tenant_id = $1 ORDER BY name',
      [tenant.id]
    );
    return res.status(200).json({ users, roles: ROLE_LABELS });
  }

  // POST: Create user
  if (req.method === 'POST') {
    const { name, email, password, role, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email y password son obligatorios' });
    }
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Rol inválido. Opciones: ${VALID_ROLES.join(', ')}` });
    }

    // Check duplicate email
    const existing = await sql(
      'SELECT id FROM tenant_users WHERE tenant_id = $1 AND email = $2',
      [tenant.id, email.toLowerCase()]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }

    const [user] = await sql(`
      INSERT INTO tenant_users (tenant_id, name, email, password, role, department)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, email, role, department, active, created_at
    `, [tenant.id, name.trim(), email.toLowerCase().trim(), password, role, department || null]);

    return res.status(201).json(user);
  }

  // PUT: Update user
  if (req.method === 'PUT') {
    const { id, name, email, password, role, department, active } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    const setClauses = [];
    const values = [];
    let idx = 1;

    if (name) { setClauses.push(`name = $${idx++}`); values.push(name.trim()); }
    if (email) { setClauses.push(`email = $${idx++}`); values.push(email.toLowerCase().trim()); }
    if (password) { setClauses.push(`password = $${idx++}`); values.push(password); }
    if (role && VALID_ROLES.includes(role)) { setClauses.push(`role = $${idx++}`); values.push(role); }
    if (department !== undefined) { setClauses.push(`department = $${idx++}`); values.push(department || null); }
    if (active !== undefined) { setClauses.push(`active = $${idx++}`); values.push(active); }

    if (setClauses.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    values.push(id, tenant.id);
    await sql(`UPDATE tenant_users SET ${setClauses.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx}`, values);

    return res.status(200).json({ ok: true });
  }

  // DELETE: Remove user
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });
    await sql('DELETE FROM tenant_users WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
