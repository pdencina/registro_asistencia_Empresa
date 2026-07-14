const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

const TZ = 'America/Santiago';

/**
 * GET /api/attendance/calendar
 * Returns daily attendance status per employee for a given month.
 * 
 * Query: year, month (1-12), employee_id (optional)
 * 
 * Returns per employee per day: present | late | absent | leave | weekend
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();
  const now = new Date();
  const year = parseInt(req.query.year) || now.getFullYear();
  const month = parseInt(req.query.month) || (now.getMonth() + 1);
  const filterEmployee = req.query.employee_id || null;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  try {
    // Get employees
    let empQuery = 'SELECT id, first_name, last_name, department, photo_url FROM employees WHERE tenant_id = $1 AND active = true';
    const empParams = [tenant.id];
    if (filterEmployee) {
      empQuery += ' AND id = $2';
      empParams.push(filterEmployee);
    }
    empQuery += ' ORDER BY last_name, first_name';
    const employees = await sql(empQuery, empParams);

    // Get schedule for late detection
    let entryTime = '08:30';
    let tolerance = 10;
    try {
      const [sch] = await sql('SELECT entry_time, tolerance_minutes FROM schedules WHERE tenant_id = $1 AND active = true LIMIT 1', [tenant.id]);
      if (sch) {
        entryTime = (sch.entry_time || '08:30').slice(0, 5);
        tolerance = sch.tolerance_minutes || 10;
      }
    } catch (e) {}
    const [eH, eM] = entryTime.split(':').map(Number);
    const maxEntry = eH * 60 + eM + tolerance;

    // Get all entry records for the month
    const records = await sql(`
      SELECT employee_id,
             to_char(timestamp AT TIME ZONE $1, 'YYYY-MM-DD') as day,
             to_char(timestamp AT TIME ZONE $1, 'HH24:MI') as time
      FROM attendance_records
      WHERE tenant_id = $2 AND type = 'entry'
        AND date(timestamp AT TIME ZONE $1) >= $3
        AND date(timestamp AT TIME ZONE $1) <= $4
      ORDER BY timestamp
    `, [TZ, tenant.id, startDate, endDate]);

    // Get medical leaves
    let medicalLeaves = [];
    try {
      medicalLeaves = await sql(`
        SELECT employee_id, start_date, end_date
        FROM medical_leaves
        WHERE tenant_id = $1 AND start_date <= $3 AND end_date >= $2
      `, [tenant.id, startDate, endDate]);
    } catch (e) {}

    // Get approved leave requests
    let approvedLeaves = [];
    try {
      approvedLeaves = await sql(`
        SELECT employee_id, type, start_date, end_date
        FROM leave_requests
        WHERE tenant_id = $1 AND status = 'approved' AND start_date <= $3 AND end_date >= $2
      `, [tenant.id, startDate, endDate]);
    } catch (e) {}

    // Build lookup: employee_id -> day -> entry time
    const entryMap = {};
    for (const r of records) {
      const key = `${r.employee_id}|${r.day}`;
      if (!entryMap[key]) entryMap[key] = r.time; // first entry of day
    }

    // Build leave lookup: employee_id -> Set of dates on leave
    const leaveDates = {};
    for (const l of [...medicalLeaves, ...approvedLeaves]) {
      if (!leaveDates[l.employee_id]) leaveDates[l.employee_id] = new Set();
      const s = new Date(l.start_date + 'T12:00:00');
      const e = new Date(l.end_date + 'T12:00:00');
      const cur = new Date(s);
      while (cur <= e) {
        leaveDates[l.employee_id].add(cur.toISOString().split('T')[0]);
        cur.setDate(cur.getDate() + 1);
      }
    }

    // Generate calendar data
    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const calendar = employees.map(emp => {
      const days = [];
      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const date = new Date(dateStr + 'T12:00:00');
        const dow = date.getDay();

        if (dow === 0 || dow === 6) {
          days.push({ date: dateStr, status: 'weekend' });
          continue;
        }

        if (date > today) {
          days.push({ date: dateStr, status: 'future' });
          continue;
        }

        // Check if on leave
        if (leaveDates[emp.id]?.has(dateStr)) {
          days.push({ date: dateStr, status: 'leave' });
          continue;
        }

        // Check entry
        const key = `${emp.id}|${dateStr}`;
        const entryTimeStr = entryMap[key];

        if (!entryTimeStr) {
          days.push({ date: dateStr, status: 'absent' });
        } else {
          const [h, m] = entryTimeStr.split(':').map(Number);
          const entryMinutes = h * 60 + m;
          if (entryMinutes > maxEntry) {
            days.push({ date: dateStr, status: 'late', time: entryTimeStr });
          } else {
            days.push({ date: dateStr, status: 'present', time: entryTimeStr });
          }
        }
      }

      return {
        employee_id: emp.id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        department: emp.department,
        photo_url: emp.photo_url,
        days,
      };
    });

    return res.status(200).json({
      year,
      month,
      month_name: new Date(year, month - 1).toLocaleDateString('es-CL', { month: 'long' }),
      total_days: lastDay,
      schedule: { entry_time: entryTime, tolerance },
      employees: calendar,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
