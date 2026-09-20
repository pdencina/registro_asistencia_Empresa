const { corsHeaders, handleCors } = require('../lib/cors');
const { rateLimit } = require('../lib/rateLimit');
const { safeEqual } = require('../lib/auth');
const { signSuperAdminSession } = require('../lib/session');

/**
 * POST /api/superadmin/auth
 * Autentica al super admin con la clave secreta.
 * Retorna un token firmado con expiración para las siguientes requests.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (rateLimit(req, res, { maxAttempts: 5, windowMs: 60000, keyPrefix: 'superadmin-auth' })) return;

  const { secret } = req.body || {};
  const GLOBAL_SECRET = process.env.GLOBAL_ADMIN_SECRET;

  if (!GLOBAL_SECRET) {
    return res.status(500).json({ error: 'GLOBAL_ADMIN_SECRET no configurado' });
  }

  if (!safeEqual(secret, GLOBAL_SECRET)) {
    return res.status(401).json({ error: 'Clave incorrecta' });
  }

  const token = signSuperAdminSession();

  return res.status(200).json({ token, message: 'Autenticado' });
};
