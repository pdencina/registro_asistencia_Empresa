const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();

  try {
    const { employee_id, type, photo_snapshot, notes } = req.body;

    if (!employee_id || !type) {
      return res.status(400).json({ error: 'employee_id y type son obligatorios' });
    }

    if (!['entry', 'exit'].includes(type)) {
      return res.status(400).json({ error: 'type debe ser "entry" o "exit"' });
    }

    const [employee] = await sql('SELECT * FROM employees WHERE id = $1 AND active = true', [employee_id]);
    if (!employee) {
      return res.status(404).json({ error: 'Empleado no encontrado o inactivo' });
    }

    let snapshot_url = null;
    if (photo_snapshot) {
      const buffer = Buffer.from(photo_snapshot.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const blob = await put(`snapshots/${crypto.randomUUID()}.jpg`, buffer, {
        access: 'public',
        contentType: 'image/jpeg'
      });
      snapshot_url = blob.url;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await sql(
      `INSERT INTO attendance_records (id, employee_id, type, timestamp, photo_snapshot_url, method, notes)
       VALUES ($1, $2, $3, $4, $5, 'visual', $6)`,
      [id, employee_id, type, now, snapshot_url, notes || null]
    );

    const [record] = await sql(`
      SELECT ar.*, e.first_name, e.last_name, e.rut, e.department
      FROM attendance_records ar
      JOIN employees e ON ar.employee_id = e.id
      WHERE ar.id = $1
    `, [id]);

    return res.status(201).json(record);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
