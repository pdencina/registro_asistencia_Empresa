const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

const TZ = 'America/Santiago';

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();
  // If no date provided, use today in Chile timezone
  const date = req.query.date || null;

  try {
    const [totalEmployees] = await sql('SELECT COUNT(*) as count FROM employees WHERE active = true');

    let presentQuery, exitedQuery, lastRecordsQuery;

    if (date) {
      [presentQuery] = await sql(`
        SELECT COUNT(DISTINCT employee_id) as count 
        FROM attendance_records 
        WHERE date(timestamp AT TIME ZONE $1) = $2 AND type = 'entry'
      `, [TZ, date]);

      [exitedQuery] = await sql(`
        SELECT COUNT(DISTINCT employee_id) as count 
        FROM attendance_records 
        WHERE date(timestamp AT TIME ZONE $1) = $2 AND type = 'exit'
      `, [TZ, date]);

      lastRecordsQuery = await sql(`
        SELECT ar.*, e.first_name, e.last_name, e.photo_url
        FROM attendance_records ar
        JOIN employees e ON ar.employee_id = e.id
        WHERE date(ar.timestamp AT TIME ZONE $1) = $2
        ORDER BY ar.timestamp DESC
        LIMIT 10
      `, [TZ, date]);
    } else {
      [presentQuery] = await sql(`
        SELECT COUNT(DISTINCT employee_id) as count 
        FROM attendance_records 
        WHERE date(timestamp AT TIME ZONE $1) = date(NOW() AT TIME ZONE $1) AND type = 'entry'
      `, [TZ]);

      [exitedQuery] = await sql(`
        SELECT COUNT(DISTINCT employee_id) as count 
        FROM attendance_records 
        WHERE date(timestamp AT TIME ZONE $1) = date(NOW() AT TIME ZONE $1) AND type = 'exit'
      `, [TZ]);

      lastRecordsQuery = await sql(`
        SELECT ar.*, e.first_name, e.last_name, e.photo_url
        FROM attendance_records ar
        JOIN employees e ON ar.employee_id = e.id
        WHERE date(ar.timestamp AT TIME ZONE $1) = date(NOW() AT TIME ZONE $1)
        ORDER BY ar.timestamp DESC
        LIMIT 10
      `, [TZ]);
    }

    const total = Number(totalEmployees?.count || 0);
    const present = Number(presentQuery?.count || 0);
    const exited = Number(exitedQuery?.count || 0);

    return res.status(200).json({
      date: date || new Date().toLocaleDateString('en-CA', { timeZone: TZ }),
      total_employees: total,
      present_today: present,
      exited_today: exited,
      absent: total - present,
      last_records: lastRecordsQuery
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
