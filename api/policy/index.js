const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireAuth } = require('../lib/auth');
const { logAudit, auditContext } = require('../lib/auditLog');
const { getActivePolicy, savePolicy, validatePolicy, PRESETS, PolicyError } = require('../lib/policy');

/**
 * /api/policy — política de marcación de la empresa (versionada e inmutable).
 *
 *   GET            política vigente + advertencias regulatorias + presets disponibles
 *   GET ?history=1 historial de versiones (admin / rrhh)
 *   PUT            crea una versión nueva (solo admin)
 *                  body: { preset?, changes?, acknowledge?: string[], reason? }
 *
 * Las reglas que impone el texto de la Res. Ex. N.º 38 se validan aquí y además están como CHECK en la base.
 * Una advertencia que requiere confirmación (p. ej. Art. 7 g) solo se guarda si viene en `acknowledge`;
 * la confirmación queda registrada en la versión y en la auditoría.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireAuth(req, res, req.method === 'GET' && !req.query.history ? undefined : { roles: req.method === 'GET' ? ['admin', 'rrhh'] : ['admin'] });
  if (!tenant) return;

  const sql = getDb();
  try {
    if (req.method === 'GET') {
      if (req.query.history) {
        const rows = await sql(
          `SELECT version, status, legacy_marking, primary_methods, fallback_methods, change_reason, created_by, created_at, acknowledged_warnings
             FROM tenant_attendance_policy WHERE tenant_id = $1 ORDER BY version DESC LIMIT 100`,
          [tenant.id]
        );
        return res.status(200).json({ versions: rows });
      }
      const policy = await getActivePolicy(sql, tenant.id, { useCache: false });
      const { warnings } = validatePolicy(policy);
      return res.status(200).json({ policy, warnings, presets: Object.keys(PRESETS) });
    }

    if (req.method === 'PUT') {
      const { preset, changes, acknowledge, reason } = req.body || {};
      let saved;
      try {
        saved = await savePolicy(sql, tenant.id, {
          preset,
          changes: changes && typeof changes === 'object' ? changes : {},
          acknowledge: Array.isArray(acknowledge) ? acknowledge : [],
          reason,
          actor: req.session.email,
        });
      } catch (e) {
        if (e instanceof PolicyError) return res.status(e.status).json({ code: e.code, error: e.message, ...e.details });
        throw e;
      }

      await logAudit({
        ...auditContext(req),
        tenant_id: tenant.id,
        action: 'policy.update',
        target_type: 'attendance_policy',
        details: {
          from_version: saved.previous.version,
          to_version: saved.policy.version,
          reason: reason || null,
          acknowledged: saved.policy.acknowledged_warnings,
          before: saved.previous,
          after: saved.policy,
        },
      });

      return res.status(200).json({ policy: saved.policy, warnings: saved.warnings });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[policy]', error.message);
    return res.status(500).json({ error: 'Error interno' });
  }
};
