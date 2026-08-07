const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { BILLING_CONFIG, calculateTotal, getNextBillingDate, getGraceDate } = require('../lib/payments');

/**
 * POST /api/subscriptions/charge
 * 
 * CRON: Se ejecuta diariamente. Procesa cobros automáticos:
 * 1. Busca suscripciones con next_billing_date = hoy y auto_charge = true
 * 2. Intenta cobrar la tarjeta registrada
 * 3. Si falla, reintenta hasta 3 veces cada 2 días
 * 4. Si pasan 5 días sin pago → suspende
 * 
 * También procesa:
 * - Genera registros de pago "pending" para cobros manuales (transferencia)
 * - Actualiza estados (grace_period → past_due → suspended)
 * 
 * Header: x-cron-secret (para proteger el endpoint)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Verificar que sea llamado por cron
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['x-cron-secret'] !== cronSecret) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const sql = getDb();
  const today = new Date().toISOString().split('T')[0];
  const results = { charged: 0, failed: 0, suspended: 0, pending_created: 0 };

  try {
    // 1. Suscripciones que vencen hoy (crear pago pendiente)
    const dueSubs = await sql(
      "SELECT * FROM subscriptions WHERE next_billing_date <= $1 AND status = 'active'",
      [today]
    );

    for (const sub of dueSubs) {
      const { neto, iva, total } = calculateTotal(sub.price_monthly);

      // Verificar si ya existe un pago para este período
      const [existingPayment] = await sql(
        'SELECT id FROM payments WHERE subscription_id = $1 AND period_start = $2',
        [sub.id, sub.next_billing_date]
      );

      if (existingPayment) continue; // Ya procesado

      const nextEnd = getNextBillingDate(new Date(sub.next_billing_date));

      // Crear registro de pago
      const paymentId = require('crypto').randomUUID();
      await sql(`
        INSERT INTO payments (id, subscription_id, amount, iva, total, status, method, period_start, period_end)
        VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
      `, [
        paymentId, sub.id, neto, iva, total,
        sub.auto_charge ? 'card_auto' : 'transfer',
        sub.next_billing_date, nextEnd,
      ]);

      results.pending_created++;

      // Si tiene cobro automático, intentar cobrar
      if (sub.auto_charge && sub.card_token) {
        const chargeResult = await attemptCharge(sub, total, paymentId);

        if (chargeResult.success) {
          // Pago exitoso: actualizar todo
          await sql("UPDATE payments SET status = 'paid', paid_at = NOW(), payment_reference = $1 WHERE id = $2",
            [chargeResult.reference, paymentId]);

          await sql(`
            UPDATE subscriptions SET
              current_period_start = $1, current_period_end = $2,
              next_billing_date = $2, grace_until = $3, status = 'active', updated_at = NOW()
            WHERE id = $4
          `, [sub.next_billing_date, nextEnd, getGraceDate(nextEnd), sub.id]);

          results.charged++;
        } else {
          // Fallo: incrementar intentos
          await sql(`
            UPDATE payments SET attempts = attempts + 1, last_attempt_at = NOW(), failure_reason = $1 WHERE id = $2
          `, [chargeResult.error, paymentId]);

          results.failed++;
        }
      }
    }

    // 2. Suspender suscripciones que pasaron el período de gracia
    const pastGrace = await sql(
      "SELECT * FROM subscriptions WHERE grace_until < $1 AND status IN ('active', 'grace_period')",
      [today]
    );

    for (const sub of pastGrace) {
      // Verificar si tiene pago pendiente sin pagar
      const [unpaid] = await sql(
        "SELECT id FROM payments WHERE subscription_id = $1 AND status = 'pending' AND period_start = $2",
        [sub.id, sub.next_billing_date]
      );

      if (unpaid) {
        await sql("UPDATE subscriptions SET status = 'suspended', updated_at = NOW() WHERE id = $1", [sub.id]);
        results.suspended++;
        // TODO: Enviar email de suspensión
      }
    }

    // 3. Reintentar cobros fallidos (cada 2 días, máximo 3 intentos)
    const retryPayments = await sql(`
      SELECT p.*, s.card_token, s.id as sub_id FROM payments p
      JOIN subscriptions s ON p.subscription_id = s.id
      WHERE p.status = 'pending' AND p.method = 'card_auto'
        AND p.attempts > 0 AND p.attempts < $1
        AND p.last_attempt_at < NOW() - INTERVAL '2 days'
        AND s.auto_charge = true AND s.card_token IS NOT NULL
    `, [BILLING_CONFIG.max_retry_attempts]);

    for (const payment of retryPayments) {
      const chargeResult = await attemptCharge(
        { card_token: payment.card_token, id: payment.sub_id },
        payment.total,
        payment.id
      );

      if (chargeResult.success) {
        await sql("UPDATE payments SET status = 'paid', paid_at = NOW(), payment_reference = $1 WHERE id = $2",
          [chargeResult.reference, payment.id]);
        await sql("UPDATE subscriptions SET status = 'active', updated_at = NOW() WHERE id = $1", [payment.sub_id]);
        results.charged++;
      } else {
        await sql("UPDATE payments SET attempts = attempts + 1, last_attempt_at = NOW(), failure_reason = $1 WHERE id = $2",
          [chargeResult.error, payment.id]);
        results.failed++;
      }
    }

    return res.status(200).json({
      ok: true,
      processed_at: new Date().toISOString(),
      results,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Intenta cobrar una tarjeta.
 * Adaptable al procesador que uses (MercadoPago, Flow, Transbank Oneclick).
 */
async function attemptCharge(subscription, amount, paymentId) {
  // --- PLACEHOLDER: Reemplazar con tu procesador de pagos ---
  // Ejemplo con MercadoPago:
  //
  // const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  // const response = await fetch('https://api.mercadopago.com/v1/payments', {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({
  //     transaction_amount: amount,
  //     token: subscription.card_token,
  //     description: `Kiva360 - Suscripción mensual`,
  //     payment_method_id: 'visa',
  //     payer: { id: subscription.id },
  //   }),
  // });
  // const data = await response.json();
  // if (data.status === 'approved') return { success: true, reference: data.id };
  // return { success: false, error: data.message || 'Cobro rechazado' };

  // Por ahora retorna fallo (implementar con procesador real)
  return { success: false, error: 'Procesador de pagos no configurado' };
}
