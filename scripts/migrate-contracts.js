/**
 * Migración para tabla de contratos digitales.
 * Ejecutar: DATABASE_URL=postgres://... node scripts/migrate-contracts.js
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: Falta la variable DATABASE_URL');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log('Creando tabla de contratos...\n');

  await sql(`
    CREATE TABLE IF NOT EXISTS contracts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      plan VARCHAR(50) NOT NULL,
      modalidad VARCHAR(20) NOT NULL DEFAULT 'mensual',
      precio INTEGER,
      firmante_nombre VARCHAR(200),
      firmante_rut VARCHAR(20),
      firmante_email VARCHAR(200),
      firma_digital TEXT,
      firmado_at TIMESTAMPTZ,
      auditoria_firma JSONB,
      prestador_firma TEXT,
      prestador_firmado_at TIMESTAMPTZ,
      prestador_auditoria JSONB,
      estado VARCHAR(20) DEFAULT 'pendiente',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✓ Tabla contracts creada');

  await sql(`CREATE INDEX IF NOT EXISTS idx_contracts_tenant ON contracts(tenant_id)`);
  await sql(`CREATE INDEX IF NOT EXISTS idx_contracts_estado ON contracts(estado)`);
  console.log('✓ Índices creados');

  console.log('\n✅ Migración de contratos completada!');
}

migrate().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
