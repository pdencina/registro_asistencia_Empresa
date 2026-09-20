/**
 * CORS con lista de orígenes permitidos.
 * El frontend y la API comparten origen, así que las llamadas normales no necesitan CORS;
 * esto solo habilita dominios propios, previews de Vercel y localhost (desarrollo).
 */
const ALLOWED_ORIGIN = /^https:\/\/(([a-z0-9-]+\.)*flexio\.cl|[a-z0-9-]+\.vercel\.app)$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

const ALLOW_METHODS = 'GET, POST, PUT, DELETE, OPTIONS';
const ALLOW_HEADERS = 'Content-Type, Authorization, x-tenant-slug, x-tenant-id, x-admin-secret, x-dt-token';

function corsHeaders(origin) {
  const headers = {
    'Access-Control-Allow-Methods': ALLOW_METHODS,
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    Vary: 'Origin',
  };
  if (origin && ALLOWED_ORIGIN.test(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function handleCors(req, res) {
  const headers = corsHeaders(req.headers && req.headers.origin);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

module.exports = { corsHeaders, handleCors, ALLOWED_ORIGIN };
