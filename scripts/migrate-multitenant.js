/**
 * Migración Multi-Tenant para Neon Postgres.
 * Agrega tabla de tenants, columna tenant_id a las tablas existentes,
 * y crea la estructura para soportar múltiples clientes.
 * 
 * Ejecutar: DATABASE_URL=postgres://... node scripts/migrate-multitenant.js
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: Falta la variable DATABASE_URL');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log('Iniciando migración multi-tenant...\n');

  // 1. Tabla de Tenants (clientes/empresas)
  await sql(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(200) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      rut_empresa VARCHAR(20),
      plan VARCHAR(50) DEFAULT 'basico',
      max_employees INTEGER DEFAULT 30,
      max_devices INTEGER DEFAULT 1,
      admin_email VARCHAR(200) NOT NULL,
      admin_pin_hash VARCHAR(200),
      logo_url TEXT,
      active BOOLEAN DEFAULT true,
      trial_ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✓ Tabla tenants creada');

  // 2. Agregar tenant_id a employees (si no existe)
  await sql(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'tenant_id'
      ) THEN
        ALTER TABLE employees ADD COLUMN tenant_id UUID REFERENCES tenants(id);
        CREATE INDEX idx_employees_tenant ON employees(tenant_id);
      END IF;
    END $$;
  `);
  console.log('✓ Columna tenant_id agregada a employees');

  // 3. Agregar tenant_id a attendance_records (si no existe)
  await sql(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'attendance_records' AND column_name = 'tenant_id'
      ) THEN
        ALTER TABLE attendance_records ADD COLUMN tenant_id UUID REFERENCES tenants(id);
        CREATE INDEX idx_attendance_tenant ON attendance_records(tenant_id);
      END IF;
    END $$;
  `);
  console.log('✓ Columna tenant_id agregada a attendance_records');

  // 4. Agregar tenant_id a authorized_devices (si no existe)
  await sql(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'authorized_devices' AND column_name = 'tenant_id'
      ) THEN
        ALTER TABLE authorized_devices ADD COLUMN tenant_id UUID REFERENCES tenants(id);
        CREATE INDEX idx_devices_tenant ON authorized_devices(tenant_id);
      END IF;
    END $$;
  `);
  console.log('✓ Columna tenant_id agregada a authorized_devices');

  // 5. Tabla de schedules con tenant_id
  await sql(`
    CREATE TABLE IF NOT EXISTS schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id),
      name VARCHAR(100) NOT NULL,
      entry_time TIME NOT NULL,
      exit_time TIME NOT NULL,
      tolerance_minutes INTEGER DEFAULT 15,
      days_of_week VARCHAR(20) DEFAULT '1,2,3,4,5',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✓ Tabla schedules creada');

  // 6. Tabla de asignación horario-empleado
  await sql(`
    CREATE TABLE IF NOT EXISTS employee_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES tenants(id),
      employee_id UUID REFERENCES employees(id),
      schedule_id UUID REFERENCES schedules(id),
      effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
      effective_to DATE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(employee_id, schedule_id, effective_from)
    )
  `);
  console.log('✓ Tabla employee_schedules creada');

  // 7. Tabla de settings por tenant
  await sql(`
    CREATE TABLE IF NOT EXISTS tenant_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID UNIQUE REFERENCES tenants(id),
      geolocation_enabled BOOLEAN DEFAULT true,
      geolocation_radius_meters INTEGER DEFAULT 100,
      biometric_consent_required BOOLEAN DEFAULT true,
      notification_email VARCHAR(200),
      webhook_url TEXT,
      timezone VARCHAR(50) DEFAULT 'America/Santiago',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✓ Tabla tenant_settings creada');

  // 8. Tabla de subscriptions (billing)
  await sql(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID UNIQUE REFERENCES tenants(id),
      plan VARCHAR(50) NOT NULL DEFAULT 'basico',
      status VARCHAR(20) DEFAULT 'trial',
      monthly_price INTEGER,
      billing_cycle VARCHAR(10) DEFAULT 'monthly',
      current_period_start TIMESTAMPTZ,
      current_period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('✓ Tabla subscriptions creada');

  console.log('\n✅ Migración multi-tenant completada exitosamente!');
  console.log('\nPróximos pasos:');
  console.log('1. Crear un tenant inicial con: INSERT INTO tenants (name, slug, admin_email) ...');
  console.log('2. Actualizar registros existentes con el tenant_id correspondiente');
  console.log('3. Hacer NOT NULL la columna tenant_id una vez migrados los datos');
}

migrate().catch(err => {
  console.error('Error en migración:', err.message);
  process.exit(1);
});
