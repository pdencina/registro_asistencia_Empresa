const { getDb } = require('../lib/db');

/**
 * POST /api/billing/webhook
 * Webhook de MercadoPago para recibir notificaciones de pago.
 * 
 * MercadoPago envía notificaciones cuando:
 * - Se crea una suscripción (subscription_preapproval)
 * - Se realiza un cobro exitoso
 * - Falla un cobro
 * - Se cancela la suscripción
 * 
 * Configurar en MercadoPago Dashboard:
 * URL: https://flexio.cl/api/billing/webhook
 * Eventos: subscription_preapproval
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!MP_ACCESS_TOKEN) {
    return res.status(200).json({ message: 'MP no configurado' });
  }

  const sql = getDb();

  try {
    const { type, data, action } = req.body;

    // MercadoPago manda distintos tipos de notificación
    if (type === 'subscription_preapproval' || type === 'preapproval') {
      const subscriptionId = data?.id;
      if (!subscriptionId) {
        return res.status(200).json({ message: 'Sin ID' });
      }

      // Consultar estado actual de la suscripción en MercadoPago
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
        headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
      });

      if (!mpRes.ok) {
        console.error('Error consultando suscripción:', await mpRes.text());
        return res.status(200).json({ message: 'Error consultando MP' });
      }

      const subscription = await mpRes.json();
      const externalRef = subscription.external_reference || '';
      const [tenantId, plan] = externalRef.split('|');

      if (!tenantId) {
        return res.status(200).json({ message: 'Sin tenant en external_reference' });
      }

      // Mapear estado de MercadoPago a nuestro sistema
      let ourStatus = 'pending';
      switch (subscription.status) {
        case 'authorized':
          ourStatus = 'active';
          break;
        case 'paused':
          ourStatus = 'paused';
          break;
        case 'cancelled':
          ourStatus = 'cancelled';
          break;
        case 'pending':
          ourStatus = 'pending';
          break;
        default:
          ourStatus = subscription.status;
      }

      // Actualizar nuestra BD
      await sql(`
        UPDATE subscriptions 
        SET status = $1, mp_subscription_id = $2, plan = $3, updated_at = NOW()
        WHERE tenant_id = $4
      `, [ourStatus, subscriptionId, plan || 'basico', tenantId]);

      // Si está activo, activar tenant y actualizar período
      if (ourStatus === 'active') {
        await sql('UPDATE tenants SET active = true, updated_at = NOW() WHERE id = $1', [tenantId]);

        // Actualizar período de facturación
        const nextBilling = subscription.next_payment_date;
        if (nextBilling) {
          await sql(`
            UPDATE subscriptions 
            SET current_period_start = NOW(), current_period_end = $1 
            WHERE tenant_id = $2
          `, [nextBilling, tenantId]);
        }
      }

      // Si se canceló o pausó, pausar tenant
      if (ourStatus === 'cancelled' || ourStatus === 'paused') {
        await sql('UPDATE tenants SET active = false, updated_at = NOW() WHERE id = $1', [tenantId]);
      }

      console.log(`[Webhook] Tenant ${tenantId} → ${ourStatus}`);
    }

    // Responder 200 siempre (MercadoPago reintenta si no recibe 200)
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    // Siempre responder 200 para que MP no reintente infinitamente
    return res.status(200).json({ error: error.message });
  }
};
