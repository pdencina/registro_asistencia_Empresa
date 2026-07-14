const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

const TZ = 'America/Santiago';

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();
  const { period } = req.query; // 'today' | 'week' | 'month'

  try {
    // Determine date range
    const now = new Date();
    let startDate, endDate;

    if (period === 'month') {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endDate = lastDay.toISOString().split('T')[0];
    } else if (period === 'week') {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      startDate = monday.toISOString().split('T')[0];
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      endDate = sunday.toISOString().split('T')[0];
    } else {
      // today
      startDate = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
      endDate = startDate;
    }

    // Total active employees
    const [totalRow] = await sql(
      'SELECT COUNT(*) as count FROM employees WHERE tenant_id = $1 AND active = true',
      [tenant.id]
    );
    const totalEmployees = Number(totalRow.count);

    // Get working days in period (exclude weekends)
    const workingDays = getWorkingDays(startDate, endDate);

    // 1. ATTENDANCE BY DAY (for trend chart)
    const dailyAttendance = await sql(`
      SELECT 
        to_char(timestamp AT TIME ZONE $1, 'YYYY-MM-DD') as day,
        COUNT(DISTINCT employee_id) as present
      FROM attendance_records
      WHERE tenant_id = $2 AND type = 'entry'
        AND date(timestamp AT TIME ZONE $1) >= $3
        AND date(timestamp AT TIME ZONE $1) <= $4
      GROUP BY day
      ORDER BY day
    `, [TZ, tenant.id, startDate, endDate]);

    // 2. TARDINESS RANKING (employees sorted by late arrivals)
    // Get default schedule entry time
    let defaultEntryTime = '08:30';
    let defaultTolerance = 10;
    try {
      const [sch] = await sql('SELECT entry_time, tolerance_minutes FROM schedules WHERE tenant_id = $1 AND active = true LIMIT 1', [tenant.id]);
      if (sch) {
        defaultEntryTime = (sch.entry_time || '08:30').slice(0, 5);
        defaultTolerance = sch.tolerance_minutes || 10;
      }
    } catch (e) {}

    const [entryH, entryM] = defaultEntryTime.split(':').map(Number);
    const maxEntryMinutes = entryH * 60 + entryM + defaultTolerance;

    const allEntries = await sql(`
      SELECT 
        ar.employee_id,
        e.first_name, e.last_name, e.department, e.photo_url,
        to_char(ar.timestamp AT TIME ZONE $1, 'HH24:MI') as entry_time,
        to_char(ar.timestamp AT TIME ZONE $1, 'YYYY-MM-DD') as entry_date
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.tenant_id = $2 AND ar.type = 'entry'
        AND date(ar.timestamp AT TIME ZONE $1) >= $3
        AND date(ar.timestamp AT TIME ZONE $1) <= $4
      ORDER BY ar.timestamp
    `, [TZ, tenant.id, startDate, endDate]);

    // Calculate tardiness per employee
    const employeeStats = {};
    for (const entry of allEntries) {
      if (!employeeStats[entry.employee_id]) {
        employeeStats[entry.employee_id] = {
          employee_id: entry.employee_id,
          first_name: entry.first_name,
          last_name: entry.last_name,
          department: entry.department,
          photo_url: entry.photo_url,
          total_entries: 0,
          late_count: 0,
          early_count: 0,
          total_late_minutes: 0,
          dates_late: [],
          dates_early: [],
        };
      }

      const [h, m] = entry.entry_time.split(':').map(Number);
      const entryMinutes = h * 60 + m;
      const expectedMinutes = entryH * 60 + entryM;

      // Skip unreasonable entries (after noon)
      if (entryMinutes > 14 * 60) continue;

      employeeStats[entry.employee_id].total_entries++;

      if (entryMinutes > maxEntryMinutes) {
        employeeStats[entry.employee_id].late_count++;
        employeeStats[entry.employee_id].total_late_minutes += (entryMinutes - expectedMinutes);
        employeeStats[entry.employee_id].dates_late.push({
          date: entry.entry_date,
          time: entry.entry_time,
          minutes_late: entryMinutes - expectedMinutes,
        });
      } else if (entryMinutes <= expectedMinutes) {
        employeeStats[entry.employee_id].early_count++;
        employeeStats[entry.employee_id].dates_early.push({
          date: entry.entry_date,
          time: entry.entry_time,
        });
      }
    }

    // Sort by late count (most late first)
    const tardinessRanking = Object.values(employeeStats)
      .sort((a, b) => b.late_count - a.late_count || b.total_late_minutes - a.total_late_minutes);

    // 3. PUNCTUALITY BONUS (employees who were always on time or early)
    const punctualEmployees = Object.values(employeeStats)
      .filter(e => e.late_count === 0 && e.total_entries > 0)
      .sort((a, b) => b.early_count - a.early_count);

    // 4. ABSENCE LIST
    const allEmployees = await sql(
      'SELECT id, first_name, last_name, department, photo_url FROM employees WHERE tenant_id = $1 AND active = true',
      [tenant.id]
    );

    // Get unique days each employee had at least one entry
    const presenceDays = {};
    for (const entry of allEntries) {
      if (!presenceDays[entry.employee_id]) presenceDays[entry.employee_id] = new Set();
      presenceDays[entry.employee_id].add(entry.entry_date);
    }

    const absenceList = allEmployees.map(emp => {
      const daysPresent = presenceDays[emp.id] ? presenceDays[emp.id].size : 0;
      const daysAbsent = Math.max(0, workingDays - daysPresent);
      const attendanceRate = workingDays > 0 ? Math.round((daysPresent / workingDays) * 100) : 0;
      return {
        ...emp,
        days_present: daysPresent,
        days_absent: daysAbsent,
        attendance_rate: attendanceRate,
        absent_dates: getAbsentDates(startDate, endDate, presenceDays[emp.id] || new Set()),
      };
    }).sort((a, b) => a.attendance_rate - b.attendance_rate);

    // 5. OVERALL STATS
    const totalPossibleAttendance = totalEmployees * workingDays;
    const totalActualAttendance = Object.values(presenceDays).reduce((sum, set) => sum + set.size, 0);
    const overallRate = totalPossibleAttendance > 0 ? Math.round((totalActualAttendance / totalPossibleAttendance) * 100) : 0;

    const totalLateEntries = tardinessRanking.reduce((sum, e) => sum + e.late_count, 0);
    const totalOnTimeEntries = tardinessRanking.reduce((sum, e) => sum + (e.total_entries - e.late_count), 0);

    return res.status(200).json({
      period: period || 'today',
      start_date: startDate,
      end_date: endDate,
      working_days: workingDays,
      schedule: { entry_time: defaultEntryTime, tolerance_minutes: defaultTolerance },

      overview: {
        total_employees: totalEmployees,
        attendance_rate: overallRate,
        total_entries: allEntries.length,
        total_late: totalLateEntries,
        total_on_time: totalOnTimeEntries,
        punctual_employees: punctualEmployees.length,
      },

      daily_attendance: dailyAttendance.map(d => ({
        date: d.day,
        present: Number(d.present),
        total: totalEmployees,
        rate: totalEmployees > 0 ? Math.round((Number(d.present) / totalEmployees) * 100) : 0,
      })),

      tardiness_ranking: tardinessRanking.slice(0, 20),
      punctuality_bonus: punctualEmployees.slice(0, 20),
      absence_list: absenceList,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

function getWorkingDays(startStr, endStr) {
  const start = new Date(startStr + 'T12:00:00');
  const end = new Date(endStr + 'T12:00:00');
  let count = 0;
  const current = new Date(start);
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  while (current <= end && current <= today) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function getAbsentDates(startStr, endStr, presentDates) {
  const start = new Date(startStr + 'T12:00:00');
  const end = new Date(endStr + 'T12:00:00');
  const absent = [];
  const current = new Date(start);
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  while (current <= end && current <= today) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      const dateStr = current.toISOString().split('T')[0];
      if (!presentDates.has(dateStr)) {
        absent.push(dateStr);
      }
    }
    current.setDate(current.getDate() + 1);
  }
  return absent;
}
