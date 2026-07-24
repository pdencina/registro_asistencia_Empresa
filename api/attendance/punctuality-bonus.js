const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

const TZ = 'America/Santiago';

/**
 * GET /api/attendance/punctuality-bonus
 * 
 * Calculates punctuality bonus eligibility by configurable period.
 * A collaborator qualifies if they have 0 unjustified tardiness AND 0 unjustified absences in the period.
 * 
 * Query params:
 *   - period: 'trimester1' | 'trimester2' | 'trimester3' | 'custom'
 *   - year: (optional, default current year)
 *   - start_date, end_date: (for custom)
 *   - max_tardies: (optional) max allowed tardies to still qualify (default 0)
 *   - max_absences: (optional) max allowed absences to still qualify (default 0)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();
  const { period = 'trimester1', year, start_date, end_date, max_tardies = '0', max_absences = '0' } = req.query;
  const maxTardies = parseInt(max_tardies);
  const maxAbsences = parseInt(max_absences);
  const currentYear = year || new Date().getFullYear();

  // Determine dates
  let startDate, endDate, periodLabel;
  const trimesters = {
    trimester1: { start: `${currentYear}-03-01`, end: `${currentYear}-05-31`, label: 'Marzo - Mayo' },
    trimester2: { start: `${currentYear}-06-01`, end: `${currentYear}-08-31`, label: 'Junio - Agosto' },
    trimester3: { start: `${currentYear}-09-01`, end: `${currentYear}-11-30`, label: 'Septiembre - Noviembre' },
    trimester4: { start: `${currentYear}-12-01`, end: `${currentYear}-12-31`, label: 'Diciembre' },
  };

  if (period === 'custom' && start_date && end_date) {
    startDate = start_date;
    endDate = end_date;
    periodLabel = `${start_date} al ${end_date}`;
  } else if (trimesters[period]) {
    startDate = trimesters[period].start;
    endDate = trimesters[period].end;
    periodLabel = trimesters[period].label;
  } else {
    startDate = trimesters.trimester1.start;
    endDate = trimesters.trimester1.end;
    periodLabel = trimesters.trimester1.label;
  }

  try {
    // Get all active employees
    const employees = await sql(
      'SELECT id, first_name, last_name, rut, department, position FROM employees WHERE tenant_id = $1 AND active = true ORDER BY first_name',
      [tenant.id]
    );

    // Get default schedule for tolerance
    let tolerance = 10;
    let entryTime = '08:30';
    try {
      const [schedule] = await sql('SELECT entry_time, tolerance_minutes FROM work_schedules WHERE tenant_id = $1 LIMIT 1', [tenant.id]);
      if (schedule) {
        tolerance = schedule.tolerance_minutes || 10;
        entryTime = schedule.entry_time || '08:30';
      }
    } catch (e) {}

    // Get tardiness count per employee in period
    const tardiness = await sql(`
      SELECT 
        ar.employee_id,
        COUNT(*) as late_count
      FROM attendance_records ar
      JOIN work_schedules ws ON ws.tenant_id = ar.tenant_id
      WHERE ar.tenant_id = $1
        AND ar.type = 'entry'
        AND date(ar.timestamp AT TIME ZONE $2) >= $3
        AND date(ar.timestamp AT TIME ZONE $2) <= $4
        AND EXTRACT(HOUR FROM (ar.timestamp AT TIME ZONE $2)) * 60 + EXTRACT(MINUTE FROM (ar.timestamp AT TIME ZONE $2))
            > EXTRACT(HOUR FROM ws.entry_time::time) * 60 + EXTRACT(MINUTE FROM ws.entry_time::time) + COALESCE(ws.tolerance_minutes, 10)
        AND NOT EXISTS (
          SELECT 1 FROM justifications j 
          WHERE j.employee_id = ar.employee_id AND j.tenant_id = ar.tenant_id
            AND j.date = date(ar.timestamp AT TIME ZONE $2)
        )
      GROUP BY ar.employee_id
    `, [tenant.id, TZ, startDate, endDate]);

    const tardyMap = {};
    for (const t of tardiness) tardyMap[t.employee_id] = parseInt(t.late_count);

    // Get absence count per employee (working days without entry)
    const workingDays = getWorkingDays(startDate, endDate);
    const presenceData = await sql(`
      SELECT employee_id, COUNT(DISTINCT date(timestamp AT TIME ZONE $1)) as days_present
      FROM attendance_records
      WHERE tenant_id = $2 AND type = 'entry'
        AND date(timestamp AT TIME ZONE $1) >= $3
        AND date(timestamp AT TIME ZONE $1) <= $4
      GROUP BY employee_id
    `, [TZ, tenant.id, startDate, endDate]);

    const presenceMap = {};
    for (const p of presenceData) presenceMap[p.employee_id] = parseInt(p.days_present);

    // Get justifications count per employee
    let justMap = {};
    try {
      const justs = await sql(`
        SELECT employee_id, COUNT(*) as just_count
        FROM justifications
        WHERE tenant_id = $1 AND date >= $2 AND date <= $3
        GROUP BY employee_id
      `, [tenant.id, startDate, endDate]);
      for (const j of justs) justMap[j.employee_id] = parseInt(j.just_count);
    } catch (e) {}

    // Calculate eligibility
    const results = employees.map(emp => {
      const tardies = tardyMap[emp.id] || 0;
      const daysPresent = presenceMap[emp.id] || 0;
      const justified = justMap[emp.id] || 0;
      const unjustifiedAbsences = Math.max(0, workingDays - daysPresent - justified);
      const qualifies = tardies <= maxTardies && unjustifiedAbsences <= maxAbsences;

      return {
        ...emp,
        tardies,
        days_present: daysPresent,
        working_days: workingDays,
        justified_absences: justified,
        unjustified_absences: unjustifiedAbsences,
        attendance_rate: workingDays > 0 ? Math.round((daysPresent / workingDays) * 100) : 0,
        qualifies,
        disqualification_reason: !qualifies
          ? (tardies > maxTardies ? `${tardies} atrasos (máx ${maxTardies})` : `${unjustifiedAbsences} ausencias injust. (máx ${maxAbsences})`)
          : null,
      };
    });

    const qualified = results.filter(r => r.qualifies);
    const disqualified = results.filter(r => !r.qualifies);

    return res.status(200).json({
      period: { start: startDate, end: endDate, label: periodLabel, working_days: workingDays },
      criteria: { max_tardies: maxTardies, max_absences: maxAbsences },
      summary: {
        total_employees: results.length,
        qualified: qualified.length,
        disqualified: disqualified.length,
        qualification_rate: results.length > 0 ? Math.round((qualified.length / results.length) * 100) : 0,
      },
      qualified,
      disqualified,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

function getWorkingDays(start, end) {
  let count = 0;
  const cur = new Date(start + 'T12:00:00');
  const endDate = new Date(end + 'T12:00:00');
  while (cur <= endDate) {
    const day = cur.getDay();
    if (day >= 1 && day <= 5) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}
