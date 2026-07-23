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
      ORDER BY timestamp ASC
    `, [id, tenant.id, TZ]);

    const lastRecord = records.length > 0 ? records[records.length - 1] : null;
    const entryRecord = records.find(r => r.type === 'entry') || null;
    const exitRecord = records.find(r => r.type === 'exit') || null;
    const status = !lastRecord ? 'absent' :
                   lastRecord.type === 'entry' ? 'present' : 'exited';

    // Calculate hours worked if both entry and exit exist
    let hoursWorked = null;
    if (entryRecord && exitRecord) {
      const diffMs = new Date(exitRecord.timestamp) - new Date(entryRecord.timestamp);
      hoursWorked = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
    }

    return res.status(200).json({
      employee_id: id,
      status,
      last_record: lastRecord,
      entry_time: entryRecord ? new Date(entryRecord.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : null,
      exit_time: exitRecord ? new Date(exitRecord.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : null,
      hours_worked: hoursWorked,
      next_action: status === 'present' ? 'exit' : 'entry'
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
