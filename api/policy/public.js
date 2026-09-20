const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { getActivePolicy, effectiveMethods } = require('../lib/policy');

/**
 * GET /api/policy/public
 * Lo mínimo que necesita el tótem o el móvil para saber cómo presentar la marcación
 * (métodos por canal y modo legado). No expone umbrales ni parámetros internos.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  try {
    const policy = await getActivePolicy(getDb(), tenant.id);
    return res.status(200).json({
      version: policy.version,
      status: policy.status,
      legacy_marking: policy.legacy_marking,
      event_selection: policy.event_selection,
      channels: {
        TOTEM: effectiveMethods(policy, 'TOTEM'),
        MOBILE: effectiveMethods(policy, 'MOBILE'),
      },
      offline_allowed: !!(policy.offline_policy && policy.offline_policy.allowed),
    });
  } catch (error) {
    console.error('[policy/public]', error.message);
    return res.status(500).json({ error: 'Error interno' });
  }
};
