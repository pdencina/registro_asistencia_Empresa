const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

const TZ = 'America/Santiago';

/**
 * GET /api/attendance/my-hours?rut=12.345.678-9
 * Public endpoint for employees to check their own weekly hours.
 * No auth required — uses RUT as identifier.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();
  const { rut } = req.query;

  if (!rut) {
    return res.status(400).json({ error: 'RUT es requerido' });
  }

  try {
    // Find employee by RUT
    const [employee] = await sql(`
      SELECT e.id, e.first_name, e.last_name, e.department, e.rut, e.tenant_id,
             t.name as tenant_name, t.logo_url as tenant_logo
      FROM employees e
      JOIN tenants t ON e.tenant_id = t.id
      WHERE e.rut = $1 AND e.active = true AND t.active = true
    `, [rut]);

    if (!employee) {
      return res.status(404).json({ error: 'RUT no encontrado en el sistema' });
    }

    // Get schedule
    let weeklyHoursContract = null;
    let scheduleName = 'Sin horario';
    try {
      const [assignment] = await sql(`
        SELECT ws.weekly_hours, ws.name, ws.shift_type
        FROM employee_schedules es
        JOIN work_schedules ws ON es.schedule_id = ws.id
        WHERE es.employee_id = $1
      `, [employee.id]);
      if (assignment) {
        weeklyHoursContract = assignment.weekly_hours;
        scheduleName = assignment.name;
      }
    } catch (e) {}

    // Current week range
    const now = new Date();
    const day = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const startDate = weekStart.toISOString().split('T')[0];
    const endDate = weekEnd.toISOString().split('T')[0];

    // Get attendance records for this week
    const records = await sql(`
      SELECT type, timestamp,
             to_char(timestamp AT TIME ZONE $1, 'YYYY-MM-DD') as work_date,
             to_char(timestamp AT TIME ZONE $1, 'HH24:MI') as work_time
      FROM attendance_records
      WHERE tenant_id = $2 AND employee_id = $3
        AND date(timestamp AT TIME ZONE $1) >= $4
        AND date(timestamp AT TIME ZONE $1) <= $5
      ORDER BY timestamp
    `, [TZ, employee.tenant_id, employee.id, startDate, endDate]);

    // Calculate daily hours
    const dailyMap = {};
    for (const r of records) {
      if (!dailyMap[r.work_date]) dailyMap[r.work_date] = { entries: [], exits: [] };
      if (r.type === 'entry') dailyMap[r.work_date].entries.push(r.work_time);
      else dailyMap[r.work_date].exits.push(r.work_time);
    }

    let totalMinutes = 0;
    const daily = [];

    for (let d = 0; d < 7; d++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + d);
      const dateStr = date.toISOString().split('T')[0];
      const dayData = dailyMap[dateStr];

      if (!dayData || dayData.entries.length === 0) {
        daily.push({ date: dateStr, minutes: 0, entry: null, exit: null });
        continue;
      }

      const entry = dayData.entries[0];
      const exit = dayData.exits.length > 0 ? dayData.exits[dayData.exits.length - 1] : null;

      if (exit) {
        const [eh, em] = entry.split(':').map(Number);
        const [xh, xm] = exit.split(':').map(Number);
        const worked = (xh * 60 + xm) - (eh * 60 + em);
        const effective = worked > 300 ? worked - 30 : worked;
        totalMinutes += Math.max(0, effective);
        daily.push({ date: dateStr, minutes: Math.max(0, effective), entry, exit });
      } else {
        daily.push({ date: dateStr, minutes: 0, entry, exit: 'en curso' });
      }
    }

    const percentage = weeklyHoursContract ? Math.round((totalMinutes / (weeklyHoursContract * 60)) * 100) : null;

    return res.status(200).json({
      employee: {
        first_name: employee.first_name,
        last_name: employee.last_name,
        department: employee.department,
        rut: employee.rut,
      },
      tenant: {
        name: employee.tenant_name,
        logo_url: employee.tenant_logo,
      },
      schedule: {
        name: scheduleName,
        weekly_hours: weeklyHoursContract,
      },
      week: { start: startDate, end: endDate },
      total_minutes: totalMinutes,
      total_hours: Math.floor(totalMinutes / 60),
      total_mins: totalMinutes % 60,
      percentage,
      daily,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
