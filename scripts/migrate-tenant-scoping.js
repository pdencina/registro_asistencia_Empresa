/**
 * Migración: aislamiento por empresa de horarios y autorizadores.
 *
 * Contexto: work_schedules y authorizers no tenían tenant_id, así que todas las empresas
 * compartían esos datos. La API ya filtra por tenant_id y trata las filas con tenant_id NULL
 * como "legado compartido" (visibles para todos) para no perder información.
 *
 * Este script reduce ese conjunto legado:
 *  - work_schedules sin tenant: si TODOS los empleados que lo usan son de una sola empresa,
 *    se asigna a esa empresa. Si lo usan varias, se CLONA una copia por empresa y se reasignan
 *    los empleados. Si nadie lo usa, se deja sin tenant y se reporta.
 *  - authorizers sin tenant: si solo hay una empresa activa se asignan a ella; con varias no hay
 *    forma segura de saberlo, se reportan para revisión manual.
 *
 * Uso:
 *   node scripts/migrate-tenant-scoping.js            # simulación (no escribe nada)
 *   node scripts/migrate-tenant-scoping.js --apply    # aplica los cambios
 *
 * Es idempotente: se puede volver a ejecutar.
 */

require('dotenv').config();
const { neon } = require('@neondatabase/serverless');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL no configurada');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const sql = neon(DATABASE_URL);

async function main() {
  console.log(APPLY ? '== MODO APLICAR ==' : '== SIMULACION (usa --apply para escribir) ==');

  await sql('ALTER TABLE work_schedules ADD COLUMN IF NOT EXISTS tenant_id UUID');
  await sql('ALTER TABLE authorizers ADD COLUMN IF NOT EXISTS tenant_id UUID');

  // ---------- Horarios ----------
  const orphanSchedules = await sql('SELECT * FROM work_schedules WHERE tenant_id IS NULL');
  console.log(`\nHorarios sin empresa: ${orphanSchedules.length}`);

  let assigned = 0, cloned = 0, unused = 0;
  for (const sch of orphanSchedules) {
    const users = await sql(
      `SELECT e.tenant_id, array_agg(es.employee_id) AS employee_ids
       FROM employee_schedules es JOIN employees e ON e.id = es.employee_id
       WHERE es.schedule_id = $1 AND e.tenant_id IS NOT NULL
       GROUP BY e.tenant_id`,
      [sch.id]
    );

    if (users.length === 0) {
      unused++;
      console.log(`  - "${sch.name}" (${sch.id}): sin uso, queda compartido`);
      continue;
    }

    if (users.length === 1) {
      assigned++;
      console.log(`  - "${sch.name}": se asigna a la empresa ${users[0].tenant_id}`);
      if (APPLY) await sql('UPDATE work_schedules SET tenant_id = $1 WHERE id = $2', [users[0].tenant_id, sch.id]);
      continue;
    }

    // Usado por varias empresas: la primera conserva el original, las demás reciben una copia
    console.log(`  - "${sch.name}": usado por ${users.length} empresas, se clona`);
    const [first, ...rest] = users;
    if (APPLY) await sql('UPDATE work_schedules SET tenant_id = $1 WHERE id = $2', [first.tenant_id, sch.id]);
    for (const u of rest) {
      cloned++;
      if (!APPLY) continue;
      const [copy] = await sql(
        `INSERT INTO work_schedules (id, name, entry_time, exit_time, tolerance_minutes, is_default,
           block2_entry_time, block2_exit_time, shift_type, rotation_days_on, rotation_days_off,
           rotation_start_date, weekly_hours, lunch_break_minutes, tenant_id)
         SELECT gen_random_uuid(), name, entry_time, exit_time, tolerance_minutes, is_default,
           block2_entry_time, block2_exit_time, shift_type, rotation_days_on, rotation_days_off,
           rotation_start_date, weekly_hours, lunch_break_minutes, $2
         FROM work_schedules WHERE id = $1
         RETURNING id`,
        [sch.id, u.tenant_id]
      );
      await sql('UPDATE employee_schedules SET schedule_id = $1 WHERE employee_id = ANY($2::uuid[]) AND schedule_id = $3',
        [copy.id, u.employee_ids, sch.id]);
    }
  }
  console.log(`Horarios: ${assigned} asignados, ${cloned} clones, ${unused} sin uso`);

  // ---------- Autorizadores ----------
  const orphanAuth = await sql('SELECT * FROM authorizers WHERE tenant_id IS NULL');
  const activeTenants = await sql('SELECT id, slug FROM tenants WHERE active = true');
  console.log(`\nAutorizadores sin empresa: ${orphanAuth.length} | empresas activas: ${activeTenants.length}`);

  if (orphanAuth.length > 0 && activeTenants.length === 1) {
    console.log(`  Solo hay una empresa activa (${activeTenants[0].slug}): se asignan a ella`);
    if (APPLY) await sql('UPDATE authorizers SET tenant_id = $1 WHERE tenant_id IS NULL', [activeTenants[0].id]);
  } else if (orphanAuth.length > 0) {
    console.log('  Hay varias empresas: no se puede inferir el dueno. Revisar manualmente:');
    orphanAuth.forEach(a => console.log(`    - ${a.name} (${a.id})`));
  }

  console.log(APPLY ? '\nListo.' : '\nSimulacion terminada. Ejecuta con --apply para aplicar.');
}

main().catch((e) => { console.error(e); process.exit(1); });
