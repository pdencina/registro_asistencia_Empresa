const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

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

  try {
    if (req.method === 'GET') {
      const authorizers = await sql('SELECT * FROM authorizers WHERE active = true ORDER BY name');
      return res.status(200).json(authorizers);
    }

    if (req.method === 'POST') {
      const { name, position } = req.body;
      if (!name) return res.status(400).json({ error: 'Nombre es requerido' });

      const [authorizer] = await sql(`
        INSERT INTO authorizers (id, name, position, active)
        VALUES (gen_random_uuid(), $1, $2, true)
        RETURNING *
      `, [name, position || null]);

      return res.status(201).json(authorizer);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      await sql('UPDATE authorizers SET active = false WHERE id = $1', [id]);
      return res.status(200).json({ message: 'Autorizador eliminado' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
