const { createHmac, createHash } = require('crypto');

/**
 * Módulo de Sello de Tiempo — Resolución 38 Exenta DT
 * 
 * Implementa un sello de tiempo criptográfico que certifica:
 * 1. El momento exacto en que el registro fue creado en el servidor
 * 2. Que el registro no fue creado retroactivamente
 * 3. La autenticidad del emisor (HMAC con secreto del servidor)
 * 
 * El sello incluye:
 * - Timestamp ISO 8601 del servidor
 * - Hash del registro sellado
 * - HMAC-SHA256 firmado con TIMESTAMP_SECRET
 * - Secuencia incremental diaria (para ordenamiento)
 * 
 * Para certificación DT de nivel superior, este sello puede ser
 * complementado con un sello de una TSA externa (RFC 3161).
 */

const TIMESTAMP_SECRET = process.env.TIMESTAMP_SECRET || process.env.DATABASE_URL || 'flexio-default-tss-key';

/**
 * Genera un sello de tiempo para un registro de asistencia.
 * 
 * @param {object} params
 * @param {string} params.record_hash - Hash SHA-256 del registro
 * @param {string} params.timestamp - Timestamp ISO del registro
 * @param {string} params.tenant_id - ID del tenant
 * @param {string} params.employee_id - ID del empleado
 * @returns {{ seal, server_timestamp, sequence_token }}
 */
function generateTimestampSeal({ record_hash, timestamp, tenant_id, employee_id }) {
  const serverTimestamp = new Date().toISOString();

  // Payload a sellar: hash del registro + timestamp del servidor + IDs
  const payload = [
    record_hash,
    serverTimestamp,
    tenant_id,
    employee_id,
  ].join('|');

  // HMAC-SHA256 con secreto del servidor
  const seal = createHmac('sha256', TIMESTAMP_SECRET)
    .update(payload, 'utf8')
    .digest('hex');

  // Token de secuencia: fecha + primeros 8 chars del hash (para verificar orden)
  const datePrefix = serverTimestamp.slice(0, 10).replace(/-/g, '');
  const sequence_token = `${datePrefix}-${seal.slice(0, 12)}`;

  return {
    seal,
    server_timestamp: serverTimestamp,
    sequence_token,
    algorithm: 'HMAC-SHA256',
    version: '1.0',
  };
}

/**
 * Verifica un sello de tiempo existente.
 * 
 * @param {object} params
 * @param {string} params.seal - Sello almacenado
 * @param {string} params.record_hash - Hash del registro
 * @param {string} params.server_timestamp - Timestamp del servidor
 * @param {string} params.tenant_id - ID del tenant
 * @param {string} params.employee_id - ID del empleado
 * @returns {boolean} true si el sello es válido
 */
function verifyTimestampSeal({ seal, record_hash, server_timestamp, tenant_id, employee_id }) {
  if (!seal || !record_hash || !server_timestamp) return false;

  const payload = [
    record_hash,
    server_timestamp,
    tenant_id,
    employee_id,
  ].join('|');

  const expectedSeal = createHmac('sha256', TIMESTAMP_SECRET)
    .update(payload, 'utf8')
    .digest('hex');

  // Comparación en tiempo constante
  if (seal.length !== expectedSeal.length) return false;
  let match = true;
  for (let i = 0; i < seal.length; i++) {
    if (seal[i] !== expectedSeal[i]) match = false;
  }
  return match;
}

/**
 * Genera un hash de anclaje diario.
 * Se calcula al final de cada día y combina todos los hashes de ese día.
 * Puede publicarse externamente (blockchain, GitHub, etc.) como prueba de existencia.
 * 
 * @param {string[]} dayHashes - Todos los record_hash del día
 * @param {string} date - Fecha YYYY-MM-DD
 * @returns {{ anchor_hash, date, records_count }}
 */
function generateDailyAnchor(dayHashes, date) {
  const combined = dayHashes.sort().join('');
  const anchor_hash = createHash('sha256')
    .update(`${date}|${combined}|${dayHashes.length}`, 'utf8')
    .digest('hex');

  return {
    anchor_hash,
    date,
    records_count: dayHashes.length,
    generated_at: new Date().toISOString(),
  };
}

module.exports = {
  generateTimestampSeal,
  verifyTimestampSeal,
  generateDailyAnchor,
};
