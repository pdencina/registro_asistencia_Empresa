/**
 * Genera el SQL de seed para pegar directamente en Neon SQL Editor.
 * Ejecutar: node scripts/generate-sql-seed.js > seed-data.sql
 */

const TENANT_ID = '0bedbeb6-ea87-4953-864d-e1bee9525111';

const EMPLOYEES = [
  { id: 'd23ed6bf-3cf8-4119-9c9a-4a2edb57ebba', name: 'María' },
  { id: 'aad5f728-0742-440a-b771-c4a8a49c7707', name: 'Carlos' },
  { id: '901a2427-1789-4959-a64b-7a2cb6e712da', name: 'Andrea' },
  { id: '6e5dfb67-74c5-4672-82bb-95ac85eb867e', name: 'Jorge' },
  { id: '802e250d-abdd-4029-bef4-599b57fa7dd1', name: 'Claudia' },
  { id: '6f9f7e8d-e919-4cd1-956f-b9e19ae7d939', name: 'Roberto' },
  { id: 'fa4fc751-e156-4a25-bfc5-89e1f57bde32', name: 'Patricia' },
  { id: 'fc375b2e-6ced-4799-8908-a0f630ab60d5', name: 'Felipe' },
  { id: '9ef1a473-4dc9-49e2-b581-b164bbb0bbac', name: 'Valentina' },
  { id: '9951c92a-9d48-466a-a82e-e05f6a240e32', name: 'Sebastián' },
  { id: 'baaae916-da0c-4332-ba01-b8da52b5a8f3', name: 'Camila' },
  { id: '0a2f66c2-29cb-44a2-a45c-e4af62cc365f', name: 'Ignacio' },
];

// Arrival patterns: [min_minutes, max_minutes] from midnight
// Schedule: 08:30 entry, 18:00 exit, 10 min tolerance → late after 08:40
const PATTERNS = [
  { arrival: [505, 515], departure: [1080, 1100], absent: 0.02 }, // María: 8:25-8:35, punctual
  { arrival: [510, 530], departure: [1070, 1090], absent: 0.05 }, // Carlos: 8:30-8:50, sometimes late
  { arrival: [495, 510], departure: [1080, 1100], absent: 0.03 }, // Andrea: 8:15-8:30, always early
  { arrival: [520, 555], departure: [1080, 1095], absent: 0.08 }, // Jorge: 8:40-9:15, often late
  { arrival: [505, 520], departure: [1075, 1090], absent: 0.05 }, // Claudia: 8:25-8:40
  { arrival: [485, 505], departure: [1070, 1085], absent: 0.02 }, // Roberto: 8:05-8:25, always early
  { arrival: [508, 518], departure: [1080, 1095], absent: 0.04 }, // Patricia: 8:28-8:38
  { arrival: [535, 570], departure: [1085, 1110], absent: 0.10 }, // Felipe: 8:55-9:30, very late
  { arrival: [490, 508], departure: [1070, 1080], absent: 0.03 }, // Valentina: 8:10-8:28, early
  { arrival: [505, 518], departure: [1080, 1120], absent: 0.05 }, // Sebastián: 8:25-8:38, sometimes stays late
  { arrival: [512, 535], departure: [1075, 1090], absent: 0.06 }, // Camila: 8:32-8:55, sometimes late
  { arrival: [480, 500], departure: [1070, 1080], absent: 0.02 }, // Ignacio: 8:00-8:20, earliest
];

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Generate 60 working days going back from today
const today = new Date(2026, 6, 14); // July 14, 2026
const workingDays = [];
const d = new Date(today);
while (workingDays.length < 60) {
  d.setDate(d.getDate() - 1);
  const dow = d.getDay();
  if (dow >= 1 && dow <= 5) {
    workingDays.push(new Date(d));
  }
}
workingDays.reverse();

const lines = [];
lines.push('-- Flexio Demo Seed: 60 working days × 12 employees');
lines.push('-- Generated for tenant: British High School (bhs)');
lines.push('');
lines.push('INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes) VALUES');

const values = [];

for (const day of workingDays) {
  const dateStr = day.toISOString().split('T')[0];
  const dayIndex = workingDays.indexOf(day);
  const monthPhase = dayIndex < 20 ? 0 : dayIndex < 40 ? 1 : 2;

  for (let i = 0; i < EMPLOYEES.length; i++) {
    const emp = EMPLOYEES[i];
    const pattern = PATTERNS[i];

    // Absent check
    let absentChance = pattern.absent;
    if (i === 7) absentChance = [0.15, 0.08, 0.04][monthPhase]; // Felipe improves
    if (i === 3) absentChance = [0.05, 0.10, 0.15][monthPhase]; // Jorge worsens

    if (Math.random() < absentChance) continue;

    // Entry time
    let arrMin = pattern.arrival[0];
    let arrMax = pattern.arrival[1];
    if (i === 7) { // Felipe improves over time
      arrMin = [545, 525, 510][monthPhase];
      arrMax = [575, 545, 530][monthPhase];
    }

    const entryMin = randomBetween(arrMin, arrMax);
    const exitMin = randomBetween(pattern.departure[0], pattern.departure[1]);

    const entryH = String(Math.floor(entryMin / 60)).padStart(2, '0');
    const entryM = String(entryMin % 60).padStart(2, '0');
    const entryS = String(randomBetween(0, 59)).padStart(2, '0');

    const exitH = String(Math.floor(exitMin / 60)).padStart(2, '0');
    const exitM = String(exitMin % 60).padStart(2, '0');
    const exitS = String(randomBetween(0, 59)).padStart(2, '0');

    const entryTs = `${dateStr} ${entryH}:${entryM}:${entryS}-04`;
    const exitTs = `${dateStr} ${exitH}:${exitM}:${exitS}-04`;

    values.push(`('${uuid()}', '${TENANT_ID}', '${emp.id}', 'entry', '${entryTs}', 'visual', NULL)`);
    values.push(`('${uuid()}', '${TENANT_ID}', '${emp.id}', 'exit', '${exitTs}', 'visual', NULL)`);
  }
}

// Split into chunks of 500 for Neon limits
const CHUNK = 500;
for (let i = 0; i < values.length; i += CHUNK) {
  const chunk = values.slice(i, i + CHUNK);
  if (i === 0) {
    lines.push(chunk.join(',\n') + (i + CHUNK < values.length ? ';' : ';'));
  } else {
    lines.push('');
    lines.push('INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes) VALUES');
    lines.push(chunk.join(',\n') + ';');
  }
}

console.log(lines.join('\n'));
