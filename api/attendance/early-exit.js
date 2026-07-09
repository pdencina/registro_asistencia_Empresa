const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const sql = getDb();

  await sql(`
    CREATE TABLE IF NOT EXISTS early_exits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      attendance_record_id UUID,
      employee_id UUID REFERENCES employees(id),
      reason VARCHAR(50) NOT NULL,
      authorized_by UUID,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  try {
    if (req.method === 'POST') {
      const { attendance_record_id, employee_id, reason, authorized_by, notes } = req.body;

      if (!employee_id || !reason) {
        return res.status(400).json({ error: 'employee_id y reason son requeridos' });
      }

      const [record] = await sql(`
        INSERT INTO early_exits (id, attendance_record_id, employee_id, reason, authorized_by, notes)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
        RETURNING *
      `, [attendance_record_id || null, employee_id, reason, authorized_by || null, notes || null]);

      return res.status(201).json(record);
    }

    // GET: get early exits for an employee
    if (req.method === 'GET') {
      const { employee_id } = req.query;
      const exits = await sql(`
        SELECT ee.*, a.name as authorizer_name
        FROM early_exits ee
        LEFT JOIN authorizers a ON ee.authorized_by = a.id
        WHERE ee.employee_id = $1
        ORDER BY ee.created_at DESC
      `, [employee_id]);
      return res.status(200).json(exits);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
