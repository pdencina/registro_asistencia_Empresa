const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Identificar tenant — OBLIGATORIO
  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    if (req.method === 'GET') {
      const { search, active } = req.query;

      let query = 'SELECT * FROM employees WHERE tenant_id = $1';
      const params = [tenant.id];
      let paramIndex = 2;

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

      // Verificar límite del plan
      const [countRow] = await sql('SELECT COUNT(*) as count FROM employees WHERE tenant_id = $1 AND active = true', [tenant.id]);
      if (Number(countRow.count) >= tenant.max_employees) {
        return res.status(403).json({ error: `Límite de ${tenant.max_employees} colaboradores alcanzado. Actualiza tu plan.` });
      }

      // RUT único dentro del tenant
      const existing = await sql('SELECT id FROM employees WHERE rut = $1 AND tenant_id = $2', [rut, tenant.id]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Ya existe un empleado con ese RUT en tu empresa' });
      }

      let photo_url = null;
      if (photo) {
        const buffer = base64ToBuffer(photo);
        const blob = await put(`employees/${tenant.slug}/${crypto.randomUUID()}.jpg`, buffer, {
          access: 'public',
          contentType: 'image/jpeg'
        });
        photo_url = blob.url;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await sql(`
        INSERT INTO employees (id, tenant_id, rut, first_name, last_name, department, position, email, phone, photo_url, active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11, $12)`,
        [id, tenant.id, rut, first_name, last_name, department || null, position || null, email || null, phone || null, photo_url, now, now]
      );

      const [employee] = await sql('SELECT * FROM employees WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
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
