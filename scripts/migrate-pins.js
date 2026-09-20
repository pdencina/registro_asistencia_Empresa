/**
 * Migración de los PIN en texto plano (employees.personal_pin) a credenciales con hash (employee_credentials).
 *
 *   node scripts/migrate-pins.js                     # simulación: solo cuenta, no escribe
 *   node scripts/migrate-pins.js --apply             # PASO 1: crea la credencial con hash de cada PIN (NO borra el texto plano)
 *   node scripts/migrate-pins.js --purge-plaintext   # PASO 2 (irreversible): anula personal_pin de quienes ya tienen credencial
 *
 * Por qué son dos pasos: el flujo legado de marcación identifica al trabajador comparando el PIN en texto
 * plano, así que el texto plano solo puede borrarse en las empresas que ya dejaron el flujo legado
 * (política con legacy_marking = false). El paso 2 se limita a esas empresas.
 *
 * Requiere la migración 002 aplicada (node scripts/migrate.js --apply) y PIN_PEPPER definido en el entorno.
 * Los PIN de la base NO se imprimen en ningún momento.
 */

require('dotenv').config();
const { getDb } = require('../api/lib/db');
const { getPepper, hashSecret } = require('../api/lib/credentials');

const APPLY = process.argv.includes('--apply');
const PURGE = process.argv.includes('--purge-plaintext');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no configurada');
  const pepper = getPepper();
  console.log(`Pepper: ${pepper.source} (id ${pepper.id})`);
  if (pepper.source !== 'PIN_PEPPER') {
    console.log('AVISO: PIN_PEPPER no está definido; se deriva de otro secreto. Si ese secreto cambia, los PIN dejarán de verificarse y habrá que restablecerlos.');
  }

  const sql = getDb();

  if (PURGE) {
    const rows = await sql(`
      SELECT e.id FROM employees e
        JOIN employee_credentials c ON c.employee_id = e.id AND c.type = 'PIN'
        JOIN LATERAL (
          SELECT legacy_marking FROM tenant_attendance_policy p WHERE p.tenant_id = e.tenant_id ORDER BY version DESC LIMIT 1
        ) pol ON true
       WHERE e.personal_pin IS NOT NULL AND pol.legacy_marking = false`);
    console.log(`Trabajadores con PIN en texto plano y credencial con hash, en empresas sin flujo legado: ${rows.length}`);
    if (!rows.length) return;
    console.log('Esta acción es IRREVERSIBLE: el texto plano se anula.');
    if (!APPLY) { console.log('Simulación. Agrega --apply junto a --purge-plaintext para ejecutar.'); return; }
    await sql(`UPDATE employees SET personal_pin = NULL WHERE id = ANY($1::uuid[])`, [rows.map((r) => r.id)]);
    console.log(`PIN en texto plano anulados: ${rows.length}`);
    return;
  }

  const pending = await sql(`
    SELECT e.id, e.tenant_id, e.personal_pin FROM employees e
     WHERE e.personal_pin IS NOT NULL AND e.personal_pin <> ''
       AND NOT EXISTS (SELECT 1 FROM employee_credentials c WHERE c.employee_id = e.id AND c.type = 'PIN')`);
  const [{ n: hashed }] = await sql("SELECT COUNT(*)::int AS n FROM employee_credentials WHERE type = 'PIN'");
  console.log(`PIN en texto plano sin credencial con hash: ${pending.length} | credenciales con hash existentes: ${hashed}`);

  if (!pending.length) return;
  if (!APPLY) { console.log('Simulación. Ejecuta con --apply para crear las credenciales.'); return; }

  let done = 0;
  for (const e of pending) {
    await sql(
      `INSERT INTO employee_credentials (tenant_id, employee_id, type, secret_hash, set_by)
       VALUES ($1, $2, 'PIN', $3, 'MIGRATION') ON CONFLICT (employee_id, type) DO NOTHING`,
      [e.tenant_id, e.id, hashSecret(e.personal_pin)]
    );
    done++;
  }
  console.log(`Credenciales creadas: ${done}. El texto plano NO se tocó; usa --purge-plaintext cuando corresponda.`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
