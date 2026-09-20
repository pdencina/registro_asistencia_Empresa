const { timingSafeEqual } = require('crypto');
const { getDb } = require('./db');
const { verify } = require('./session');

function getBearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

/** Comparación de secretos en tiempo constante. */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Exige una sesión de administrador de empresa.
 * El tenant sale del token firmado, NUNCA de headers ni query del cliente.
 * Retorna el tenant (misma forma que requireTenant) o responde 401/403 y retorna null.
 *
 * Uso: const tenant = await requireAuth(req, res, { roles: ['admin'] }); if (!tenant) return;
 * La sesión queda disponible en req.session.
 */
async function requireAuth(req, res, { roles } = {}) {
  const session = verify(getBearer(req));
  if (!session || session.typ !== 'admin') {
    res.setHeader('X-Session-Expired', '1');
    res.status(401).json({ error: 'Sesión no válida o expirada. Inicia sesión nuevamente.' });
    return null;
  }

  if (roles && !roles.includes(session.role)) {
    res.status(403).json({ error: 'No tienes permisos para esta acción.' });
    return null;
  }

  const sql = getDb();
  const [tenant] = await sql('SELECT * FROM tenants WHERE id = $1 AND active = true', [session.tid]);
  if (!tenant) {
    res.setHeader('X-Session-Expired', '1');
    res.status(401).json({ error: 'Empresa inactiva o no encontrada.' });
    return null;
  }

  req.session = session;
  return tenant;
}

/** true si la request trae un token de superadmin válido (o el secreto directo por header). */
function isSuperAdmin(req) {
  const session = verify(getBearer(req));
  if (session && session.typ === 'superadmin') return true;

  const secret = process.env.GLOBAL_ADMIN_SECRET;
  const direct = req.headers['x-admin-secret'];
  return !!(secret && direct && safeEqual(direct, secret));
}

/** Responde 401 y retorna false si no es superadmin. */
function requireSuperAdmin(req, res) {
  if (isSuperAdmin(req)) return true;
  res.status(401).json({ error: 'No autorizado' });
  return false;
}

/** Llamada de cron: Vercel envía "Authorization: Bearer $CRON_SECRET" cuando CRON_SECRET está definido. */
function isCronCaller(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) return safeEqual(getBearer(req), cronSecret);
  // Sin CRON_SECRET configurado se acepta el user-agent de Vercel (spoofeable).
  // Definir CRON_SECRET en Vercel elimina esta excepción.
  return String(req.headers['user-agent'] || '').startsWith('vercel-cron/');
}

/**
 * Acceso a trabajos programados (alertas, resúmenes).
 * - cron o superadmin: alcance de plataforma (todas las empresas)
 * - sesión de admin: solo su propia empresa
 * Retorna { scope: 'platform' } | { scope: 'tenant', tenant } o responde 401 y retorna null.
 */
async function requireJobAccess(req, res) {
  if (isCronCaller(req) || isSuperAdmin(req)) return { scope: 'platform' };
  const tenant = await requireAuth(req, res);
  if (!tenant) return null;
  return { scope: 'tenant', tenant };
}

module.exports = { requireAuth, requireSuperAdmin, requireJobAccess, isSuperAdmin, isCronCaller, safeEqual, getBearer };
