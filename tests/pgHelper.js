// Base de datos real (PGlite = PostgreSQL en WASM) para probar migraciones, cadena de hashes y endpoints.
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

/**
 * Esquema base que imita producción ANTES de la migración 001:
 * attendance_records sin columnas de integridad (las agrega ensureIntegrityColumns en la primera inserción v1).
 */
const BASELINE = `
  CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, active BOOLEAN DEFAULT true,
    admin_email TEXT, max_employees INTEGER DEFAULT 30
  );
  CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID, rut VARCHAR(20), first_name TEXT, last_name TEXT, department TEXT, position TEXT,
    photo_url TEXT, active BOOLEAN DEFAULT true, personal_pin VARCHAR(10), email TEXT, consent_status TEXT
  );
  CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL,
    tenant_id UUID,
    type VARCHAR(10) NOT NULL CHECK (type IN ('entry', 'exit')),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    photo_snapshot_url TEXT,
    method VARCHAR(20) DEFAULT 'visual',
    notes TEXT
  );
  CREATE TABLE tenant_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID UNIQUE, geolocation_enabled BOOLEAN DEFAULT true,
    geolocation_radius_meters INTEGER DEFAULT 100, geolocation_required BOOLEAN DEFAULT false
  );
  CREATE TABLE authorized_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID, device_id VARCHAR(100), name TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION,
    active BOOLEAN DEFAULT true
  );
`;

async function createTestDb({ timezone = 'UTC' } = {}) {
  const pg = new PGlite();
  await pg.exec(`SET TIME ZONE '${timezone}'`);
  await pg.exec(BASELINE);

  // Interfaz "sql(query, params) -> rows" que usan los handlers (misma que el driver de Neon)
  const sql = async (text, params = []) => (await pg.query(text, params)).rows;

  // Interfaz del runner de migraciones (api/lib/migrations.js)
  const db = {
    query: sql,
    batch: async (statements) => {
      await pg.exec('BEGIN');
      try {
        for (const s of statements) await pg.query(s.text, s.params);
        await pg.exec('COMMIT');
      } catch (e) {
        await pg.exec('ROLLBACK');
        throw e;
      }
    },
  };

  return { pg, sql, db };
}

/** Hace que require('api/lib/db') devuelva este sql (los handlers y librerías lo usan vía getDb()). */
function useDb(sql) {
  const dbPath = require.resolve(path.join(__dirname, '../api/lib/db.js'));
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getDb: () => sql } };
}

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

module.exports = { createTestDb, useDb, MIGRATIONS_DIR, BASELINE };
