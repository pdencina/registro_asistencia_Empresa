const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { getNextBillingDate, getGraceDate } = require('../lib/payments');

/**
 * POST /api/subscriptions/confirm-payment
 * 
 * Confirma un pago manual (transferencia bancaria).
 * Puede ser llamado por:
 * - El admin al verificar la transferencia
 * - Un webhook del banco (si tienen notificaciones)
 * 
 * Body: { payment_id, payment_reference, method }
 * Header: Authorization (admin)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verificar admin
  const secret = process.env.ADMIN_SECRET;
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (secret && auth !== secret) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const sql = getDb();

  try {
    const { payment_id, payment_reference, method } = req.body;

    if (!payment_id) {
      return res.status(400).json({ error: 'payment_id es obligatorio' });
    }

    // Buscar pago
    const [payment] = await sql('SELECT * FROM payments WHERE id = $1', [payment_id]);
    if (!payment) return res.status(404).json({ error: 'Pago no encontrado' });
    if (payment.status === 'paid') return res.status(409).json({ error: 'Este pago ya fue confirmado' });

    // Marcar como pagado
    await sql(`
      UPDATE payments SET
        status = 'paid', paid_at = NOW(), payment_reference = $1, method = $2, updated_at = NOW()
      WHERE id = $3
    `, [payment_reference || null, method || 'transfer', payment_id]);

    // Actualizar suscripción: renovar período
    const [sub] = await sql('SELECT * FROM subscriptions WHERE id = $1', [payment.subscription_id]);
    if (sub) {
      const nextBilling = getNextBillingDate(new Date(payment.period_end));
      const graceUntil = getGraceDate(nextBilling);

      await sql(`
        UPDATE subscriptions SET
          current_period_start = $1, current_period_end = $2,
          next_billing_date = $3, grace_until = $4,
          status = 'active', updated_at = NOW()
        WHERE id = $5
      `, [payment.period_start, payment.period_end, nextBilling, graceUntil, sub.id]);
    }

    return res.status(200).json({
      ok: true,
      message: 'Pago confirmado. Suscripción renovada.',
      payment_id,
      next_billing: sub ? getNextBillingDate(new Date(payment.period_end)) : null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
