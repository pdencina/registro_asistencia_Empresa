/**
 * Migración para agregar campos de billing/MercadoPago.
 * Ejecutar: DATABASE_URL=postgres://... node scripts/migrate-billing.js
 */

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: Falta la variable DATABASE_URL');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function migrate() {
  console.log('Migrando campos de billing...\n');

  // Agregar mp_subscription_id a subscriptions
  await sql(`
    ALTER TABLE subscriptions 
    ADD COLUMN IF NOT EXISTS mp_subscription_id VARCHAR(100)
  `);
  console.log('✓ Campo mp_subscription_id agregado a subscriptions');

  // Agregar mp_customer_id a tenants
  await sql(`
    ALTER TABLE tenants 
    ADD COLUMN IF NOT EXISTS mp_customer_id VARCHAR(100)
  `);
  console.log('✓ Campo mp_customer_id agregado a tenants');

  // Agregar campos de pago a subscriptions
  await sql(`
    ALTER TABLE subscriptions 
    ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_payment_amount INTEGER,
    ADD COLUMN IF NOT EXISTS failed_payments INTEGER DEFAULT 0
  `);
  console.log('✓ Campos de historial de pago agregados');

  console.log('\n✅ Migración de billing completada!');
}

migrate().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
