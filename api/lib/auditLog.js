const { getDb } = require('./db');

/**
 * Registro de auditoría (quién cambió qué y cuándo).
 *
 * Por defecto NO interrumpe la operación si falla (compatibilidad con los usos existentes).
 * Con { strict: true } lanza el error: úsalo en operaciones que modifican evidencia, para que
 * nada cambie si no se puede dejar constancia.
 *
 * @param {object} params
 * @param {string} params.tenant_id
 * @param {string} params.action      p. ej. 'attendance.edit', 'employee.create'
 * @param {string} params.actor       correo del usuario (o 'system')
 * @param {string} [params.actor_role]
 * @param {string} params.target_type p. ej. 'attendance_record'
 * @param {string} params.target_id   UUID de la entidad afectada
 * @param {object} params.details     JSON con antes/después o contexto
 * @param {string} params.ip
 * @param {string} [params.user_agent]
 * @param {string} [params.request_id]
 * @param {boolean} [strict=false]
 */
async function logAudit(params, { strict = false } = {}) {
  const { tenant_id, action, actor, actor_role, target_type, target_id, details, ip, user_agent, request_id } = params;
  const sql = getDb();
  const detailsJson = details ? JSON.stringify(details) : null;

  const insertFull = () => sql(`
    INSERT INTO audit_log (tenant_id, action, actor, actor_role, target_type, target_id, details, ip, user_agent, request_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [tenant_id, action, actor || 'admin', actor_role || null, target_type || null, target_id || null, detailsJson, ip || null, user_agent || null, request_id || null]);

  const insertLegacy = () => sql(`
    INSERT INTO audit_log (tenant_id, action, actor, target_type, target_id, details, ip)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [tenant_id, action, actor || 'admin', target_type || null, target_id || null, detailsJson, ip || null]);

  const createTable = () => sql(`
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

  try {
    try {
      await insertFull();
    } catch (e) {
      // 42P01 tabla inexistente, 42703 columna inexistente (migración 001 aún sin aplicar)
      if (e && e.code === '42P01') { await createTable(); await insertLegacy(); }
      else if (e && e.code === '42703') { await insertLegacy(); }
      else throw e;
    }
    return true;
  } catch (err) {
    console.error('[Audit] Failed to log:', err.message);
    if (strict) throw err;
    return false;
  }
}

/** Datos del actor y del contexto a partir de la request autenticada (req.session lo fija requireAuth). */
function auditContext(req) {
  const fwd = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  const ip = typeof fwd === 'string' && fwd ? fwd.split(',')[0].trim() : null;
  return {
    actor: req.session?.email || 'desconocido',
    actor_role: req.session?.role || null,
    ip,
    user_agent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 300) : null,
    request_id: req.headers['x-vercel-id'] ? String(req.headers['x-vercel-id']).slice(0, 64) : null,
  };
}

module.exports = { logAudit, auditContext };
