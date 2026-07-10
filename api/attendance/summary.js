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
  const date = req.query.date || null;

  try {
    const [totalEmployees] = await sql(
      'SELECT COUNT(*) as count FROM employees WHERE tenant_id = $1 AND active = true',
      [tenant.id]
    );

    let presentQuery, exitedQuery, lastRecordsQuery;

    if (date) {
      [presentQuery] = await sql(`
        SELECT COUNT(DISTINCT employee_id) as count 
        FROM attendance_records 
        WHERE tenant_id = $1 AND date(timestamp AT TIME ZONE $2) = $3 AND type = 'entry'
      `, [tenant.id, TZ, date]);

      [exitedQuery] = await sql(`
        SELECT COUNT(DISTINCT employee_id) as count 
        FROM attendance_records 
        WHERE tenant_id = $1 AND date(timestamp AT TIME ZONE $2) = $3 AND type = 'exit'
      `, [tenant.id, TZ, date]);

      lastRecordsQuery = await sql(`
        SELECT ar.*, e.first_name, e.last_name, e.photo_url
        FROM attendance_records ar
        JOIN employees e ON ar.employee_id = e.id
        WHERE ar.tenant_id = $1 AND date(ar.timestamp AT TIME ZONE $2) = $3
        ORDER BY ar.timestamp DESC
        LIMIT 10
      `, [tenant.id, TZ, date]);
    } else {
      [presentQuery] = await sql(`
        SELECT COUNT(DISTINCT employee_id) as count 
        FROM attendance_records 
        WHERE tenant_id = $1 AND date(timestamp AT TIME ZONE $2) = date(NOW() AT TIME ZONE $2) AND type = 'entry'
      `, [tenant.id, TZ]);

      [exitedQuery] = await sql(`
        SELECT COUNT(DISTINCT employee_id) as count 
        FROM attendance_records 
        WHERE tenant_id = $1 AND date(timestamp AT TIME ZONE $2) = date(NOW() AT TIME ZONE $2) AND type = 'exit'
      `, [tenant.id, TZ]);

      lastRecordsQuery = await sql(`
        SELECT ar.*, e.first_name, e.last_name, e.photo_url
        FROM attendance_records ar
        JOIN employees e ON ar.employee_id = e.id
        WHERE ar.tenant_id = $1 AND date(ar.timestamp AT TIME ZONE $2) = date(NOW() AT TIME ZONE $2)
        ORDER BY ar.timestamp DESC
        LIMIT 10
      `, [tenant.id, TZ]);
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
