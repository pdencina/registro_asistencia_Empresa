const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  // Ensure table exists
  await sql(`
    CREATE TABLE IF NOT EXISTS medical_leaves (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      employee_id UUID NOT NULL REFERENCES employees(id),
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INTEGER,
      diagnosis VARCHAR(300),
      doctor_name VARCHAR(200),
      institution VARCHAR(200),
      file_url TEXT,
      file_name VARCHAR(200),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  try {
    // GET: List medical leaves
    if (req.method === 'GET') {
      const { employee_id } = req.query;

      let query = `
        SELECT ml.*, e.first_name, e.last_name, e.rut, e.department
        FROM medical_leaves ml
        JOIN employees e ON ml.employee_id = e.id
        WHERE ml.tenant_id = $1
      `;
      const params = [tenant.id];
      let paramIdx = 2;

      if (employee_id) {
        query += ` AND ml.employee_id = $${paramIdx}`;
        params.push(employee_id);
        paramIdx++;
      }

      query += ' ORDER BY ml.start_date DESC';

      const leaves = await sql(query, params);
      return res.status(200).json(leaves);
    }

    // POST: Create medical leave with file
    if (req.method === 'POST') {
      const { employee_id, start_date, end_date, diagnosis, doctor_name, institution, notes, file_data, file_name } = req.body;

      if (!employee_id || !start_date || !end_date) {
        return res.status(400).json({ error: 'employee_id, start_date y end_date son obligatorios' });
      }

      // Calculate days
      const start = new Date(start_date);
      const end = new Date(end_date);
      const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

      // Upload file to Vercel Blob if provided
      let file_url = null;
      let savedFileName = file_name || null;

      if (file_data) {
        const matches = file_data.match(/^data:([^;]+);base64,/);
        const mimeType = matches ? matches[1] : 'application/pdf';
        const ext = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : 'jpg';
        const buffer = Buffer.from(file_data.replace(/^data:[^;]+;base64,/, ''), 'base64');

        const blob = await put(`medical-leaves/${tenant.slug}/${crypto.randomUUID()}.${ext}`, buffer, {
          access: 'public',
          contentType: mimeType,
        });
        file_url = blob.url;
      }

      const id = crypto.randomUUID();
      await sql(`
        INSERT INTO medical_leaves (id, tenant_id, employee_id, start_date, end_date, days, diagnosis, doctor_name, institution, file_url, file_name, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [id, tenant.id, employee_id, start_date, end_date, days, diagnosis || null, doctor_name || null, institution || null, file_url, savedFileName, notes || null]);

      const [leave] = await sql(`
        SELECT ml.*, e.first_name, e.last_name
        FROM medical_leaves ml JOIN employees e ON ml.employee_id = e.id
        WHERE ml.id = $1
      `, [id]);

      return res.status(201).json(leave);
    }

    // DELETE: Remove medical leave
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id es requerido' });

      await sql('DELETE FROM medical_leaves WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      return res.status(200).json({ message: 'Licencia eliminada' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
