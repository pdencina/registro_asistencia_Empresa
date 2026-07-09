const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

const TZ = 'America/Santiago';

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();

  try {
    const records = await sql(`
      SELECT ar.*, e.first_name, e.last_name, e.rut, e.department, e.photo_url
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE date(ar.timestamp AT TIME ZONE $1) = date(NOW() AT TIME ZONE $1)
      ORDER BY ar.timestamp DESC
    `, [TZ]);

    return res.status(200).json(records);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
