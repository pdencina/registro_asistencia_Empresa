const { createHmac, timingSafeEqual } = require('crypto');

/**
 * Tokens de sesión firmados (HS256 mínimo, sin dependencias).
 * Formato: base64url(header).base64url(payload).base64url(firma)
 *
 * La clave se toma de SESSION_SECRET y, si no existe, se deriva de
 * TIMESTAMP_SECRET o GLOBAL_ADMIN_SECRET (ya presentes en producción),
 * con una etiqueta de dominio para que no coincida con otros usos.
 */

const HEADER = { alg: 'HS256', typ: 'JWT' };
const ADMIN_TTL_SECONDS = 12 * 60 * 60;
const SUPERADMIN_TTL_SECONDS = 4 * 60 * 60;

function getKey() {
  const base = process.env.SESSION_SECRET || process.env.TIMESTAMP_SECRET || process.env.GLOBAL_ADMIN_SECRET;
  if (!base) return null;
  return createHmac('sha256', base).update('flexio-session-v1').digest();
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload, ttlSeconds) {
  const key = getKey();
  if (!key) throw new Error('No hay secreto configurado para firmar sesiones');
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const data = `${b64(JSON.stringify(HEADER))}.${b64(JSON.stringify(body))}`;
  const sig = createHmac('sha256', key).update(data).digest();
  return `${data}.${b64(sig)}`;
}

/** Devuelve el payload si la firma y la expiración son válidas; si no, null. */
function verify(token) {
  const key = getKey();
  if (!key || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const expected = createHmac('sha256', key).update(`${parts[0]}.${parts[1]}`).digest();
  let given;
  try { given = Buffer.from(parts[2], 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function signAdminSession({ tenantId, slug, role, email }) {
  return sign({ typ: 'admin', tid: tenantId, slug, role, email }, ADMIN_TTL_SECONDS);
}

function signSuperAdminSession() {
  return sign({ typ: 'superadmin' }, SUPERADMIN_TTL_SECONDS);
}

module.exports = { sign, verify, signAdminSession, signSuperAdminSession, ADMIN_TTL_SECONDS };
