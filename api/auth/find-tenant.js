const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * POST /api/auth/find-tenant
 * Busca el tenant por email del admin y retorna el slug para redirección.
 * Body: { email }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email es obligatorio' });
    }

    const rows = await sql(
      'SELECT slug, name FROM tenants WHERE admin_email = $1 AND active = true',
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No se encontró una empresa con ese email' });
    }

    return res.status(200).json({ slug: rows[0].slug, name: rows[0].name });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
