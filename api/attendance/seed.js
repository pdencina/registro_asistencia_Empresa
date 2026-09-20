const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireSuperAdmin } = require('../lib/auth');
const { getTenant } = require('../lib/tenant');

/**
 * POST /api/attendance/seed
 * Endpoint para insertar registros de asistencia con timestamp específico.
 * Solo accesible con GLOBAL_ADMIN_SECRET para poblar datos de demo.
 * 
 * Body: { tenant_slug, employee_id, type, timestamp }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireSuperAdmin(req, res)) return;

  const sql = getDb();

  try {
    const { tenant_slug, employee_id, type, timestamp } = req.body;

    if (!tenant_slug || !employee_id || !type || !timestamp) {
      return res.status(400).json({ error: 'tenant_slug, employee_id, type y timestamp son requeridos' });
    }

    const [tenant] = await sql('SELECT id FROM tenants WHERE slug = $1', [tenant_slug]);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });

    const id = require('crypto').randomUUID();
    await sql(
      `INSERT INTO attendance_records (id, tenant_id, employee_id, type, timestamp, method, notes)
       VALUES ($1, $2, $3, $4, $5, 'visual', 'demo-seed')`,
      [id, tenant.id, employee_id, type, timestamp]
    );

    return res.status(201).json({ ok: true, id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
