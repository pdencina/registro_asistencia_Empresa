/**
 * Aplica las migraciones versionadas de /migrations.
 *
 *   node scripts/migrate.js            # simulación: muestra lo pendiente, no escribe nada
 *   node scripts/migrate.js --apply    # aplica las migraciones pendientes (cada una es atómica)
 *
 * Cada migración se registra en schema_migrations con su checksum: una migración ya aplicada no se
 * puede editar (el script aborta); los cambios nuevos van en un archivo nuevo.
 *
 * Orden de despliegue recomendado: 1) desplegar el código, 2) correr este script.
 * El código detecta si la migración está aplicada y, mientras no lo esté, sigue usando el formato anterior.
 */

require('dotenv').config();
const path = require('path');
const { neon } = require('@neondatabase/serverless');
const { planMigrations, applyMigrations, neonAdapter } = require('../api/lib/migrations');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL no configurada');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const DIR = path.join(__dirname, '..', 'migrations');

async function main() {
  const db = neonAdapter(neon(DATABASE_URL));

  const [{ tz }] = await db.query("SELECT current_setting('TimeZone') AS tz");
  console.log(`Zona horaria de la sesión: ${tz}`);

  const plan = await planMigrations(db, DIR);
  console.log(`Migraciones aplicadas: ${plan.appliedCount} | pendientes: ${plan.pending.length}`);
  plan.pending.forEach((m) => console.log(`  - ${m.name} (${m.statements.length} sentencias)`));

  if (plan.changed.length > 0) {
    console.error(`\nERROR: migraciones modificadas tras aplicarse: ${plan.changed.join(', ')}`);
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\nSimulación. Ejecuta con --apply para aplicar.');
    return;
  }

  const result = await applyMigrations(db, DIR, { log: (m) => console.log(m) });
  console.log(result.applied.length ? `\nListo: ${result.applied.join(', ')}` : '\nNada que aplicar.');
}

main().catch((e) => { console.error(e); process.exit(1); });
