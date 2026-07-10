const { getDb } = require('../../lib/db');
const { corsHeaders, handleCors } = require('../../lib/cors');
const { requireTenant } = require('../../lib/tenant');

const TZ = 'America/Santiago';

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const { id } = req.query;
  const sql = getDb();

  try {
    // Verificar que el empleado pertenece al tenant
    const [employee] = await sql('SELECT id FROM employees WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
    if (!employee) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    const records = await sql(`
      SELECT * FROM attendance_records 
      WHERE employee_id = $1 AND tenant_id = $2
        AND date(timestamp AT TIME ZONE $3) = date(NOW() AT TIME ZONE $3)
      ORDER BY timestamp DESC 
      LIMIT 1
    `, [id, tenant.id, TZ]);

    const lastRecord = records.length > 0 ? records[0] : null;
    const status = !lastRecord ? 'absent' :
                   lastRecord.type === 'entry' ? 'present' : 'exited';

    return res.status(200).json({
      employee_id: id,
      status,
      last_record: lastRecord,
      next_action: status === 'present' ? 'exit' : 'entry'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
