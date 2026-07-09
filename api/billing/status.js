const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * GET /api/billing/status?tenant_id=xxx
 * Retorna el estado de suscripción de un tenant.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();
  const { tenant_id } = req.query;

  if (!tenant_id) {
    return res.status(400).json({ error: 'tenant_id es obligatorio' });
  }

  try {
    const rows = await sql(`
      SELECT s.*, t.name as tenant_name, t.plan as tenant_plan, t.trial_ends_at
      FROM subscriptions s
      JOIN tenants t ON t.id = s.tenant_id
      WHERE s.tenant_id = $1
    `, [tenant_id]);

    if (rows.length === 0) {
      // Verificar si el tenant existe pero no tiene suscripción
      const tenantRows = await sql('SELECT * FROM tenants WHERE id = $1', [tenant_id]);
      if (tenantRows.length === 0) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
      }
      return res.status(200).json({
        plan: tenantRows[0].plan,
        status: 'trial',
        trial_ends_at: tenantRows[0].trial_ends_at,
      });
    }

    const subscription = rows[0];

    return res.status(200).json({
      plan: subscription.plan,
      status: subscription.status,
      mp_subscription_id: subscription.mp_subscription_id,
      current_period_start: subscription.current_period_start,
      current_period_end: subscription.current_period_end,
      trial_ends_at: subscription.trial_ends_at,
      last_payment_date: subscription.last_payment_date,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
