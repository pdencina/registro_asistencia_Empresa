const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

const TZ = 'America/Santiago';

// Chilean holidays 2026
const HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-04-03', '2026-04-04', '2026-05-01', '2026-05-21',
  '2026-06-20', '2026-06-29', '2026-07-16', '2026-08-15', '2026-09-18',
  '2026-09-19', '2026-10-12', '2026-10-31', '2026-11-01', '2026-12-08',
  '2026-12-25',
]);

/**
 * GET /api/attendance/payroll-report
 * 
 * Generates a payroll-ready report with:
 * - Days worked (remunerados)
 * - Days absent (no remunerados / descuento)
 * - Justified absences (no se descuentan)
 * - Late arrivals
 * - Overtime hours broken down by rate (50%, 100%)
 * - Total regular hours
 * 
 * Query: start_date, end_date, employee_id (optional)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();
  const { start_date, end_date, employee_id } = req.query;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: 'start_date y end_date son obligatorios' });
  }

  try {
    // Get all active employees
    let empQuery = 'SELECT id, first_name, last_name, rut, department, position FROM employees WHERE tenant_id = $1 AND active = true';
    const empParams = [tenant.id];
    if (employee_id) {
      empQuery += ' AND id = $2';
      empParams.push(employee_id);
    }
    empQuery += ' ORDER BY last_name, first_name';
    const employees = await sql(empQuery, empParams);

    // Get all records in period
    const records = await sql(`
      SELECT employee_id, type, timestamp,
        date(timestamp AT TIME ZONE $1) as work_date,
        to_char(timestamp AT TIME ZONE $1, 'HH24:MI') as time_str
      FROM attendance_records
      WHERE tenant_id = $2
        AND date(timestamp AT TIME ZONE $1) >= $3
        AND date(timestamp AT TIME ZONE $1) <= $4
      ORDER BY timestamp
    `, [TZ, tenant.id, start_date, end_date]);

    // Get justifications
    let justifications = [];
    try {
      justifications = await sql(
        'SELECT employee_id, date FROM justifications WHERE tenant_id = $1 AND date >= $2 AND date <= $3',
        [tenant.id, start_date, end_date]
      );
    } catch (e) {}
    const justMap = {};
    for (const j of justifications) {
      const key = `${j.employee_id}_${j.date}`;
      justMap[key] = true;
    }

    // Get medical leaves
    let medLeaves = [];
    try {
      medLeaves = await sql(
        'SELECT employee_id, start_date, end_date FROM medical_leaves WHERE tenant_id = $1 AND start_date <= $2 AND end_date >= $3',
        [tenant.id, end_date, start_date]
      );
    } catch (e) {}

    // Get schedules per employee
    let scheduleMap = {};
    try {
      const assignments = await sql(`
        SELECT es.employee_id, ws.entry_time, ws.exit_time, ws.tolerance_minutes, ws.lunch_break_minutes
        FROM employee_schedules es
        JOIN work_schedules ws ON es.schedule_id = ws.id
      `);
      for (const a of assignments) scheduleMap[a.employee_id] = a;
    } catch (e) {}

    // Calculate working days in period
    const workingDays = getWorkingDays(start_date, end_date);
    const holidaysInPeriod = getHolidaysInPeriod(start_date, end_date);

    // Group records by employee and date
    const recordsByEmp = {};
    for (const r of records) {
      if (!recordsByEmp[r.employee_id]) recordsByEmp[r.employee_id] = {};
      if (!recordsByEmp[r.employee_id][r.work_date]) recordsByEmp[r.employee_id][r.work_date] = [];
      recordsByEmp[r.employee_id][r.work_date].push(r);
    }

    // Build payroll data per employee
    const payrollData = employees.map(emp => {
      const empRecords = recordsByEmp[emp.id] || {};
      const schedule = scheduleMap[emp.id] || { entry_time: '08:30', exit_time: '17:30', tolerance_minutes: 10, lunch_break_minutes: 30 };

      const [schEntryH, schEntryM] = (schedule.entry_time || '08:30').slice(0, 5).split(':').map(Number);
      const [schExitH, schExitM] = (schedule.exit_time || '17:30').slice(0, 5).split(':').map(Number);
      const scheduledDailyMinutes = (schExitH * 60 + schExitM) - (schEntryH * 60 + schEntryM) - (schedule.lunch_break_minutes || 30);
      const tolerance = schedule.tolerance_minutes || 10;

      let daysWorked = 0;
      let daysAbsent = 0;
      let daysJustified = 0;
      let daysOnLeave = 0;
      let lateCount = 0;
      let totalWorkedMinutes = 0;
      let overtimeMinutes50 = 0;
      let overtimeMinutes100 = 0;

      // Iterate through each working day
      const cur = new Date(start_date + 'T12:00:00');
      const endD = new Date(end_date + 'T12:00:00');

      while (cur <= endD) {
        const dateStr = cur.toISOString().split('T')[0];
        const dayOfWeek = cur.getDay();

        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          // Check if worked on weekend (overtime 100%)
          if (empRecords[dateStr]) {
            const dayRecs = empRecords[dateStr];
            const entry = dayRecs.find(r => r.type === 'entry');
            const exit = dayRecs.find(r => r.type === 'exit');
            if (entry && exit) {
              const worked = Math.round((new Date(exit.timestamp) - new Date(entry.timestamp)) / 60000);
              overtimeMinutes100 += worked;
              totalWorkedMinutes += worked;
              daysWorked++;
            }
          }
          cur.setDate(cur.getDate() + 1);
          continue;
        }

        const isHoliday = HOLIDAYS_2026.has(dateStr);

        // Check if on medical leave
        const onLeave = medLeaves.some(l => l.employee_id === emp.id && dateStr >= l.start_date && dateStr <= l.end_date);
        if (onLeave) {
          daysOnLeave++;
          cur.setDate(cur.getDate() + 1);
          continue;
        }

        // Check if justified
        const justKey = `${emp.id}_${dateStr}`;
        if (justMap[justKey]) {
          daysJustified++;
          cur.setDate(cur.getDate() + 1);
          continue;
        }

        // Check attendance
        if (!empRecords[dateStr]) {
          daysAbsent++;
          cur.setDate(cur.getDate() + 1);
          continue;
        }

        const dayRecs = empRecords[dateStr];
        const entry = dayRecs.find(r => r.type === 'entry');
        const exit = dayRecs.find(r => r.type === 'exit');

        if (!entry) {
          daysAbsent++;
          cur.setDate(cur.getDate() + 1);
          continue;
        }

        daysWorked++;

        // Check tardiness
        const [eH, eM] = entry.time_str.split(':').map(Number);
        const entryMinutes = eH * 60 + eM;
        if (entryMinutes > schEntryH * 60 + schEntryM + tolerance) {
          lateCount++;
        }

        // Calculate worked time
        if (exit) {
          const workedRaw = Math.round((new Date(exit.timestamp) - new Date(entry.timestamp)) / 60000);
          const worked = workedRaw > 300 ? workedRaw - (schedule.lunch_break_minutes || 30) : workedRaw;
          totalWorkedMinutes += worked;

          // Overtime: time beyond scheduled exit
          const overtime = Math.max(0, worked - scheduledDailyMinutes);
          if (overtime > 0) {
            if (isHoliday) {
              overtimeMinutes100 += overtime;
            } else {
              overtimeMinutes50 += overtime;
            }
          }
        }

        cur.setDate(cur.getDate() + 1);
      }

      const totalRegularHours = Math.round((totalWorkedMinutes - overtimeMinutes50 - overtimeMinutes100) / 60 * 10) / 10;
      const overtime50Hours = Math.round(overtimeMinutes50 / 60 * 10) / 10;
      const overtime100Hours = Math.round(overtimeMinutes100 / 60 * 10) / 10;

      return {
        employee_id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        rut: emp.rut,
        department: emp.department,
        position: emp.position,
        // Days
        working_days_in_period: workingDays,
        days_worked: daysWorked,
        days_absent_unjustified: daysAbsent,
        days_justified: daysJustified,
        days_medical_leave: daysOnLeave,
        days_remunerated: daysWorked + daysJustified + daysOnLeave,
        days_not_remunerated: daysAbsent,
        // Hours
        total_worked_hours: Math.round(totalWorkedMinutes / 60 * 10) / 10,
        regular_hours: totalRegularHours,
        overtime_50_hours: overtime50Hours,
        overtime_100_hours: overtime100Hours,
        // Tardiness
        late_arrivals: lateCount,
        // Holidays
        holidays_in_period: holidaysInPeriod,
      };
    });

    return res.status(200).json({
      period: { start_date, end_date, working_days: workingDays, holidays: holidaysInPeriod },
      tenant_name: tenant.name,
      generated_at: new Date().toISOString(),
      employees: payrollData,
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
    if (day >= 1 && day <= 5 && !HOLIDAYS_2026.has(cur.toISOString().split('T')[0])) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function getHolidaysInPeriod(start, end) {
  let count = 0;
  for (const h of HOLIDAYS_2026) {
    if (h >= start && h <= end) count++;
  }
  return count;
}
