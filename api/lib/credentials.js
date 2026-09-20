const { randomBytes, createHmac, createHash, scryptSync, timingSafeEqual } = require('crypto');

/**
 * Credenciales PIN de los trabajadores (Res. Ex. N.º 38, Art. 7 f y g).
 *
 *  - Nunca se guarda el PIN: solo un hash scrypt con sal individual, calculado sobre HMAC(pepper, pin).
 *    El pepper vive en el entorno (PIN_PEPPER), no en la base de datos: con solo el volcado de la base,
 *    un PIN de 4 dígitos no se puede recuperar por fuerza bruta.
 *  - La administración no puede leerlo ni recuperarlo; solo puede invalidarlo y enviar al trabajador un
 *    enlace de un solo uso para que cree uno nuevo.
 *  - Bloqueo temporal tras N intentos fallidos, con duración creciente. El contador vive en la base de datos.
 *  - Los intentos se registran sin el PIN ingresado.
 */

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;

function getPepper() {
  const explicit = process.env.PIN_PEPPER;
  const base = explicit || process.env.GLOBAL_ADMIN_SECRET || process.env.TIMESTAMP_SECRET;
  if (!base) throw new Error('PIN_PEPPER no está configurado');
  const key = createHmac('sha256', base).update('flexio-pin-pepper-v1').digest();
  return { key, id: createHash('sha256').update(key).digest('hex').slice(0, 8), source: explicit ? 'PIN_PEPPER' : 'DERIVED' };
}

const pinDigest = (pin, pepper) => createHmac('sha256', pepper.key).update(`pin|${pin}`).digest('hex');

/** Formato almacenado: "<keyId>$<salt>:<scrypt>". */
function hashSecret(pin) {
  const pepper = getPepper();
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(pinDigest(pin, pepper), salt, KEYLEN, SCRYPT).toString('hex');
  return `${pepper.id}$${salt}:${derived}`;
}

function verifySecret(pin, stored) {
  const pepper = getPepper();
  const m = /^([0-9a-f]{8})\$([0-9a-f]+):([0-9a-f]+)$/.exec(stored || '');
  if (!m) return { ok: false, malformed: true };
  if (m[1] !== pepper.id) return { ok: false, keyMismatch: true };
  const derived = scryptSync(pinDigest(pin, pepper), m[2], KEYLEN, SCRYPT);
  const expected = Buffer.from(m[3], 'hex');
  return { ok: derived.length === expected.length && timingSafeEqual(derived, expected) };
}

/** Gasta el mismo tiempo que una verificación real (evita distinguir "sin credencial" por latencia). */
function burnVerification(pin) {
  try { scryptSync(pinDigest(String(pin), getPepper()), 'x'.repeat(32), KEYLEN, SCRYPT); } catch { /* sin pepper */ }
}

/** HMAC del RUT para registrar intentos sobre RUT desconocidos sin guardar el RUT. */
function rutHmac(rut) {
  const clean = String(rut || '').replace(/[.\-\s]/g, '').toLowerCase();
  return createHmac('sha256', getPepper().key).update(`rut|${clean}`).digest('hex');
}

/**
 * Art. 7 f): las claves se ajustan a "parámetros mínimos de seguridad". PIN numérico de 4 a 8 dígitos
 * (teclado del tótem), sin repeticiones ni secuencias triviales.
 */
function validatePinFormat(pin, { minLength = 4 } = {}) {
  if (typeof pin !== 'string' || !/^\d+$/.test(pin)) return { ok: false, reason: 'El PIN debe contener solo números' };
  if (pin.length < minLength || pin.length > 8) return { ok: false, reason: `El PIN debe tener entre ${minLength} y 8 dígitos` };
  if (/^(\d)\1+$/.test(pin)) return { ok: false, reason: 'El PIN no puede repetir el mismo dígito' };
  const d = [...pin].map(Number);
  const step = d[1] - d[0];
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) {
    return { ok: false, reason: 'El PIN no puede ser una secuencia (1234, 4321…)' };
  }
  return { ok: true };
}

function safeEqualStrings(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// ---------------- acceso a datos ----------------

async function logAttempt(sql, { tenantId, employeeId = null, rut = null, method, outcome, reason = null, score = null, threshold = null, channel = null, deviceId = null, ip = null }) {
  try {
    await sql(
      `INSERT INTO auth_attempts (tenant_id, employee_id, rut_hmac, method, outcome, reason, score, threshold, channel, device_id, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [tenantId, employeeId, employeeId ? null : (rut ? rutHmac(rut) : null), method, outcome, reason, score, threshold, channel, deviceId, ip]
    );
  } catch (e) {
    console.error('[auth_attempts] no se pudo registrar:', e.message); // nunca incluye el PIN
  }
}

async function getCredential(sql, employeeId) {
  const [row] = await sql("SELECT * FROM employee_credentials WHERE employee_id = $1 AND type = 'PIN'", [employeeId]);
  return row || null;
}

async function setCredential(sql, { tenantId, employeeId, pin, setBy = 'WORKER' }) {
  await sql(
    `INSERT INTO employee_credentials (tenant_id, employee_id, type, secret_hash, set_by)
     VALUES ($1, $2, 'PIN', $3, $4)
     ON CONFLICT (employee_id, type) DO UPDATE SET
       secret_hash = EXCLUDED.secret_hash, set_by = EXCLUDED.set_by, set_at = NOW(),
       failed_count = 0, lock_count = 0, locked_until = NULL, last_failed_at = NULL`,
    [tenantId, employeeId, hashSecret(pin), setBy]
  );
}

/** Invalida el PIN vigente (y el PIN legado en texto plano, si aún existe). */
async function revokeCredential(sql, { tenantId, employeeId }) {
  await sql("DELETE FROM employee_credentials WHERE employee_id = $1 AND tenant_id = $2 AND type = 'PIN'", [employeeId, tenantId]);
  try {
    await sql('UPDATE employees SET personal_pin = NULL WHERE id = $1 AND tenant_id = $2', [employeeId, tenantId]);
  } catch (e) {
    if (!e || e.code !== '42703') throw e; // columna inexistente: nada que limpiar
  }
}

/**
 * Verifica el PIN de un trabajador ya identificado por su RUT.
 * @returns {{ ok: boolean, outcome: 'SUCCESS'|'INVALID'|'LOCKED'|'NO_CREDENTIAL'|'KEY_MISMATCH', retryAfterSeconds?: number, migrated?: boolean }}
 */
async function verifyPinForEmployee(sql, { tenantId, employee, pin, policy, ctx = {} }) {
  const base = { tenantId, employeeId: employee.id, method: 'PIN', channel: ctx.channel || null, deviceId: ctx.deviceId || null, ip: ctx.ip || null };
  const cred = await getCredential(sql, employee.id);

  if (!cred) {
    // Transición: PIN legado en texto plano. Si coincide, se migra a hash en el acto.
    if (employee.personal_pin && safeEqualStrings(employee.personal_pin, pin)) {
      await setCredential(sql, { tenantId, employeeId: employee.id, pin, setBy: 'MIGRATION' });
      await logAttempt(sql, { ...base, outcome: 'SUCCESS', reason: 'LEGACY_MIGRATED' });
      return { ok: true, outcome: 'SUCCESS', migrated: true };
    }
    burnVerification(pin);
    const outcome = employee.personal_pin ? 'INVALID' : 'NO_CREDENTIAL';
    await logAttempt(sql, { ...base, outcome, reason: employee.personal_pin ? 'LEGACY_MISMATCH' : null });
    return { ok: false, outcome };
  }

  const now = Date.now();
  if (cred.locked_until && new Date(cred.locked_until).getTime() > now) {
    // No se verifica el PIN mientras esté bloqueado: así el bloqueo no sirve como oráculo
    await logAttempt(sql, { ...base, outcome: 'LOCKED' });
    return { ok: false, outcome: 'LOCKED', retryAfterSeconds: Math.ceil((new Date(cred.locked_until).getTime() - now) / 1000) };
  }

  const check = verifySecret(pin, cred.secret_hash);
  if (check.keyMismatch || check.malformed) {
    await logAttempt(sql, { ...base, outcome: 'KEY_MISMATCH' });
    return { ok: false, outcome: 'KEY_MISMATCH' };
  }

  if (check.ok) {
    await sql('UPDATE employee_credentials SET failed_count = 0, lock_count = 0, locked_until = NULL, last_used_at = NOW() WHERE id = $1', [cred.id]);
    await logAttempt(sql, { ...base, outcome: 'SUCCESS' });
    return { ok: true, outcome: 'SUCCESS' };
  }

  // Fallo: incremento atómico; al llegar al máximo se bloquea con duración creciente (x2 por bloqueo, tope 24 h)
  const [after] = await sql(
    `UPDATE employee_credentials SET
       failed_count = CASE WHEN failed_count + 1 >= $2 THEN 0 ELSE failed_count + 1 END,
       lock_count   = CASE WHEN failed_count + 1 >= $2 THEN lock_count + 1 ELSE lock_count END,
       locked_until = CASE WHEN failed_count + 1 >= $2
                           THEN NOW() + make_interval(mins => LEAST($3::int * power(2, lock_count)::int, 1440))
                           ELSE locked_until END,
       last_failed_at = NOW()
     WHERE id = $1
     RETURNING failed_count, locked_until`,
    [cred.id, policy.pin_max_attempts, policy.pin_lockout_minutes]
  );

  const lockedNow = after && after.locked_until && new Date(after.locked_until).getTime() > Date.now();
  await logAttempt(sql, { ...base, outcome: lockedNow ? 'LOCKED' : 'INVALID', reason: lockedNow ? 'MAX_ATTEMPTS' : null });
  if (lockedNow) {
    return { ok: false, outcome: 'LOCKED', retryAfterSeconds: Math.ceil((new Date(after.locked_until).getTime() - Date.now()) / 1000) };
  }
  return { ok: false, outcome: 'INVALID' };
}

// ---------------- enlaces de un solo uso ----------------

const sha256 = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

async function createResetToken(sql, { tenantId, employeeId, createdBy, ttlHours = 24 }) {
  const token = randomBytes(32).toString('base64url');
  await sql(
    `INSERT INTO credential_reset_tokens (tenant_id, employee_id, token_hash, created_by, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(hours => $5::int))`,
    [tenantId, employeeId, sha256(token), createdBy || null, ttlHours]
  );
  return token; // solo se entrega al trabajador por correo; en la base queda su hash
}

/**
 * Consume el token de forma atómica (un solo uso). Solo se consume si pertenece a la empresa indicada:
 * abrir el enlace con otra empresa no lo quema.
 */
async function consumeResetToken(sql, token, tenantId) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const [row] = await sql(
    `UPDATE credential_reset_tokens SET used_at = NOW()
      WHERE token_hash = $1 AND tenant_id = $2 AND used_at IS NULL AND expires_at > NOW()
      RETURNING tenant_id, employee_id`,
    [sha256(token), tenantId]
  );
  return row || null;
}

module.exports = {
  getPepper, hashSecret, verifySecret, validatePinFormat, rutHmac,
  logAttempt, getCredential, setCredential, revokeCredential, verifyPinForEmployee,
  createResetToken, consumeResetToken,
};
