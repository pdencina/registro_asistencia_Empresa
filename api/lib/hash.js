const { scryptSync, randomBytes, timingSafeEqual } = require('crypto');

/**
 * Módulo de Hashing Seguro para PINs y contraseñas.
 * Usa scrypt (nativo Node.js) — no requiere dependencias externas.
 * 
 * Compatible con Vercel serverless (no necesita compilación nativa como bcrypt).
 * 
 * Formato almacenado: "salt:hash" (ambos en hex)
 */

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

/**
 * Hashea un PIN o contraseña.
 * @param {string} plainText - El PIN o password en texto plano
 * @returns {string} Hash en formato "salt:derivedKey" (hex)
 */
function hashPin(plainText) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plainText, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `${salt}:${derived.toString('hex')}`;
}

/**
 * Verifica un PIN o contraseña contra su hash almacenado.
 * Usa timingSafeEqual para evitar timing attacks.
 * 
 * También acepta PINs legacy (texto plano) para migración gradual:
 * si el storedHash no contiene ':', se compara directamente.
 * 
 * @param {string} plainText - El PIN ingresado
 * @param {string} storedHash - El hash almacenado (formato "salt:derived" o legacy plano)
 * @returns {boolean} true si coincide
 */
function verifyPin(plainText, storedHash) {
  if (!plainText || !storedHash) return false;

  // Compatibilidad con PINs legacy (texto plano, sin ':')
  // Si el stored no tiene formato hash, comparar directamente
  if (!storedHash.includes(':') || storedHash.length < 40) {
    // Legacy: comparación directa (para migración gradual)
    return plainText === storedHash;
  }

  // Formato seguro: "salt:derivedKey"
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;

  try {
    const derived = scryptSync(plainText, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
    const keyBuffer = Buffer.from(key, 'hex');
    return timingSafeEqual(derived, keyBuffer);
  } catch (e) {
    return false;
  }
}

/**
 * Determina si un valor almacenado ya está hasheado o es legacy.
 * @param {string} stored - Valor almacenado
 * @returns {boolean} true si ya está hasheado
 */
function isHashed(stored) {
  if (!stored) return false;
  return stored.includes(':') && stored.length >= 40;
}

module.exports = { hashPin, verifyPin, isHashed };
