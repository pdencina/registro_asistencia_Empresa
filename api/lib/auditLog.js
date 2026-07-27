const { getDb } = require('./db');

/**
 * Logs an action to the audit trail.
 * Used for compliance (DT) — records who changed what, when.
 * 
 * @param {object} params
 * @param {string} params.tenant_id
 * @param {string} params.action - e.g. 'attendance.edit', 'employee.create', 'warning.create'
 * @param {string} params.actor - who performed the action (email or 'system')
 * @param {string} params.target_type - e.g. 'attendance_record', 'employee', 'schedule'
 * @param {string} params.target_id - UUID of the affected entity
 * @param {object} params.details - JSON with before/after or additional context
 * @param {string} params.ip - request IP
 */
async function logAudit({ tenant_id, action, actor, target_type, target_id, details, ip }) {
  const sql = getDb();

  try {
    // Ensure table exists
    await sql(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        action VARCHAR(100) NOT NULL,
        actor VARCHAR(200),
        target_type VARCHAR(50),
        target_id UUID,
        details JSONB,
        ip VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await sql(`
      INSERT INTO audit_log (tenant_id, action, actor, target_type, target_id, details, ip)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      tenant_id,
      action,
      actor || 'admin',
      target_type || null,
      target_id || null,
      details ? JSON.stringify(details) : null,
      ip || null,
    ]);
  } catch (err) {
    // Non-blocking — audit failures should never break the main operation
    console.error('[Audit] Failed to log:', err.message);
  }
}

module.exports = { logAudit };
