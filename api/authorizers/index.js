const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireAuth } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireAuth(req, res);
  if (!tenant) return;

  const sql = getDb();

  await sql(`
    CREATE TABLE IF NOT EXISTS authorizers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(200) NOT NULL,
      position VARCHAR(100),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await sql('ALTER TABLE authorizers ADD COLUMN IF NOT EXISTS tenant_id UUID');

  try {
    if (req.method === 'GET') {
      const authorizers = await sql('SELECT * FROM authorizers WHERE active = true AND (tenant_id = $1 OR tenant_id IS NULL) ORDER BY name', [tenant.id]);
      return res.status(200).json(authorizers);
    }

    if (req.method === 'POST') {
      const { name, position } = req.body;
      if (!name) return res.status(400).json({ error: 'Nombre es requerido' });

      const [authorizer] = await sql(`
        INSERT INTO authorizers (id, name, position, active, tenant_id)
        VALUES (gen_random_uuid(), $1, $2, true, $3)
        RETURNING *
      `, [name, position || null, tenant.id]);

      return res.status(201).json(authorizer);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql('UPDATE authorizers SET active = false WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)', [id, tenant.id]);
      return res.status(200).json({ message: 'Autorizador eliminado' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
