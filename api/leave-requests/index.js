const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  // Ensure table exists
  await sql(`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id),
      employee_id UUID NOT NULL REFERENCES employees(id),
      type VARCHAR(30) NOT NULL DEFAULT 'vacation',
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      days INTEGER,
      reason TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      approved_by VARCHAR(200),
      approved_at TIMESTAMPTZ,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  try {
    // GET: List leave requests
    if (req.method === 'GET') {
      const { employee_id, status: filterStatus } = req.query;

      let query = `
        SELECT lr.*, e.first_name, e.last_name, e.department, e.photo_url
        FROM leave_requests lr
        JOIN employees e ON lr.employee_id = e.id
        WHERE lr.tenant_id = $1
      `;
      const params = [tenant.id];
      let idx = 2;

      if (employee_id) {
        query += ` AND lr.employee_id = $${idx++}`;
        params.push(employee_id);
      }
      if (filterStatus) {
        query += ` AND lr.status = $${idx++}`;
        params.push(filterStatus);
      }

      query += ' ORDER BY lr.created_at DESC';
      const requests = await sql(query, params);

      // Also return vacation balance per employee
      const balances = await sql(`
        SELECT e.id, e.first_name, e.last_name, e.created_at as hire_date,
               COALESCE(SUM(CASE WHEN lr.type = 'vacation' AND lr.status = 'approved' THEN lr.days ELSE 0 END), 0) as days_used
        FROM employees e
        LEFT JOIN leave_requests lr ON lr.employee_id = e.id AND lr.tenant_id = e.tenant_id
        WHERE e.tenant_id = $1 AND e.active = true
        GROUP BY e.id, e.first_name, e.last_name, e.created_at
      `, [tenant.id]);

      // Calculate available days (15 legal days per year in Chile, prorated)
      const today = new Date();
      const balanceData = balances.map(emp => {
        const hireDate = new Date(emp.hire_date);
        const monthsWorked = Math.max(1, Math.floor((today - hireDate) / (1000 * 60 * 60 * 24 * 30)));
        const yearlyDays = 15; // Chile: 15 días hábiles por año
        const accruedDays = Math.min(yearlyDays, Math.floor((monthsWorked / 12) * yearlyDays));
        const available = Math.max(0, accruedDays - Number(emp.days_used));
        return {
          employee_id: emp.id,
          first_name: emp.first_name,
          last_name: emp.last_name,
          days_accrued: accruedDays,
          days_used: Number(emp.days_used),
          days_available: available,
        };
      });

      return res.status(200).json({ requests, balances: balanceData });
    }

    // POST: Create leave request
    if (req.method === 'POST') {
      const { employee_id, type, start_date, end_date, reason } = req.body;

      if (!employee_id || !start_date || !end_date) {
        return res.status(400).json({ error: 'employee_id, start_date y end_date son obligatorios' });
      }

      // Calculate working days
      const start = new Date(start_date + 'T12:00:00');
      const end = new Date(end_date + 'T12:00:00');
      let days = 0;
      const current = new Date(start);
      while (current <= end) {
        const dow = current.getDay();
        if (dow >= 1 && dow <= 5) days++;
        current.setDate(current.getDate() + 1);
      }

      const validTypes = ['vacation', 'personal', 'medical', 'family', 'other'];
      const leaveType = validTypes.includes(type) ? type : 'vacation';

      const [request] = await sql(`
        INSERT INTO leave_requests (tenant_id, employee_id, type, start_date, end_date, days, reason, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING *
      `, [tenant.id, employee_id, leaveType, start_date, end_date, days, reason || null]);

      return res.status(201).json(request);
    }

    // PUT: Approve or reject
    if (req.method === 'PUT') {
      const { id, action, approved_by, rejection_reason } = req.body;

      if (!id || !action) {
        return res.status(400).json({ error: 'id y action son obligatorios' });
      }

      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'action debe ser "approve" o "reject"' });
      }

      const status = action === 'approve' ? 'approved' : 'rejected';

      await sql(`
        UPDATE leave_requests SET
          status = $1,
          approved_by = $2,
          approved_at = NOW(),
          rejection_reason = $3
        WHERE id = $4 AND tenant_id = $5
      `, [status, approved_by || 'Administrador', action === 'reject' ? (rejection_reason || null) : null, id, tenant.id]);

      const [updated] = await sql('SELECT * FROM leave_requests WHERE id = $1', [id]);
      return res.status(200).json(updated);
    }

    // DELETE: Cancel request
    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id es obligatorio' });
      await sql('DELETE FROM leave_requests WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      return res.status(200).json({ message: 'Solicitud eliminada' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
