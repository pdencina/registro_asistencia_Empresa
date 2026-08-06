const { createHash } = require('crypto');
const { getDb } = require('./db');
const { generateTimestampSeal } = require('./timestamp');

/**
 * Módulo de Integridad de Registros — Resolución 38 Exenta DT
 * 
 * Implementa hash SHA-256 encadenado para garantizar la inalterabilidad
 * de los registros de asistencia. Cada registro incluye el hash del
 * registro anterior, formando una cadena verificable.
 * 
 * Esquema del hash:
 *   SHA-256( id + tenant_id + employee_id + type + timestamp + method + previous_hash )
 */

/**
 * Genera el hash SHA-256 de un registro de asistencia.
 * Incluye el hash del registro anterior para formar cadena.
 */
function computeRecordHash({ id, tenant_id, employee_id, type, timestamp, method, previous_hash }) {
  const payload = [
    id,
    tenant_id,
    employee_id,
    type,
    timestamp,
    method || '',
    previous_hash || 'GENESIS'
  ].join('|');

  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Obtiene el hash del último registro insertado para este tenant.
 * Se usa como "previous_hash" para encadenar el siguiente registro.
 */
async function getLastRecordHash(tenantId) {
  const sql = getDb();

  try {
    const [last] = await sql(
      `SELECT record_hash FROM attendance_records 
       WHERE tenant_id = $1 AND record_hash IS NOT NULL
       ORDER BY timestamp DESC, created_at DESC LIMIT 1`,
      [tenantId]
    );
    return last ? last.record_hash : null;
  } catch (e) {
    // Column might not exist yet
    return null;
  }
}

/**
 * Asegura que las columnas de integridad existan en attendance_records.
 */
async function ensureIntegrityColumns() {
  const sql = getDb();
  try {
    await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS record_hash VARCHAR(64)`);
    await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64)`);
    await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
    await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`);
    await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`);
    await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS timestamp_seal VARCHAR(64)`);
    await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS server_timestamp TIMESTAMP`);
    await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS sequence_token VARCHAR(30)`);
  } catch (e) {
    console.error('[Integrity] Error ensuring columns:', e.message);
  }
}

/**
 * Inserta un registro de asistencia con hash de integridad encadenado.
 * Reemplaza el INSERT directo en register.js y pin-checkin.js.
 * 
 * @returns {string} El ID del registro insertado
 */
async function insertAttendanceRecord({ id, tenant_id, employee_id, type, timestamp, method, notes, photo_snapshot_url, latitude, longitude }) {
  const sql = getDb();

  // Asegurar columnas existen
  await ensureIntegrityColumns();

  // Obtener hash del registro anterior
  const previous_hash = await getLastRecordHash(tenant_id);

  // Calcular hash de este registro
  const record_hash = computeRecordHash({
    id,
    tenant_id,
    employee_id,
    type,
    timestamp,
    method,
    previous_hash,
  });

  // Generar sello de tiempo criptográfico (Res. 38 DT)
  const seal = generateTimestampSeal({
    record_hash,
    timestamp,
    tenant_id,
    employee_id,
  });

  // Insertar con hash + sello de tiempo
  await sql(
    `INSERT INTO attendance_records 
      (id, tenant_id, employee_id, type, timestamp, method, notes, photo_snapshot_url, latitude, longitude, record_hash, previous_hash, timestamp_seal, server_timestamp, sequence_token, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
    [
      id,
      tenant_id,
      employee_id,
      type,
      timestamp,
      method,
      notes || null,
      photo_snapshot_url || null,
      latitude || null,
      longitude || null,
      record_hash,
      previous_hash || 'GENESIS',
      seal.seal,
      seal.server_timestamp,
      seal.sequence_token,
    ]
  );

  return { id, record_hash, timestamp_seal: seal };
}

/**
 * Verifica la integridad de la cadena de registros de un tenant.
 * Retorna los registros con integridad comprometida (si hay).
 */
async function verifyChainIntegrity(tenantId, { limit = 1000, startDate, endDate } = {}) {
  const sql = getDb();

  let query = `
    SELECT id, tenant_id, employee_id, type, timestamp, method, record_hash, previous_hash
    FROM attendance_records
    WHERE tenant_id = $1 AND record_hash IS NOT NULL
  `;
  const params = [tenantId];
  let idx = 2;

  if (startDate) {
    query += ` AND timestamp >= $${idx++}`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND timestamp <= $${idx++}`;
    params.push(endDate);
  }

  query += ` ORDER BY timestamp ASC, created_at ASC LIMIT $${idx}`;
  params.push(limit);

  const records = await sql(query, params);

  const corrupted = [];
  let expectedPrevHash = null;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];

    // Verificar que el previous_hash coincide con el hash del registro anterior
    if (i > 0 && r.previous_hash !== records[i - 1].record_hash) {
      corrupted.push({
        id: r.id,
        index: i,
        reason: 'previous_hash no coincide con hash del registro anterior',
        expected_previous: records[i - 1].record_hash,
        actual_previous: r.previous_hash,
      });
    }

    // Recalcular el hash y verificar
    const expectedHash = computeRecordHash({
      id: r.id,
      tenant_id: r.tenant_id,
      employee_id: r.employee_id,
      type: r.type,
      timestamp: typeof r.timestamp === 'string' ? r.timestamp : r.timestamp.toISOString(),
      method: r.method,
      previous_hash: r.previous_hash,
    });

    if (expectedHash !== r.record_hash) {
      corrupted.push({
        id: r.id,
        index: i,
        reason: 'record_hash no coincide con datos del registro (registro alterado)',
        expected_hash: expectedHash,
        actual_hash: r.record_hash,
      });
    }
  }

  return {
    total_verified: records.length,
    integrity_ok: corrupted.length === 0,
    corrupted_records: corrupted,
    first_record_hash: records.length > 0 ? records[0].record_hash : null,
    last_record_hash: records.length > 0 ? records[records.length - 1].record_hash : null,
  };
}

/**
 * Crea reglas de protección en la BD para impedir UPDATE/DELETE.
 * Nota: Neon PostgreSQL serverless — los triggers se ejecutan server-side.
 */
async function createProtectionRules() {
  const sql = getDb();

  try {
    // Función que bloquea updates en campos protegidos
    await sql(`
      CREATE OR REPLACE FUNCTION protect_attendance_records()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Permitir solo actualizar campos no críticos (photo_snapshot_url por migración)
        IF OLD.id != NEW.id OR
           OLD.tenant_id != NEW.tenant_id OR
           OLD.employee_id != NEW.employee_id OR
           OLD.type != NEW.type OR
           OLD.timestamp != NEW.timestamp OR
           OLD.method != NEW.method OR
           OLD.record_hash IS DISTINCT FROM NEW.record_hash OR
           OLD.previous_hash IS DISTINCT FROM NEW.previous_hash THEN
          RAISE EXCEPTION 'No se permite modificar registros de asistencia (Res. 38 DT). Use correcciones.';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Trigger para UPDATE
    await sql(`
      DROP TRIGGER IF EXISTS trg_protect_attendance_update ON attendance_records;
      CREATE TRIGGER trg_protect_attendance_update
        BEFORE UPDATE ON attendance_records
        FOR EACH ROW
        EXECUTE FUNCTION protect_attendance_records();
    `);

    // Función que bloquea DELETE
    await sql(`
      CREATE OR REPLACE FUNCTION block_attendance_delete()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'No se permite eliminar registros de asistencia (Res. 38 DT).';
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Trigger para DELETE
    await sql(`
      DROP TRIGGER IF EXISTS trg_block_attendance_delete ON attendance_records;
      CREATE TRIGGER trg_block_attendance_delete
        BEFORE DELETE ON attendance_records
        FOR EACH ROW
        EXECUTE FUNCTION block_attendance_delete();
    `);

    return { success: true, message: 'Protecciones de integridad activadas' };
  } catch (e) {
    console.error('[Integrity] Error creating protection rules:', e.message);
    return { success: false, error: e.message };
  }
}

module.exports = {
  computeRecordHash,
  getLastRecordHash,
  ensureIntegrityColumns,
  insertAttendanceRecord,
  verifyChainIntegrity,
  createProtectionRules,
};
