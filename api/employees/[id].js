const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const { id } = req.query;
  const sql = getDb();

  try {
    if (req.method === 'GET') {
      const [employee] = await sql('SELECT * FROM employees WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      if (!employee) {
        return res.status(404).json({ error: 'Empleado no encontrado' });
      }
      return res.status(200).json(employee);
    }

    if (req.method === 'PUT') {
      const { rut, first_name, last_name, department, position, active, photo, consent_at, email, phone } = req.body;

      const [current] = await sql('SELECT * FROM employees WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      if (!current) {
        return res.status(404).json({ error: 'Empleado no encontrado' });
      }

      if (consent_at) {
        await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ');
        await sql('UPDATE employees SET consent_at = $1 WHERE id = $2 AND tenant_id = $3', [consent_at, id, tenant.id]);
      }

      let photo_url = current.photo_url;
      if (photo) {
        const buffer = base64ToBuffer(photo);
        const blob = await put(`employees/${tenant.slug}/${crypto.randomUUID()}.jpg`, buffer, {
          access: 'public',
          contentType: 'image/jpeg'
        });
        photo_url = blob.url;
      }

      const now = new Date().toISOString();
      await sql(
        `UPDATE employees SET rut = $1, first_name = $2, last_name = $3, department = $4, 
         position = $5, photo_url = $6, active = $7, updated_at = $8, email = $9, phone = $10
         WHERE id = $11 AND tenant_id = $12`,
        [
          rut || current.rut,
          first_name || current.first_name,
          last_name || current.last_name,
          department !== undefined ? department : current.department,
          position !== undefined ? position : current.position,
          photo_url,
          active !== undefined ? active : current.active,
          now,
          email !== undefined ? email : (current.email || null),
          phone !== undefined ? phone : (current.phone || null),
          id,
          tenant.id
        ]
      );

      const [employee] = await sql('SELECT * FROM employees WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      return res.status(200).json(employee);
    }

    if (req.method === 'DELETE') {
      const { permanent } = req.body || {};

      // Verificar que el empleado pertenece al tenant
      const [check] = await sql('SELECT id FROM employees WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      if (!check) {
        return res.status(404).json({ error: 'Empleado no encontrado' });
      }

      if (permanent) {
        await sql('DELETE FROM attendance_records WHERE employee_id = $1 AND tenant_id = $2', [id, tenant.id]);
        await sql('DELETE FROM employees WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
        return res.status(200).json({ message: 'Empleado eliminado permanentemente' });
      }

      const now = new Date().toISOString();
      await sql('UPDATE employees SET active = false, updated_at = $1 WHERE id = $2 AND tenant_id = $3', [now, id, tenant.id]);
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
