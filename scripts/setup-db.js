/**
 * Script para crear las tablas en Neon Postgres.
 * Ejecutar una sola vez: node scripts/setup-db.js
 * 
 * Requiere la variable de entorno DATABASE_URL con tu connection string de Neon.
 * Ejemplo: DATABASE_URL=postgres://user:pass@host/db node scripts/setup-db.js
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: Falta la variable DATABASE_URL');
  console.log('Uso: DATABASE_URL=postgres://user:pass@host/db node scripts/setup-db.js');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function setup() {
  console.log('Creando tablas...\n');

  await sql(`
    CREATE TABLE IF NOT EXISTS employees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rut VARCHAR(20) UNIQUE NOT NULL,
      first_name VARCHAR(100) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      department VARCHAR(100),
      position VARCHAR(100),
      photo_url TEXT,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✓ Tabla employees creada');

  await sql(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id),
      type VARCHAR(10) NOT NULL CHECK(type IN ('entry', 'exit')),
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      photo_snapshot_url TEXT,
      method VARCHAR(20) DEFAULT 'visual',
      notes TEXT
    )
  `);
  console.log('✓ Tabla attendance_records creada');

  await sql(`
    CREATE TABLE IF NOT EXISTS authorized_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(100) DEFAULT 'Tótem',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✓ Tabla authorized_devices creada');

  await sql(`CREATE INDEX IF NOT EXISTS idx_att_employee ON attendance_records(employee_id)`);
  await sql(`CREATE INDEX IF NOT EXISTS idx_att_timestamp ON attendance_records(timestamp)`);
  await sql(`CREATE INDEX IF NOT EXISTS idx_att_type ON attendance_records(type)`);
  console.log('✓ Índices creados');

  console.log('\n¡Base de datos lista!');
}

setup().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
