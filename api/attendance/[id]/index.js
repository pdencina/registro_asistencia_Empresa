const { getDb } = require('../../lib/db');
const { corsHeaders, handleCors } = require('../../lib/cors');
const { requireTenant } = require('../../lib/tenant');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const { id } = req.query;
  const sql = getDb();

  try {
    if (req.method === 'PUT') {
      // Edit attendance record timestamp
      const { timestamp } = req.body;
      if (!timestamp) {
        return res.status(400).json({ error: 'timestamp es requerido' });
      }

      const [record] = await sql('SELECT * FROM attendance_records WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      if (!record) {
        return res.status(404).json({ error: 'Registro no encontrado' });
      }

      await sql('UPDATE attendance_records SET timestamp = $1 WHERE id = $2 AND tenant_id = $3', [timestamp, id, tenant.id]);

      const [updated] = await sql(`
        SELECT ar.*, e.first_name, e.last_name, e.rut, e.department
        FROM attendance_records ar
        JOIN employees e ON ar.employee_id = e.id
        WHERE ar.id = $1
      `, [id]);

      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      // Verificar que el registro pertenece a este tenant
      const [record] = await sql('SELECT * FROM attendance_records WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      if (!record) {
        return res.status(404).json({ error: 'Registro no encontrado' });
      }

      await sql('DELETE FROM attendance_records WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);

      return res.status(200).json({ message: 'Registro eliminado', deleted: record });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
