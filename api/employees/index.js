const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const sql = getDb();

  try {
    if (req.method === 'GET') {
      const { search, active } = req.query;

      let query = 'SELECT * FROM employees WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (search) {
        query += ` AND (first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex + 1} OR rut ILIKE $${paramIndex + 2})`;
        const term = `%${search}%`;
        params.push(term, term, term);
        paramIndex += 3;
      }
      if (active !== null && active !== undefined && active !== '') {
        query += ` AND active = $${paramIndex}`;
        params.push(active === '1' || active === 'true');
        paramIndex++;
      }

      query += ' ORDER BY last_name, first_name';
      const rows = await sql(query, params);

      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { rut, first_name, last_name, department, position, photo, email, phone } = req.body;

      if (!rut || !first_name || !last_name) {
        return res.status(400).json({ error: 'RUT, nombre y apellido son obligatorios' });
      }

      const existing = await sql('SELECT id FROM employees WHERE rut = $1', [rut]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Ya existe un empleado con ese RUT' });
      }

      let photo_url = null;
      if (photo) {
        const buffer = base64ToBuffer(photo);
        const blob = await put(`employees/${crypto.randomUUID()}.jpg`, buffer, {
          access: 'public',
          contentType: 'image/jpeg'
        });
        photo_url = blob.url;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      // Ensure email/phone columns exist
      await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(200)');
      await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone VARCHAR(50)');

      await sql(
        `INSERT INTO employees (id, rut, first_name, last_name, department, position, email, phone, photo_url, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11)`,
        [id, rut, first_name, last_name, department || null, position || null, email || null, phone || null, photo_url, now, now]
      );

      const [employee] = await sql('SELECT * FROM employees WHERE id = $1', [id]);
      return res.status(201).json(employee);
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
