const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * POST /api/superadmin/auth
 * Autentica al super admin con la clave secreta.
 * Retorna un token simple (el mismo secret hasheado) para las siguientes requests.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { secret } = req.body;
  const GLOBAL_SECRET = process.env.GLOBAL_ADMIN_SECRET;

  if (!GLOBAL_SECRET) {
    return res.status(500).json({ error: 'GLOBAL_ADMIN_SECRET no configurado' });
  }

  if (secret !== GLOBAL_SECRET) {
    return res.status(401).json({ error: 'Clave incorrecta' });
  }

  // Token simple: base64 del secret + timestamp (en producción usar JWT)
  const token = Buffer.from(`${GLOBAL_SECRET}:${Date.now()}`).toString('base64');

  return res.status(200).json({ token, message: 'Autenticado' });
};
