/**
 * Script de Migración: Integridad de Registros (Resolución 38 DT)
 * 
 * Este script:
 * 1. Agrega columnas record_hash, previous_hash, latitude, longitude a attendance_records
 * 2. Calcula hashes para registros existentes (encadenados por tenant)
 * 3. Crea triggers de protección contra UPDATE/DELETE
 * 
 * Ejecutar: node scripts/migrate-integrity.js
 * 
 * IMPORTANTE: Ejecutar UNA sola vez por base de datos.
 */

require('dotenv').config();
const { neon } = require('@neondatabase/serverless');
const { createHash } = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL no configurada');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

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

async function migrate() {
  console.log('🔒 Migración de Integridad — Resolución 38 DT');
  console.log('================================================\n');

  // 1. Agregar columnas
  console.log('1️⃣  Agregando columnas de integridad...');
  await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS record_hash VARCHAR(64)`);
  await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64)`);
  await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()`);
  await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`);
  await sql(`ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`);
  console.log('   ✅ Columnas creadas\n');

  // 2. Calcular hashes para registros existentes
  console.log('2️⃣  Calculando hashes para registros existentes...');
  
  const tenants = await sql('SELECT DISTINCT tenant_id FROM attendance_records');
  console.log(`   Tenants encontrados: ${tenants.length}`);

  let totalHashed = 0;

  for (const { tenant_id } of tenants) {
    const records = await sql(
      `SELECT id, tenant_id, employee_id, type, timestamp, method 
       FROM attendance_records 
       WHERE tenant_id = $1 AND record_hash IS NULL
       ORDER BY timestamp ASC`,
      [tenant_id]
    );

    if (records.length === 0) continue;

    console.log(`   Tenant ${tenant_id.slice(0, 8)}...: ${records.length} registros sin hash`);

    let previousHash = null;

    // Obtener último hash existente para este tenant
    const [lastHashed] = await sql(
      `SELECT record_hash FROM attendance_records 
       WHERE tenant_id = $1 AND record_hash IS NOT NULL
       ORDER BY timestamp DESC LIMIT 1`,
      [tenant_id]
    );
    if (lastHashed) previousHash = lastHashed.record_hash;

    for (const r of records) {
      const ts = typeof r.timestamp === 'string' ? r.timestamp : r.timestamp.toISOString();
      const hash = computeRecordHash({
        id: r.id,
        tenant_id: r.tenant_id,
        employee_id: r.employee_id,
        type: r.type,
        timestamp: ts,
        method: r.method,
        previous_hash: previousHash,
      });

      await sql(
        `UPDATE attendance_records SET record_hash = $1, previous_hash = $2 WHERE id = $3`,
        [hash, previousHash || 'GENESIS', r.id]
      );

      previousHash = hash;
      totalHashed++;
    }
  }

  console.log(`   ✅ ${totalHashed} registros hasheados\n`);

  // 3. Crear triggers de protección
  console.log('3️⃣  Creando triggers de protección...');

  await sql(`
    CREATE OR REPLACE FUNCTION protect_attendance_records()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.id != NEW.id OR
         OLD.tenant_id != NEW.tenant_id OR
         OLD.employee_id != NEW.employee_id OR
         OLD.type != NEW.type OR
         OLD.timestamp != NEW.timestamp OR
         OLD.method != NEW.method OR
         (OLD.record_hash IS NOT NULL AND OLD.record_hash IS DISTINCT FROM NEW.record_hash) OR
         (OLD.previous_hash IS NOT NULL AND OLD.previous_hash IS DISTINCT FROM NEW.previous_hash) THEN
        RAISE EXCEPTION 'No se permite modificar registros de asistencia (Res. 38 DT). Use correcciones.';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await sql(`
    DROP TRIGGER IF EXISTS trg_protect_attendance_update ON attendance_records;
    CREATE TRIGGER trg_protect_attendance_update
      BEFORE UPDATE ON attendance_records
      FOR EACH ROW
      EXECUTE FUNCTION protect_attendance_records();
  `);

  await sql(`
    CREATE OR REPLACE FUNCTION block_attendance_delete()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'No se permite eliminar registros de asistencia (Res. 38 DT).';
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await sql(`
    DROP TRIGGER IF EXISTS trg_block_attendance_delete ON attendance_records;
    CREATE TRIGGER trg_block_attendance_delete
      BEFORE DELETE ON attendance_records
      FOR EACH ROW
      EXECUTE FUNCTION block_attendance_delete();
  `);

  console.log('   ✅ Triggers creados\n');

  // 4. Crear índice para verificación
  console.log('4️⃣  Creando índices...');
  await sql(`CREATE INDEX IF NOT EXISTS idx_attendance_hash ON attendance_records (tenant_id, record_hash)`);
  await sql(`CREATE INDEX IF NOT EXISTS idx_attendance_created ON attendance_records (tenant_id, created_at)`);
  console.log('   ✅ Índices creados\n');

  console.log('================================================');
  console.log('✅ Migración completada exitosamente');
  console.log('   Los registros de asistencia ahora están protegidos.');
  console.log('   Para verificar integridad: GET /api/attendance/verify-integrity');
}

migrate().catch(err => {
  console.error('❌ Error en migración:', err);
  process.exit(1);
});
