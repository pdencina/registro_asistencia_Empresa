const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

/**
 * GET /api/audit
 * Returns audit log entries for the tenant.
 * Query: limit (default 50), offset, action, target_type
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();
  const { limit = '50', offset = '0', action, target_type } = req.query;

  try {
    let query = 'SELECT * FROM audit_log WHERE tenant_id = $1';
    const params = [tenant.id];
    let idx = 2;

    if (action) {
      query += ` AND action = $${idx++}`;
      params.push(action);
    }
    if (target_type) {
      query += ` AND target_type = $${idx++}`;
      params.push(target_type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const logs = await sql(query, params);

    return res.status(200).json({ logs });
  } catch (err) {
    // Table might not exist yet
    if (err.message?.includes('does not exist')) {
      return res.status(200).json({ logs: [] });
    }
    return res.status(500).json({ error: err.message });
  }
};
