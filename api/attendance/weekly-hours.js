const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

const TZ = 'America/Santiago';

/**
 * GET /api/attendance/weekly-hours
 * Returns accumulated hours worked per employee for the current (or specified) week.
 * Pairs entry+exit records to calculate worked time per day.
 * 
 * Query params:
 *   - week_start (optional): YYYY-MM-DD of Monday. Defaults to current week.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    // Determine week range (Monday to Sunday)
    let weekStart;
    if (req.query.week_start) {
      weekStart = new Date(req.query.week_start + 'T12:00:00');
    } else {
      const now = new Date();
      const day = now.getDay();
      weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    }
    weekStart.setHours(12, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const startDate = weekStart.toISOString().split('T')[0];
    const endDate = weekEnd.toISOString().split('T')[0];

    // Get all employees with their schedule info
    const employees = await sql(`
      SELECT e.id, e.first_name, e.last_name, e.department, e.photo_url,
             ws.shift_type, ws.weekly_hours, ws.name as schedule_name, ws.lunch_break_minutes
      FROM employees e
      LEFT JOIN employee_schedules es ON es.employee_id = e.id
      LEFT JOIN work_schedules ws ON es.schedule_id = ws.id
      WHERE e.tenant_id = $1 AND e.active = true
      ORDER BY e.last_name, e.first_name
    `, [tenant.id]);

    // Get all attendance records for this week
    const records = await sql(`
      SELECT 
        employee_id, type,
        timestamp,
        to_char(timestamp AT TIME ZONE $1, 'YYYY-MM-DD') as work_date,
        to_char(timestamp AT TIME ZONE $1, 'HH24:MI') as work_time
      FROM attendance_records
      WHERE tenant_id = $2
        AND date(timestamp AT TIME ZONE $1) >= $3
        AND date(timestamp AT TIME ZONE $1) <= $4
      ORDER BY employee_id, timestamp
    `, [TZ, tenant.id, startDate, endDate]);

    // Group records by employee and day, pair entries with exits
    const byEmployee = {};
    for (const r of records) {
      if (!byEmployee[r.employee_id]) byEmployee[r.employee_id] = {};
      if (!byEmployee[r.employee_id][r.work_date]) byEmployee[r.employee_id][r.work_date] = { entries: [], exits: [] };
      if (r.type === 'entry') byEmployee[r.employee_id][r.work_date].entries.push(r.timestamp);
      else byEmployee[r.employee_id][r.work_date].exits.push(r.timestamp);
    }

    // Calculate hours per employee
    const results = employees.map(emp => {
      const weeklyHoursContract = emp.weekly_hours || null;
      const lunchBreak = emp.lunch_break_minutes || 30;
      emp.lunch_break_minutes = lunchBreak;
      const empRecords = byEmployee[emp.id] || {};
      let totalMinutes = 0;
      const dailyBreakdown = [];

      // For each day of the week
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + d);
        const dateStr = date.toISOString().split('T')[0];
        const dayData = empRecords[dateStr];

        if (!dayData || dayData.entries.length === 0) {
          dailyBreakdown.push({ date: dateStr, minutes: 0, entry: null, exit: null });
          continue;
        }

        // Take first entry and last exit
        const firstEntry = new Date(dayData.entries[0]);
        const lastExit = dayData.exits.length > 0 ? new Date(dayData.exits[dayData.exits.length - 1]) : null;

        if (lastExit) {
          const workedMinutes = Math.round((lastExit - firstEntry) / 60000);
          // Subtract lunch break (from schedule or default 30 min) if worked more than 5 hours
          const lunchBreak = emp.lunch_break_minutes || 30;
          const effective = workedMinutes > 300 ? workedMinutes - lunchBreak : workedMinutes;
          totalMinutes += Math.max(0, effective);
          dailyBreakdown.push({
            date: dateStr,
            minutes: Math.max(0, effective),
            entry: firstEntry.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
            exit: lastExit.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
          });
        } else {
          // Entry without exit — count from entry to now (if today) or ignore
          const today = new Date().toISOString().split('T')[0];
          if (dateStr === today) {
            const now = new Date();
            const workedMinutes = Math.round((now - firstEntry) / 60000);
            totalMinutes += Math.max(0, workedMinutes);
            dailyBreakdown.push({
              date: dateStr,
              minutes: Math.max(0, workedMinutes),
              entry: firstEntry.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }),
              exit: 'en curso',
            });
          } else {
            dailyBreakdown.push({ date: dateStr, minutes: 0, entry: firstEntry.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }), exit: 'sin salida' });
          }
        }
      }

      const totalHours = Math.floor(totalMinutes / 60);
      const totalMins = totalMinutes % 60;
      const percentage = weeklyHoursContract ? Math.round((totalMinutes / (weeklyHoursContract * 60)) * 100) : null;

      // Status
      let status = 'normal';
      if (weeklyHoursContract) {
        if (totalMinutes >= weeklyHoursContract * 60) status = 'exceeded';
        else if (totalMinutes >= weeklyHoursContract * 60 * 0.9) status = 'warning';
      }

      return {
        employee_id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        department: emp.department,
        photo_url: emp.photo_url,
        schedule_name: emp.schedule_name || 'Sin horario',
        shift_type: emp.shift_type || 'fixed',
        weekly_hours_contract: weeklyHoursContract,
        total_minutes: totalMinutes,
        total_hours: totalHours,
        total_mins: totalMins,
        percentage,
        status,
        daily: dailyBreakdown,
      };
    });

    // Sort: flexible schedules first, then by percentage descending
    results.sort((a, b) => {
      if (a.shift_type === 'flexible' && b.shift_type !== 'flexible') return -1;
      if (b.shift_type === 'flexible' && a.shift_type !== 'flexible') return 1;
      return (b.percentage || 0) - (a.percentage || 0);
    });

    return res.status(200).json({
      week_start: startDate,
      week_end: endDate,
      total_employees: results.length,
      flexible_employees: results.filter(r => r.shift_type === 'flexible').length,
      alerts: {
        exceeded: results.filter(r => r.status === 'exceeded').length,
        warning: results.filter(r => r.status === 'warning').length,
      },
      employees: results,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
