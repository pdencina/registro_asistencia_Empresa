// Seed de demos agrícolas: Pi Berries + Catrimaitén
// Uso: node scripts/seed-fundos.mjs "postgresql://..."
// O define DATABASE_URL en el entorno.

import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.argv[2] || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ Falta DATABASE_URL. Uso: node scripts/seed-fundos.mjs "postgresql://..."');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const NOMBRES = ['José','María','Luis','Rosa','Pedro','Carmen','Juan','Ana','Carlos','Marta','Miguel','Elena','Francisco','Sofía','Manuel','Laura','Jorge','Patricia','Sergio','Gloria','Raúl','Teresa','Víctor','Sara','Óscar','Julia','Andrés','Nancy','Cristián','Paola','Rodrigo','Isabel','Mario','Cecilia','Alberto','Verónica','Héctor','Mónica','Gonzalo','Silvia'];
const APELLIDOS = ['Huenchún','Millán','Catrileo','Paillao','Curín','Nahuel','Antileo','Colil','Marilef','Quidel','Llanca','Painé','Cayún','Huaiquín','Neculmán','Trafipán','Manquel','Lemún','Curihual','Ñanco','Painemal','Coña','Huircán','Melín','Calfún','Loncón','Traipe','Aillapán','Marileo','Namuncura'];

const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rndRut = () => `${7 + Math.floor(Math.random()*13)}.${String(Math.floor(Math.random()*1000)).padStart(3,'0')}.${String(Math.floor(Math.random()*1000)).padStart(3,'0')}-${Math.floor(Math.random()*10)}`;

async function seedFundo({ slug, name, rut, adminEmail, adminPass, gpsLat, gpsLng, comuna, cosecha, packing }) {
  console.log(`\n🌱 Seeding ${name} (${slug})...`);

  // Crear o obtener tenant
  let [tenant] = await sql`SELECT id FROM tenants WHERE slug = ${slug}`;
  if (!tenant) {
    [tenant] = await sql`
      INSERT INTO tenants (id, name, slug, rut_empresa, admin_email, admin_password, admin_pin_hash, plan, max_employees, max_devices, active, trial_ends_at)
      VALUES (gen_random_uuid(), ${name}, ${slug}, ${rut}, ${adminEmail}, ${adminPass}, '1234', 'agricola', 5000, 50, true, NOW() + INTERVAL '15 days')
      RETURNING id`;
    console.log(`  ✅ Tenant creado`);
  } else {
    console.log(`  ℹ️  Tenant ya existe, limpiando data...`);
  }
  const tid = tenant.id;

  // Limpiar
  await sql`DELETE FROM attendance_records WHERE tenant_id = ${tid}`;
  await sql`DELETE FROM employees WHERE tenant_id = ${tid}`;

  // Horario cosecha
  await sql`INSERT INTO work_schedules (id, name, entry_time, exit_time, tolerance_minutes, lunch_break_minutes)
            VALUES (gen_random_uuid(), 'Cosecha', '07:00', '16:00', 10, 45)`;

  // Crear temporeros de cosecha
  const empIds = [];
  for (let i = 0; i < cosecha; i++) {
    const [e] = await sql`
      INSERT INTO employees (id, tenant_id, first_name, last_name, rut, department, position, consent_status, active, created_at, updated_at)
      VALUES (gen_random_uuid(), ${tid}, ${rnd(NOMBRES)}, ${rnd(APELLIDOS) + ' ' + rnd(APELLIDOS)}, ${rndRut()}, 'Cosecha', 'Temporero', 'approved', true, NOW(), NOW())
      RETURNING id`;
    empIds.push(e.id);
  }

  // Packing (si aplica)
  for (let i = 0; i < packing; i++) {
    const [e] = await sql`
      INSERT INTO employees (id, tenant_id, first_name, last_name, rut, department, position, consent_status, active, created_at, updated_at)
      VALUES (gen_random_uuid(), ${tid}, ${rnd(NOMBRES)}, ${rnd(APELLIDOS)}, ${rndRut()}, 'Packing', 'Operario Packing', 'approved', true, NOW(), NOW())
      RETURNING id`;
    empIds.push(e.id);
  }
  console.log(`  ✅ ${empIds.length} trabajadores creados`);

  // Marcajes: última semana (lun-sab)
  let marks = 0;
  for (let d = 6; d >= 0; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    const dow = date.getDay();
    if (dow === 0) continue; // domingo no

    const dateStr = date.toISOString().split('T')[0];

    for (const empId of empIds) {
      if (Math.random() >= 0.91) continue; // ~91% asistencia

      // Entrada
      const entryH = Math.random() < 0.73 ? 6 : 7;
      const entryM = entryH === 6 ? 50 + Math.floor(Math.random()*20) : 11 + Math.floor(Math.random()*30);
      const entryTime = `${dateStr}T${String(entryH).padStart(2,'0')}:${String(entryM % 60).padStart(2,'0')}:00`;
      const gps = `GPS: ${gpsLat}${10 + Math.floor(Math.random()*80)}, ${gpsLng}${10 + Math.floor(Math.random()*80)} (${comuna})`;

      await sql`INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
                VALUES (gen_random_uuid(), ${tid}, ${empId}, 'entry', ${entryTime}, 'rut', ${gps})`;

      // Salida
      const exitH = Math.random() < 0.80 ? 16 : 17;
      const exitM = Math.floor(Math.random()*60);
      const exitTime = `${dateStr}T${String(exitH).padStart(2,'0')}:${String(exitM).padStart(2,'0')}:00`;
      await sql`INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
                VALUES (gen_random_uuid(), ${tid}, ${empId}, 'exit', ${exitTime}, 'rut', ${gps})`;
      marks += 2;
    }
  }
  console.log(`  ✅ ${marks} marcaciones generadas`);
  console.log(`  🔗 Admin: flexio.cl/admin/${slug} · Marcaje: flexio.cl/marcaje/${slug}`);
}

async function main() {
  await seedFundo({
    slug: 'pi-berries', name: 'Pi Berries SpA', rut: '77.123.456-7',
    adminEmail: 'administracion@picapital.cl', adminPass: 'piberries2026',
    gpsLat: '-39.6', gpsLng: '-72.9', comuna: 'Mafil',
    cosecha: 50, packing: 10,
  });

  await seedFundo({
    slug: 'catrimaiten', name: 'Catrimaitén SpA', rut: '77.234.567-8',
    adminEmail: 'administracion@picapital.cl', adminPass: 'catrimaiten2026',
    gpsLat: '-39.3', gpsLng: '-72.6', comuna: 'Loncoche',
    cosecha: 60, packing: 0,
  });

  console.log('\n✅ Listo. Las 2 demos están cargadas.\n');
}

main().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
