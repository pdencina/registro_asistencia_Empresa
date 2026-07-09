const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const { id } = req.query;
  const sql = getDb();

  try {
    if (req.method === 'GET') {
      const [employee] = await sql('SELECT * FROM employees WHERE id = $1', [id]);
      if (!employee) {
        return res.status(404).json({ error: 'Empleado no encontrado' });
      }
      return res.status(200).json(employee);
    }

    if (req.method === 'PUT') {
      const { rut, first_name, last_name, department, position, active, photo, consent_at } = req.body;

      const [current] = await sql('SELECT * FROM employees WHERE id = $1', [id]);
      if (!current) {
        return res.status(404).json({ error: 'Empleado no encontrado' });
      }

      // Handle consent timestamp
      if (consent_at) {
        await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ');
        await sql('UPDATE employees SET consent_at = $1 WHERE id = $2', [consent_at, id]);
      }

      let photo_url = current.photo_url;
      if (photo) {
        const buffer = base64ToBuffer(photo);
        const blob = await put(`employees/${crypto.randomUUID()}.jpg`, buffer, {
          access: 'public',
          contentType: 'image/jpeg'
        });
        photo_url = blob.url;
      }

      const now = new Date().toISOString();
      await sql(
        `UPDATE employees SET rut = $1, first_name = $2, last_name = $3, department = $4, 
         position = $5, photo_url = $6, active = $7, updated_at = $8 WHERE id = $9`,
        [
          rut || current.rut,
          first_name || current.first_name,
          last_name || current.last_name,
          department !== undefined ? department : current.department,
          position !== undefined ? position : current.position,
          photo_url,
          active !== undefined ? active : current.active,
          now,
          id
        ]
      );

      const [employee] = await sql('SELECT * FROM employees WHERE id = $1', [id]);
      return res.status(200).json(employee);
    }

    if (req.method === 'DELETE') {
      const { permanent } = req.body || {};

      if (permanent) {
        // Eliminar todas las referencias primero
        await sql('DELETE FROM early_exits WHERE employee_id = $1', [id]);
        await sql('DELETE FROM employee_schedules WHERE employee_id = $1', [id]);
        await sql('DELETE FROM attendance_records WHERE employee_id = $1', [id]);
        // Eliminar empleado permanentemente
        await sql('DELETE FROM employees WHERE id = $1', [id]);
        return res.status(200).json({ message: 'Empleado eliminado permanentemente' });
      }

      // Soft delete (desactivar)
      const now = new Date().toISOString();
      await sql('UPDATE employees SET active = false, updated_at = $1 WHERE id = $2', [now, id]);
      return res.status(200).json({ message: 'Empleado desactivado' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

function base64ToBuffer(base64) {
  const data = base64.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(data, 'base64');
}
