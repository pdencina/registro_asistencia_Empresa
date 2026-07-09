const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

const TZ = 'America/Santiago';

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();
  const { employee_id, period } = req.query;

  if (!employee_id) {
    return res.status(400).json({ error: 'employee_id es requerido' });
  }

  try {
    // Get employee's schedule
    let entryTime = '08:30';
    let tolerance = 10;

    // Check employee-specific schedule
    const [assignment] = await sql(`
      SELECT es.custom_entry_time, ws.entry_time, ws.tolerance_minutes
      FROM employee_schedules es
      LEFT JOIN work_schedules ws ON es.schedule_id = ws.id
      WHERE es.employee_id = $1
    `, [employee_id]);

    if (assignment) {
      entryTime = (assignment.custom_entry_time || assignment.entry_time || '08:30').slice(0, 5);
      tolerance = assignment.tolerance_minutes || 10;
    } else {
      // Fall back to default
      const [defaultSch] = await sql('SELECT entry_time, tolerance_minutes FROM work_schedules WHERE is_default = true LIMIT 1');
      if (defaultSch) {
        entryTime = (defaultSch.entry_time || '08:30').slice(0, 5);
        tolerance = defaultSch.tolerance_minutes;
      }
    }

    // Determine date range
    let startDate;
    const now = new Date();
    if (period === 'week') {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      startDate = monday.toISOString().split('T')[0];
    } else if (period === 'month') {
      startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    } else {
      // Default: this week
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      startDate = monday.toISOString().split('T')[0];
    }

    // Get all entries in the period
    const entries = await sql(`
      SELECT id, timestamp, 
             to_char(timestamp AT TIME ZONE $1, 'HH24:MI') as entry_time_local,
             to_char(timestamp AT TIME ZONE $1, 'YYYY-MM-DD') as entry_date
      FROM attendance_records 
      WHERE employee_id = $2 
        AND type = 'entry'
        AND date(timestamp AT TIME ZONE $1) >= $3
      ORDER BY timestamp
    `, [TZ, employee_id, startDate]);

    // Calculate tardiness - entry_time + tolerance
    const [hours, minutes] = entryTime.split(':').map(Number);
    const maxEntryMinutes = hours * 60 + minutes + tolerance;

    // Only consider entries that are reasonable (before noon or before exit time + 2hrs)
    // This prevents test entries or afternoon entries from counting as "late"
    const maxReasonableEntry = Math.min((hours + 4) * 60, 14 * 60); // Max 4hrs after expected or noon

    const tardyDays = [];
    for (const entry of entries) {
      const entryLocal = entry.entry_time_local; // Format: "HH:MM"
      const [h, m] = entryLocal.split(':').map(Number);
      const entryMinutes = h * 60 + m;

      // Skip entries that are way too late (probably test data or afternoon)
      if (entryMinutes > maxReasonableEntry) continue;

      if (entryMinutes > maxEntryMinutes) {
        const lateBy = entryMinutes - (hours * 60 + minutes);
        tardyDays.push({
          date: entry.entry_date,
          entry_time: entryLocal,
          expected_time: entryTime.slice(0, 5),
          late_minutes: lateBy,
        });
      }
    }

    return res.status(200).json({
      employee_id,
      period: period || 'week',
      start_date: startDate,
      schedule: { entry_time: entryTime, tolerance_minutes: tolerance },
      tardy_count: tardyDays.length,
      total_entries: entries.length,
      tardy_days: tardyDays,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
