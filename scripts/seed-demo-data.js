/**
 * Script para poblar datos de demo a través de la API real.
 * Simula el uso normal: crear empleados y registrar asistencia con patrones variados.
 * 
 * Uso: 
 *   BASE_URL=https://flexio.cl TENANT_SLUG=bhs ADMIN_TOKEN=tu_token node scripts/seed-demo-data.js
 * 
 * ADMIN_TOKEN es el mismo token de super admin (base64 de GLOBAL_ADMIN_SECRET:timestamp)
 */

const BASE_URL = process.env.BASE_URL || 'https://flexio.cl';
const TENANT_SLUG = process.env.TENANT_SLUG || 'bhs';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const EMPLOYEES = [
  { rut: '12.456.789-0', first_name: 'María', last_name: 'González', department: 'Administración', position: 'Directora Administrativa', email: '' },
  { rut: '13.567.890-1', first_name: 'Carlos', last_name: 'Muñoz', department: 'Educación', position: 'Docente Matemáticas', email: '' },
  { rut: '14.678.901-2', first_name: 'Andrea', last_name: 'Soto', department: 'Educación', position: 'Docente Lenguaje', email: '' },
  { rut: '15.789.012-3', first_name: 'Jorge', last_name: 'Ramírez', department: 'Educación', position: 'Docente Ciencias', email: '' },
  { rut: '16.890.123-4', first_name: 'Claudia', last_name: 'Morales', department: 'Educación', position: 'Docente Historia', email: '' },
  { rut: '17.901.234-5', first_name: 'Roberto', last_name: 'Fuentes', department: 'Mantención', position: 'Jefe Mantención', email: '' },
  { rut: '18.012.345-6', first_name: 'Patricia', last_name: 'Vega', department: 'Administración', position: 'Secretaria', email: '' },
  { rut: '19.123.456-7', first_name: 'Felipe', last_name: 'Torres', department: 'Educación', position: 'Docente Inglés', email: '' },
  { rut: '20.234.567-8', first_name: 'Valentina', last_name: 'Díaz', department: 'Educación', position: 'Docente Ed. Física', email: '' },
  { rut: '21.345.678-9', first_name: 'Sebastián', last_name: 'Araya', department: 'Tecnología', position: 'Soporte TI', email: '' },
  { rut: '22.456.789-0', first_name: 'Camila', last_name: 'Herrera', department: 'Educación', position: 'Docente Arte', email: '' },
  { rut: '23.567.890-1', first_name: 'Ignacio', last_name: 'Pizarro', department: 'Mantención', position: 'Auxiliar', email: '' },
];

// Patterns: what time each employee typically arrives (minutes from midnight)
// Schedule: 08:00 entry, some arrive early, some late
const PATTERNS = [
  { arrival: [475, 485], departure: [1080, 1100], absent_chance: 0.02 }, // María: 7:55-8:05, always punctual
  { arrival: [485, 510], departure: [1070, 1090], absent_chance: 0.05 }, // Carlos: 8:05-8:30, usually on time
  { arrival: [470, 480], departure: [1080, 1100], absent_chance: 0.03 }, // Andrea: 7:50-8:00, always early
  { arrival: [490, 530], departure: [1080, 1095], absent_chance: 0.08 }, // Jorge: 8:10-8:50, often late
  { arrival: [480, 495], departure: [1075, 1090], absent_chance: 0.05 }, // Claudia: 8:00-8:15
  { arrival: [460, 475], departure: [1070, 1085], absent_chance: 0.02 }, // Roberto: 7:40-7:55, super early
  { arrival: [478, 488], departure: [1080, 1095], absent_chance: 0.04 }, // Patricia: 7:58-8:08
  { arrival: [500, 545], departure: [1085, 1100], absent_chance: 0.10 }, // Felipe: 8:20-9:05, frequently late
  { arrival: [465, 480], departure: [1070, 1080], absent_chance: 0.03 }, // Valentina: 7:45-8:00, early
  { arrival: [480, 490], departure: [1080, 1110], absent_chance: 0.05 }, // Sebastián: 8:00-8:10, sometimes stays late
  { arrival: [485, 505], departure: [1075, 1090], absent_chance: 0.06 }, // Camila: 8:05-8:25
  { arrival: [455, 470], departure: [1070, 1080], absent_chance: 0.02 }, // Ignacio: 7:35-7:50, earliest
];

async function request(path, options = {}) {
  const url = `${BASE_URL}/api${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-slug': TENANT_SLUG,
      ...options.headers,
    },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${data.error || JSON.stringify(data)}`);
  return data;
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

async function main() {
  console.log(`\n🚀 Seeding demo data for tenant: ${TENANT_SLUG}`);
  console.log(`   Base URL: ${BASE_URL}\n`);

  // 1. Create employees
  console.log('📋 Creating employees...');
  const createdEmployees = [];

  for (const emp of EMPLOYEES) {
    try {
      const result = await request('/employees', {
        method: 'POST',
        body: JSON.stringify(emp),
      });
      createdEmployees.push(result);
      console.log(`   ✓ ${emp.first_name} ${emp.last_name} (${emp.department})`);
    } catch (err) {
      if (err.message.includes('409') || err.message.includes('Ya existe')) {
        console.log(`   ⏭ ${emp.first_name} ${emp.last_name} (ya existe)`);
        // Try to find existing
        const all = await request(`/employees?search=${emp.rut}`);
        const found = all.find(e => e.rut === emp.rut);
        if (found) createdEmployees.push(found);
      } else {
        console.log(`   ✗ ${emp.first_name} ${emp.last_name}: ${err.message}`);
      }
    }
  }

  console.log(`\n   Total: ${createdEmployees.length} empleados\n`);

  // 2. Generate attendance for the last 60 working days (~3 months)
  console.log('⏰ Registering attendance (last 60 working days / ~3 months)...\n');

  const today = new Date();
  const workingDays = [];
  const d = new Date(today);
  while (workingDays.length < 60) {
    d.setDate(d.getDate() - 1);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5) {
      workingDays.push(new Date(d));
    }
  }
  workingDays.reverse(); // oldest first

  let totalEntries = 0;
  let totalExits = 0;
  let totalAbsent = 0;

  for (const day of workingDays) {
    const dateStr = day.toISOString().split('T')[0];
    console.log(`   📅 ${dateStr} (${day.toLocaleDateString('es-CL', { weekday: 'long' })})`);

    for (let i = 0; i < createdEmployees.length; i++) {
      const emp = createdEmployees[i];
      const pattern = PATTERNS[i] || PATTERNS[0];

      // Check if absent — slightly vary by "month" within the period
      const dayIndex = workingDays.indexOf(day);
      const monthPhase = dayIndex < 20 ? 0 : dayIndex < 40 ? 1 : 2; // 0=first month, 1=second, 2=third
      let absentChance = pattern.absent_chance;
      // Some employees improve over time, some get worse
      if (i === 7) absentChance = [0.15, 0.10, 0.05][monthPhase]; // Felipe improves
      if (i === 3) absentChance = [0.05, 0.08, 0.12][monthPhase]; // Jorge gets worse

      if (Math.random() < absentChance) {
        totalAbsent++;
        continue;
      }

      // Generate entry time — slight variation by month
      let arrivalMin = pattern.arrival[0];
      let arrivalMax = pattern.arrival[1];
      // Roberto and Ignacio: consistently early all 3 months (bono puntualidad)
      // Felipe: starts very late, improves month by month
      if (i === 7) { // Felipe
        arrivalMin = [520, 505, 490][monthPhase];
        arrivalMax = [560, 530, 510][monthPhase];
      }

      const entryMinutes = randomBetween(arrivalMin, arrivalMax);
      const exitMinutes = randomBetween(pattern.departure[0], pattern.departure[1]);

      // Create entry timestamp (Chile time → UTC)
      const entryDate = new Date(day);
      entryDate.setHours(Math.floor(entryMinutes / 60), entryMinutes % 60, randomBetween(0, 59), 0);

      // Create exit timestamp
      const exitDate = new Date(day);
      exitDate.setHours(Math.floor(exitMinutes / 60), exitMinutes % 60, randomBetween(0, 59), 0);

      try {
        // Create ISO timestamps in Chile timezone (UTC-4)
        // Format: YYYY-MM-DDTHH:MM:SS-04:00
        const dateStr = day.toISOString().split('T')[0];
        const entryTime = minutesToTime(entryMinutes);
        const exitTime = minutesToTime(exitMinutes);
        const entrySeconds = String(randomBetween(0, 59)).padStart(2, '0');
        const exitSeconds = String(randomBetween(0, 59)).padStart(2, '0');

        const entryTimestamp = `${dateStr}T${entryTime}:${entrySeconds}-04:00`;
        const exitTimestamp = `${dateStr}T${exitTime}:${exitSeconds}-04:00`;

        // Register entry via seed endpoint (with custom timestamp)
        await fetch(`${BASE_URL}/api/attendance/seed`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ADMIN_TOKEN}`,
          },
          body: JSON.stringify({
            tenant_slug: TENANT_SLUG,
            employee_id: emp.id,
            type: 'entry',
            timestamp: entryTimestamp,
          }),
        });
        totalEntries++;

        // Register exit
        await fetch(`${BASE_URL}/api/attendance/seed`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ADMIN_TOKEN}`,
          },
          body: JSON.stringify({
            tenant_slug: TENANT_SLUG,
            employee_id: emp.id,
            type: 'exit',
            timestamp: exitTimestamp,
          }),
        });
        totalExits++;
      } catch (err) {
        // Ignore errors
      }
    }
  }

  console.log(`\n✅ Demo data seeded!`);
  console.log(`   Entries: ${totalEntries}`);
  console.log(`   Exits: ${totalExits}`);
  console.log(`   Absences: ${totalAbsent}`);
  console.log(`\n   Go to: ${BASE_URL}/admin/${TENANT_SLUG}\n`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
