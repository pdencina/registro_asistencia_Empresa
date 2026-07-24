const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

const TZ = 'America/Santiago';

/**
 * /api/justifications
 * GET: List justifications (optionally by employee_id or date range)
 * POST: Create a justification for an absence/tardiness
 * DELETE: Remove a justification
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  // Ensure table exists
  await sql(`
    CREATE TABLE IF NOT EXISTS justifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      employee_id UUID NOT NULL,
      date DATE NOT NULL,
      type VARCHAR(50) NOT NULL,
      reason TEXT,
      covers VARCHAR(20) DEFAULT 'full_day',
      created_by VARCHAR(200),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // GET: List justifications
  if (req.method === 'GET') {
    const { employee_id, start_date, end_date } = req.query;

    let query = 'SELECT j.*, e.first_name, e.last_name, e.rut FROM justifications j JOIN employees e ON j.employee_id = e.id WHERE j.tenant_id = $1';
    const params = [tenant.id];
    let idx = 2;

    if (employee_id) {
      query += ` AND j.employee_id = $${idx++}`;
      params.push(employee_id);
    }
    if (start_date) {
      query += ` AND j.date >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      query += ` AND j.date <= $${idx++}`;
      params.push(end_date);
    }

    query += ' ORDER BY j.date DESC, j.created_at DESC LIMIT 200';

    const justifications = await sql(query, params);

    return res.status(200).json({
      justifications,
      types: getJustificationTypes(),
    });
  }

  // POST: Create justification
  if (req.method === 'POST') {
    const { employee_id, date, type, reason, covers = 'full_day', created_by } = req.body;

    if (!employee_id || !date || !type) {
      return res.status(400).json({ error: 'employee_id, date y type son requeridos' });
    }

    // Validate type
    const validTypes = getJustificationTypes().map(t => t.value);
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Tipo inválido. Opciones: ${validTypes.join(', ')}` });
    }

    // Check employee belongs to tenant
    const [employee] = await sql(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 AND active = true',
      [employee_id, tenant.id]
    );
    if (!employee) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }

    // Check if already justified for that date
    const existing = await sql(
      'SELECT id FROM justifications WHERE employee_id = $1 AND date = $2 AND tenant_id = $3',
      [employee_id, date, tenant.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Ya existe un justificativo para este colaborador en esa fecha' });
    }

    const [justification] = await sql(`
      INSERT INTO justifications (tenant_id, employee_id, date, type, reason, covers, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [tenant.id, employee_id, date, type, reason || null, covers, created_by || null]);

    return res.status(201).json(justification);
  }

  // DELETE: Remove justification
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });
    await sql('DELETE FROM justifications WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

function getJustificationTypes() {
  return [
    { value: 'medical_leave', label: 'Licencia médica', icon: '🏥' },
    { value: 'authorized_leave', label: 'Permiso autorizado', icon: '✅' },
    { value: 'personal_errand', label: 'Trámite personal', icon: '📋' },
    { value: 'training', label: 'Capacitación', icon: '📚' },
    { value: 'bereavement', label: 'Duelo', icon: '🕯️' },
    { value: 'legal', label: 'Citación judicial/legal', icon: '⚖️' },
    { value: 'union', label: 'Actividad sindical', icon: '🤝' },
    { value: 'weather', label: 'Evento climático/fuerza mayor', icon: '🌧️' },
    { value: 'late_justified', label: 'Atraso justificado', icon: '⏰' },
    { value: 'other', label: 'Otro motivo', icon: '📝' },
  ];
}
