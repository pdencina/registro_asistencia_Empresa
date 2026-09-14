// Completa solo las marcaciones de Catrimaitén (los empleados ya existen)
import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.argv[2] || process.env.DATABASE_URL;
const sql = neon(DATABASE_URL);

async function main() {
  const [tenant] = await sql`SELECT id FROM tenants WHERE slug = 'catrimaiten'`;
  if (!tenant) { console.error('No existe catrimaiten'); process.exit(1); }
  const tid = tenant.id;

  // Limpiar marcas previas por si acaso
  await sql`DELETE FROM attendance_records WHERE tenant_id = ${tid}`;

  const emps = await sql`SELECT id FROM employees WHERE tenant_id = ${tid} AND active = true`;
  const empIds = emps.map(e => e.id);
  console.log(`Empleados: ${empIds.length}`);

  // Construir todas las filas y hacer inserts en lote (VALUES múltiples)
  const rows = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    if (date.getDay() === 0) continue;
    const dateStr = date.toISOString().split('T')[0];

    for (const empId of empIds) {
      if (Math.random() >= 0.90) continue;
      const entryH = Math.random() < 0.72 ? 6 : 7;
      const entryM = entryH === 6 ? 50 + Math.floor(Math.random()*10) : 11 + Math.floor(Math.random()*30);
      const gps = `GPS: -39.3${10 + Math.floor(Math.random()*80)}, -72.6${10 + Math.floor(Math.random()*80)} (Loncoche)`;
      rows.push({ empId, type: 'entry', ts: `${dateStr}T${String(entryH).padStart(2,'0')}:${String(entryM).padStart(2,'0')}:00`, gps });
      const exitH = Math.random() < 0.80 ? 16 : 17;
      const exitM = Math.floor(Math.random()*60);
      rows.push({ empId, type: 'exit', ts: `${dateStr}T${String(exitH).padStart(2,'0')}:${String(exitM).padStart(2,'0')}:00`, gps });
    }
  }

  console.log(`Insertando ${rows.length} marcaciones en lotes...`);

  // Insertar en lotes de 50 con Promise.all
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await Promise.all(batch.map(r =>
      sql`INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
          VALUES (gen_random_uuid(), ${tid}, ${r.empId}, ${r.type}, ${r.ts}, 'rut', ${r.gps})`
    ));
    process.stdout.write(`  ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
  }

  console.log(`\n✅ ${rows.length} marcaciones de Catrimaitén cargadas.`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
