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
  const { employee_id, start_date, end_date, type, department } = req.query;

  try {
    let query = `
      SELECT ar.*, e.first_name, e.last_name, e.rut, e.department, e.photo_url
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.tenant_id = $1
    `;
    const params = [tenant.id, TZ];
    let idx = 3;

    if (employee_id) {
      query += ` AND ar.employee_id = $${idx++}`;
      params.push(employee_id);
    }
    if (start_date) {
      query += ` AND date(ar.timestamp AT TIME ZONE $2) >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND date(ar.timestamp AT TIME ZONE $2) <= $${idx++}`;
      params.push(end_date);
    }
    if (type) {
      query += ` AND ar.type = $${idx++}`;
      params.push(type);
    }
    if (department) {
      query += ` AND e.department = $${idx++}`;
      params.push(department);
    }

    query += ' ORDER BY ar.timestamp DESC LIMIT 500';
    const records = await sql(query, params);

    return res.status(200).json(records);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
