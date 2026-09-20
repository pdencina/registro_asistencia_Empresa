const { createHash } = require('crypto');
const { getDb } = require('./db');
const { generateTimestampSeal, verifyTimestampSeal, getSealKeyStatus } = require('./timestamp');

/**
 * Módulo de Integridad de Registros (preparación técnica para la Resolución 38 Exenta DT).
 *
 * Cada marcación queda en una cadena de hashes SHA-256 por empresa, de modo que alterar,
 * borrar o reordenar un registro rompe la verificación. Existen dos formatos:
 *
 *  - v1 (histórico): SHA-256(id|tenant|employee|type|timestamp|method|previous_hash).
 *    Sigue verificándose tal cual; no se reescribe ningún registro antiguo.
 *
 *  - v2: cubre además hora del servidor, autenticación, dispositivo, canal, ubicación, evidencia,
 *    y un número de secuencia por empresa (seq). Se anexa en UNA sola sentencia SQL que bloquea la
 *    cabeza de cadena (tenant_chain_heads), así dos marcaciones simultáneas no pueden bifurcar la cadena.
 *    Requiere migrations/001_attendance_v2.sql; mientras no esté aplicada se sigue usando v1.
 */

// ===================== v1 (histórico) =====================

/**
 * Genera el hash SHA-256 de un registro de asistencia (formato v1).
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
 * Obtiene el hash del último registro insertado para este tenant (criterio v1).
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
 * Asegura que las columnas de integridad v1 existan en attendance_records.
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

async function insertV1(sql, { id, tenant_id, employee_id, type, timestamp, method, notes, photo_snapshot_url, latitude, longitude }) {
  await ensureIntegrityColumns();

  const previous_hash = await getLastRecordHash(tenant_id);

  const record_hash = computeRecordHash({
    id,
    tenant_id,
    employee_id,
    type,
    timestamp,
    method,
    previous_hash,
  });

  const seal = generateTimestampSeal({ record_hash, timestamp, tenant_id, employee_id });

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
      latitude ?? null,
      longitude ?? null,
      record_hash,
      previous_hash || 'GENESIS',
      seal.seal,
      seal.server_timestamp,
      seal.sequence_token,
    ]
  );

  return { id, record_hash, hash_version: 1, timestamp_seal: seal };
}

// ===================== v2 =====================

const HASH_VERSION = 2;

const isoOrEmpty = (v) => (v == null || v === '' ? '' : new Date(v).toISOString());
const strOrEmpty = (v) => (v == null ? '' : String(v));
const numOrEmpty = (v) => (v == null || v === '' ? '' : String(Number(v)));

/**
 * Serialización canónica de los campos que cubre el hash v2.
 * Es un arreglo JSON (sin ambigüedad de separadores) con orden fijo. Cambiar este orden o agregar
 * campos exige subir HASH_VERSION: los registros ya emitidos deben seguir verificándose.
 */
function canonicalPrefixV2(r) {
  return JSON.stringify([
    'v2',
    strOrEmpty(r.id),
    strOrEmpty(r.tenant_id),
    strOrEmpty(r.employee_id),
    strOrEmpty(r.type),
    isoOrEmpty(r.timestamp),
    strOrEmpty(r.method),
    isoOrEmpty(r.server_received_at),
    isoOrEmpty(r.client_timestamp),
    r.is_offline_sync ? '1' : '0',
    strOrEmpty(r.auth_method),
    strOrEmpty(r.auth_result),
    strOrEmpty(r.auth_attempt_id),
    strOrEmpty(r.channel),
    strOrEmpty(r.device_id),
    strOrEmpty(r.location_id),
    numOrEmpty(r.policy_version),
    numOrEmpty(r.latitude),
    numOrEmpty(r.longitude),
    strOrEmpty(r.geo_status),
    numOrEmpty(r.geo_distance_m),
    numOrEmpty(r.geo_accuracy_m),
    strOrEmpty(r.evidence_id),
    strOrEmpty(r.evidence_sha256),
  ]);
}

const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Digest del contenido del registro, independiente de su posición en la cadena (lo firma el sello). */
function contentDigestV2(record) {
  return sha256Hex(canonicalPrefixV2(record));
}

/** Hash encadenado v2. La misma fórmula se evalúa en SQL al insertar (ver insertV2). */
function computeRecordHashV2(prefix, seq, previousHash) {
  return sha256Hex(`${prefix}|${String(seq)}|${previousHash || 'GENESIS'}`);
}

let v2State = { ready: false, checkedAt: 0 };
// Empresas cuya cabeza de cadena ya se aseguró en esta instancia (evita una consulta por inserción)
const headsEnsured = new Set();

function _resetV2Cache() {
  v2State = { ready: false, checkedAt: 0 };
  headsEnsured.clear();
}

async function hasV2Schema(sql) {
  try {
    const [row] = await sql(
      `SELECT
         (SELECT COUNT(*) FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'attendance_records'
             AND column_name IN ('hash_version', 'seq', 'server_received_at', 'evidence_sha256')) AS cols,
         (to_regclass('tenant_chain_heads') IS NOT NULL) AS heads`
    );
    return Number(row.cols) === 4 && row.heads === true;
  } catch {
    return false;
  }
}

/** ¿Está aplicada la migración 001? El resultado positivo se cachea; el negativo se reintenta cada 60 s. */
async function isV2Ready(sql) {
  if (process.env.FORCE_LEGACY_INTEGRITY === 'true') return false;
  if (v2State.ready) return true;
  if (Date.now() - v2State.checkedAt < 60000) return false;
  v2State.checkedAt = Date.now();
  v2State.ready = await hasV2Schema(sql);
  return v2State.ready;
}

const INSERT_V2_SQL = `
WITH head AS (
  SELECT last_seq, last_hash FROM tenant_chain_heads WHERE tenant_id = $1::uuid FOR UPDATE
), calc AS (
  SELECT last_seq + 1 AS seq,
         COALESCE(last_hash, 'GENESIS') AS prev,
         encode(sha256(convert_to($2::text || '|' || (last_seq + 1)::text || '|' || COALESCE(last_hash, 'GENESIS'), 'UTF8')), 'hex') AS h
  FROM head
), ins AS (
  INSERT INTO attendance_records
    (id, tenant_id, employee_id, type, timestamp, method, notes, photo_snapshot_url, latitude, longitude,
     record_hash, previous_hash, timestamp_seal, server_timestamp, sequence_token, created_at, seq, hash_version,
     auth_method, auth_result, auth_attempt_id, channel, device_id, location_id, policy_version,
     client_timestamp, server_received_at, is_offline_sync, geo_status, geo_distance_m, geo_accuracy_m,
     evidence_id, evidence_sha256, seal_key_id)
  SELECT $3::uuid, $1::uuid, $4::uuid, $5::text, $6::timestamptz, $7::text, $8::text, $9::text, $10::float8, $11::float8,
         calc.h, calc.prev, $12::text, $13::timestamptz, $14::text, NOW(), calc.seq, ${HASH_VERSION},
         $15::text, $16::text, $17::uuid, $18::text, $19::text, $20::uuid, $21::int,
         $22::timestamptz, $23::timestamptz, $24::boolean, $25::text, $26::int, $27::float8,
         $28::uuid, $29::text, $30::text
  FROM calc
  RETURNING seq, record_hash, previous_hash
), upd AS (
  UPDATE tenant_chain_heads t
     SET last_seq = ins.seq, last_hash = ins.record_hash, updated_at = NOW()
    FROM ins
   WHERE t.tenant_id = $1::uuid
  RETURNING t.tenant_id
)
SELECT ins.seq::text AS seq, ins.record_hash, ins.previous_hash FROM ins`;

const ENSURE_HEAD_SQL = `
INSERT INTO tenant_chain_heads (tenant_id, last_seq, last_hash)
SELECT $1::uuid, 0,
       (SELECT record_hash FROM attendance_records
         WHERE tenant_id = $1::uuid AND record_hash IS NOT NULL
         ORDER BY timestamp DESC, created_at DESC LIMIT 1)
ON CONFLICT (tenant_id) DO NOTHING`;

const orNull = (v) => (v === undefined || v === '' ? null : v);

async function insertV2(sql, rec) {
  const serverReceivedAt = isoOrEmpty(rec.server_received_at || new Date());
  const row = {
    id: rec.id,
    tenant_id: rec.tenant_id,
    employee_id: rec.employee_id,
    type: rec.type,
    timestamp: isoOrEmpty(rec.timestamp || serverReceivedAt),
    method: rec.method || '',
    server_received_at: serverReceivedAt,
    client_timestamp: rec.client_timestamp ? isoOrEmpty(rec.client_timestamp) : null,
    is_offline_sync: !!rec.is_offline_sync,
    auth_method: orNull(rec.auth_method),
    auth_result: orNull(rec.auth_result),
    auth_attempt_id: orNull(rec.auth_attempt_id),
    channel: orNull(rec.channel),
    device_id: orNull(rec.device_id),
    location_id: orNull(rec.location_id),
    policy_version: orNull(rec.policy_version),
    latitude: rec.latitude ?? null,
    longitude: rec.longitude ?? null,
    geo_status: orNull(rec.geo_status),
    geo_distance_m: rec.geo_distance_m ?? null,
    geo_accuracy_m: rec.geo_accuracy_m ?? null,
    evidence_id: orNull(rec.evidence_id),
    evidence_sha256: orNull(rec.evidence_sha256),
  };

  const prefix = canonicalPrefixV2(row);
  // El sello firma el contenido (no la posición en la cadena): la posición la fija el motor de base de datos.
  const seal = generateTimestampSeal({
    record_hash: sha256Hex(prefix),
    timestamp: row.timestamp,
    tenant_id: row.tenant_id,
    employee_id: row.employee_id,
    serverTimestamp: serverReceivedAt,
  });

  const params = [
    row.tenant_id, prefix, row.id, row.employee_id, row.type, row.timestamp, row.method,
    rec.notes || null, rec.photo_snapshot_url || null, row.latitude, row.longitude,
    seal.seal, serverReceivedAt, seal.sequence_token,
    row.auth_method, row.auth_result, row.auth_attempt_id, row.channel, row.device_id, row.location_id, row.policy_version,
    row.client_timestamp, serverReceivedAt, row.is_offline_sync, row.geo_status, row.geo_distance_m, row.geo_accuracy_m,
    row.evidence_id, row.evidence_sha256, seal.key_id,
  ];

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      if (!headsEnsured.has(row.tenant_id)) {
        await sql(ENSURE_HEAD_SQL, [row.tenant_id]);
        headsEnsured.add(row.tenant_id);
      }
      const [out] = await sql(INSERT_V2_SQL, params);
      if (!out) throw new Error('No se pudo anexar el registro a la cadena (cabeza de cadena ausente)');
      return { id: row.id, record_hash: out.record_hash, seq: Number(out.seq), hash_version: HASH_VERSION, timestamp_seal: seal };
    } catch (e) {
      // 23505: dos anexos simultáneos eligieron el mismo seq; la unicidad (tenant_id, seq) lo impide y se reintenta.
      if (e && e.code === '23505' && attempt < MAX_ATTEMPTS) continue;
      throw e;
    }
  }
}

/**
 * Inserta un registro de asistencia con hash de integridad encadenado.
 * Usa el formato v2 si la migración está aplicada y v1 en caso contrario.
 *
 * Campos: id, tenant_id, employee_id, type, timestamp, method, notes, photo_snapshot_url, latitude, longitude
 * y, opcionalmente (solo v2): server_received_at, client_timestamp, is_offline_sync, auth_method, auth_result,
 * auth_attempt_id, channel, device_id, location_id, policy_version, geo_status, geo_distance_m, geo_accuracy_m,
 * evidence_id, evidence_sha256.
 */
async function insertAttendanceRecord(rec) {
  const sql = getDb();
  if (await isV2Ready(sql)) return insertV2(sql, rec);
  return insertV1(sql, rec);
}

// ===================== Verificación =====================

const V2_COLUMNS = `id, tenant_id, employee_id, type, timestamp, method, server_received_at, client_timestamp,
  is_offline_sync, auth_method, auth_result, auth_attempt_id, channel, device_id, location_id, policy_version,
  latitude, longitude, geo_status, geo_distance_m, geo_accuracy_m, evidence_id, evidence_sha256,
  seq, previous_hash, record_hash, timestamp_seal, server_timestamp, seal_key_id, created_at`;

async function verifyLegacySegment(sql, tenantId, { limit, startDate, endDate }, v2Present, cutoff) {
  let query = `
    SELECT id, tenant_id, employee_id, type, timestamp, method, record_hash, previous_hash, created_at
    FROM attendance_records
    WHERE tenant_id = $1 AND record_hash IS NOT NULL
  `;
  const params = [tenantId];
  let idx = 2;

  if (v2Present) query += ` AND COALESCE(hash_version, 1) = 1`;
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

  // Registros v1 creados después del primer v2 (instancia antigua durante un despliegue): su enlace apunta
  // a la cadena v2, así que solo se verifica su propio hash; el hecho se informa como advertencia.
  const afterCutoff = (row) => !!cutoff && new Date(row.created_at) > new Date(cutoff);

  for (let i = 0; i < records.length; i++) {
    const r = records[i];

    if (i > 0 && !afterCutoff(r) && !afterCutoff(records[i - 1]) && r.previous_hash !== records[i - 1].record_hash) {
      corrupted.push({
        id: r.id,
        index: i,
        format: 'v1',
        reason: 'previous_hash no coincide con hash del registro anterior',
        expected_previous: records[i - 1].record_hash,
        actual_previous: r.previous_hash,
      });
    }

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
        format: 'v1',
        reason: 'record_hash no coincide con datos del registro (registro alterado)',
        expected_hash: expectedHash,
        actual_hash: r.record_hash,
      });
    }
  }

  return {
    total: records.length,
    corrupted,
    first_hash: records.length > 0 ? records[0].record_hash : null,
    last_hash: records.length > 0 ? records[records.length - 1].record_hash : null,
  };
}

async function verifyV2Segment(sql, tenantId, { limit, startDate, endDate }) {
  const filtered = !!(startDate || endDate);
  let query = `SELECT ${V2_COLUMNS} FROM attendance_records WHERE tenant_id = $1 AND hash_version = ${HASH_VERSION}`;
  const params = [tenantId];
  let idx = 2;
  if (startDate) { query += ` AND timestamp >= $${idx++}`; params.push(startDate); }
  if (endDate) { query += ` AND timestamp <= $${idx++}`; params.push(endDate); }
  query += ` ORDER BY seq ASC LIMIT $${idx}`;
  params.push(limit);

  const records = await sql(query, params);
  const corrupted = [];
  const warnings = [];
  const seal = getSealKeyStatus();
  let sealsSkipped = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const seq = BigInt(r.seq);

    // 1) El hash almacenado corresponde a los datos actuales del registro
    const expectedHash = computeRecordHashV2(canonicalPrefixV2(r), seq, r.previous_hash);
    if (expectedHash !== r.record_hash) {
      corrupted.push({
        id: r.id, seq: String(seq), format: 'v2',
        reason: 'record_hash no coincide con datos del registro (registro alterado)',
        expected_hash: expectedHash, actual_hash: r.record_hash,
      });
    }

    // 2) Enlace con el registro anterior y continuidad de la secuencia
    if (i > 0) {
      const prev = records[i - 1];
      const prevSeq = BigInt(prev.seq);
      if (seq === prevSeq + 1n) {
        if (r.previous_hash !== prev.record_hash) {
          corrupted.push({
            id: r.id, seq: String(seq), format: 'v2',
            reason: 'previous_hash no coincide con hash del registro anterior',
            expected_previous: prev.record_hash, actual_previous: r.previous_hash,
          });
        }
      } else if (!filtered) {
        corrupted.push({
          id: r.id, seq: String(seq), format: 'v2',
          reason: `salto en la secuencia: se esperaba seq ${prevSeq + 1n} y se encontró ${seq} (registro faltante o eliminado)`,
        });
      }
    } else if (!filtered) {
      if (seq !== 1n) {
        corrupted.push({
          id: r.id, seq: String(seq), format: 'v2',
          reason: `la cadena v2 no comienza en seq 1 (primer registro: ${seq}); faltan registros iniciales`,
        });
      } else {
        // El primer registro v2 debe enlazar con el último registro histórico (v1) anterior a él
        const [legacyLast] = await sql(
          `SELECT record_hash FROM attendance_records
            WHERE tenant_id = $1 AND COALESCE(hash_version, 1) = 1 AND record_hash IS NOT NULL AND created_at <= $2
            ORDER BY timestamp DESC, created_at DESC LIMIT 1`,
          [tenantId, r.created_at]
        );
        const expectedPrev = legacyLast ? legacyLast.record_hash : 'GENESIS';
        if (r.previous_hash !== expectedPrev) {
          corrupted.push({
            id: r.id, seq: '1', format: 'v2',
            reason: 'el primer registro v2 no enlaza con el último registro histórico',
            expected_previous: expectedPrev, actual_previous: r.previous_hash,
          });
        }
      }
    }

    // 3) Sello de tiempo. Si se firmó con otra clave no se puede verificar (no es evidencia de alteración).
    if (r.seal_key_id && r.seal_key_id !== seal.key_id) {
      sealsSkipped++;
    } else if (!verifyTimestampSeal({
      seal: r.timestamp_seal,
      record_hash: contentDigestV2(r),
      server_timestamp: isoOrEmpty(r.server_timestamp),
      tenant_id: r.tenant_id,
      employee_id: r.employee_id,
    })) {
      corrupted.push({
        id: r.id, seq: String(seq), format: 'v2',
        reason: 'sello de tiempo inválido',
      });
    }
  }

  if (sealsSkipped > 0) {
    warnings.push(`${sealsSkipped} sello(s) firmado(s) con otra clave (key_id distinto de ${seal.key_id}); no se pudieron verificar`);
  }

  if (records.length > 0 && !filtered) {
    const [{ n }] = await sql(
      `SELECT COUNT(*) AS n FROM attendance_records
        WHERE tenant_id = $1 AND COALESCE(hash_version, 1) = 1 AND created_at > $2`,
      [tenantId, records[0].created_at]
    );
    if (Number(n) > 0) {
      warnings.push(`${n} registro(s) en formato v1 creados después del primer registro v2 (posible instancia antigua durante el despliegue)`);
    }
  }

  return {
    total: records.length,
    corrupted,
    warnings,
    first_hash: records.length > 0 ? records[0].record_hash : null,
    last_hash: records.length > 0 ? records[records.length - 1].record_hash : null,
  };
}

/**
 * Verifica la integridad de la cadena de registros de un tenant (v1 + v2).
 * Retorna los registros con integridad comprometida (si hay).
 *
 * Con startDate/endDate se verifica cada tramo por separado y no se exige continuidad de secuencia.
 */
async function verifyChainIntegrity(tenantId, { limit = 1000, startDate, endDate } = {}) {
  const sql = getDb();
  const opts = { limit, startDate, endDate };
  const v2Present = await hasV2Schema(sql);

  let cutoff = null;
  if (v2Present) {
    const [c] = await sql(`SELECT MIN(created_at) AS c FROM attendance_records WHERE tenant_id = $1 AND hash_version = ${HASH_VERSION}`, [tenantId]);
    cutoff = c ? c.c : null;
  }

  const legacy = await verifyLegacySegment(sql, tenantId, opts, v2Present, cutoff);
  const v2 = v2Present
    ? await verifyV2Segment(sql, tenantId, opts)
    : { total: 0, corrupted: [], warnings: [], first_hash: null, last_hash: null };

  const corrupted = [...legacy.corrupted, ...v2.corrupted];
  const seal = getSealKeyStatus();
  const warnings = [...v2.warnings];
  if (seal.weak) {
    warnings.push(`La clave de sellado proviene de ${seal.source}: define TIMESTAMP_SECRET para una clave dedicada`);
  }

  return {
    total_verified: legacy.total + v2.total,
    legacy_records: legacy.total,
    v2_records: v2.total,
    integrity_ok: corrupted.length === 0,
    corrupted_records: corrupted,
    first_record_hash: legacy.first_hash || v2.first_hash,
    last_record_hash: v2.last_hash || legacy.last_hash,
    seal_key: seal,
    warnings,
  };
}

const V2_PROTECTED_COLUMNS = [
  'seq', 'hash_version', 'latitude', 'longitude', 'timestamp_seal', 'seal_key_id',
  'server_received_at', 'client_timestamp', 'is_offline_sync',
  'auth_method', 'auth_result', 'auth_attempt_id', 'channel', 'device_id', 'location_id', 'policy_version',
  'geo_status', 'geo_distance_m', 'geo_accuracy_m', 'evidence_id', 'evidence_sha256',
];

/**
 * Crea reglas de protección en la BD para impedir UPDATE/DELETE.
 * Nota: Neon PostgreSQL serverless — los triggers se ejecutan server-side.
 *
 * ATENCIÓN: una vez activas, editar o borrar una marcación falla a nivel de base de datos.
 * Las correcciones administrativas deben hacerse con registros de corrección (etapa 9 del plan).
 */
async function createProtectionRules() {
  const sql = getDb();

  try {
    // Con la migración 001 aplicada se protegen también las columnas de evidencia v2
    const v2 = await hasV2Schema(sql);
    const extraChecks = v2
      ? V2_PROTECTED_COLUMNS.map((c) => ` OR OLD.${c} IS DISTINCT FROM NEW.${c}`).join('')
      : '';

    // Función que bloquea updates en campos protegidos
    await sql(`
      CREATE OR REPLACE FUNCTION protect_attendance_records()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Solo se permite cambiar campos no críticos (p. ej. photo_snapshot_url al purgar evidencia)
        IF OLD.id != NEW.id OR
           OLD.tenant_id != NEW.tenant_id OR
           OLD.employee_id != NEW.employee_id OR
           OLD.type != NEW.type OR
           OLD.timestamp != NEW.timestamp OR
           OLD.method != NEW.method OR
           OLD.record_hash IS DISTINCT FROM NEW.record_hash OR
           OLD.previous_hash IS DISTINCT FROM NEW.previous_hash${extraChecks} THEN
          RAISE EXCEPTION 'No se permite modificar registros de asistencia (Res. 38 DT). Use correcciones.';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Trigger para UPDATE (una sentencia por llamada: el driver HTTP no admite varias en una consulta)
    await sql('DROP TRIGGER IF EXISTS trg_protect_attendance_update ON attendance_records');
    await sql(`
      CREATE TRIGGER trg_protect_attendance_update
        BEFORE UPDATE ON attendance_records
        FOR EACH ROW
        EXECUTE FUNCTION protect_attendance_records()
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
    await sql('DROP TRIGGER IF EXISTS trg_block_attendance_delete ON attendance_records');
    await sql(`
      CREATE TRIGGER trg_block_attendance_delete
        BEFORE DELETE ON attendance_records
        FOR EACH ROW
        EXECUTE FUNCTION block_attendance_delete()
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
  // v2
  HASH_VERSION,
  canonicalPrefixV2,
  contentDigestV2,
  computeRecordHashV2,
  isV2Ready,
  _resetV2Cache,
};
