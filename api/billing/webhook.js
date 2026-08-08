const { getDb } = require('../lib/db');
const crypto = require('crypto');

/**
 * POST /api/billing/webhook
 * Webhook de MercadoPago para suscripciones.
 * 
 * Maneja:
 * - subscription_preapproval → Suscripción autorizada/pausada/cancelada
 * - subscription_authorized_payment → Cobro mensual procesado
 * 
 * Configurar en MercadoPago Dashboard:
 * URL: https://flexio.cl/api/billing/webhook
 * Eventos: "Planes y suscripciones"
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true });
  }

  const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!MP_ACCESS_TOKEN) {
    return res.status(200).json({ message: 'MP no configurado' });
  }

  // Verificar firma del webhook (si hay secret configurado)
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (webhookSecret) {
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    if (xSignature && xRequestId) {
      const bodyStr = JSON.stringify(req.body);
      const dataId = req.body?.data?.id || '';
      const parts = xSignature.split(',');
      const ts = parts.find(p => p.trim().startsWith('ts='))?.split('=')[1];
      const hash = parts.find(p => p.trim().startsWith('v1='))?.split('=')[1];
      if (ts && hash) {
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
        const computed = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');
        if (computed !== hash) {
          console.error('[Webhook] Firma inválida');
          return res.status(401).json({ error: 'Firma inválida' });
        }
      }
    }
  }

  const sql = getDb();

  try {
    const { type, data, action } = req.body;

    // === SUSCRIPCIÓN: autorizada, pausada, cancelada ===
    if (type === 'subscription_preapproval' || type === 'preapproval') {
      const subscriptionId = data?.id;
      if (!subscriptionId) return res.status(200).json({ message: 'Sin ID' });

      // Consultar estado en MercadoPago
      const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${subscriptionId}`, {
        headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
      });

      if (!mpRes.ok) {
        console.error('[Webhook] Error consultando MP:', await mpRes.text());
        return res.status(200).json({ message: 'Error consultando MP' });
      }

      const subscription = await mpRes.json();
      const externalRef = subscription.external_reference || '';
      const [tenantId, plan, numEmployees] = externalRef.split('|');

      if (!tenantId) return res.status(200).json({ message: 'Sin tenant' });

      // Mapear estado
      let ourStatus = 'pending';
      switch (subscription.status) {
        case 'authorized': ourStatus = 'active'; break;
        case 'paused': ourStatus = 'paused'; break;
        case 'cancelled': ourStatus = 'cancelled'; break;
        case 'pending': ourStatus = 'pending'; break;
        default: ourStatus = subscription.status;
      }

      // Actualizar BD
      await sql(`
        UPDATE subscriptions SET
          status = $1, mp_subscription_id = $2, plan = $3,
          tarjeta_inscrita = $4, updated_at = NOW()
        WHERE tenant_id = $5
      `, [ourStatus, subscriptionId, plan || 'flexio', ourStatus === 'active', tenantId]);

      // Activar/desactivar tenant según estado
      if (ourStatus === 'active') {
        await sql('UPDATE tenants SET active = true, updated_at = NOW() WHERE id = $1', [tenantId]);
        // Actualizar período
        if (subscription.next_payment_date) {
          await sql(`
            UPDATE subscriptions SET
              current_period_start = NOW(),
              current_period_end = $1
            WHERE tenant_id = $2
          `, [subscription.next_payment_date, tenantId]);
        }
      } else if (ourStatus === 'cancelled' || ourStatus === 'paused') {
        // No desactivar inmediatamente — dar gracia
        console.log(`[Webhook] Tenant ${tenantId} → ${ourStatus}`);
      }

      console.log(`[Webhook] Suscripción ${subscriptionId} → ${ourStatus} (tenant: ${tenantId})`);
    }

    // === PAGO AUTORIZADO (cobro mensual procesado) ===
    if (type === 'subscription_authorized_payment') {
      const paymentId = data?.id;
      if (!paymentId) return res.status(200).json({ message: 'Sin payment ID' });

      // Consultar el pago en MP
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
      });

      if (!mpRes.ok) {
        console.error('[Webhook] Error consultando pago:', await mpRes.text());
        return res.status(200).json({ message: 'Error' });
      }

      const payment = await mpRes.json();

      // Buscar suscripción por preapproval_id
      const preapprovalId = payment.metadata?.preapproval_id || payment.point_of_interaction?.subscription_id;

      let tenantId = null;
      if (preapprovalId) {
        const [sub] = await sql(
          'SELECT tenant_id FROM subscriptions WHERE mp_subscription_id = $1',
          [preapprovalId]
        );
        if (sub) tenantId = sub.tenant_id;
      }

      // Fallback: buscar por external_reference
      if (!tenantId && payment.external_reference) {
        tenantId = payment.external_reference.split('|')[0];
      }

      if (!tenantId) {
        console.error('[Webhook] No se pudo resolver tenant para pago', paymentId);
        return res.status(200).json({ message: 'Tenant no encontrado' });
      }

      // Asegurar tabla pagos_suscripcion
      await sql(`
        CREATE TABLE IF NOT EXISTS pagos_suscripcion (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL,
          monto INTEGER NOT NULL,
          periodo TEXT,
          estado TEXT NOT NULL DEFAULT 'pendiente',
          metodo TEXT,
          referencia TEXT,
          mp_payment_id TEXT,
          pagado_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Registrar pago
      const pagoEstado = payment.status === 'approved' ? 'pagado' : 
                         payment.status === 'rejected' ? 'fallido' : 'pendiente';

      const periodo = new Date(payment.date_created).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

      await sql(`
        INSERT INTO pagos_suscripcion (tenant_id, monto, periodo, estado, metodo, referencia, mp_payment_id, pagado_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT DO NOTHING
      `, [
        tenantId,
        payment.transaction_amount || payment.net_amount || 0,
        periodo,
        pagoEstado,
        payment.payment_type_id || 'card',
        payment.id?.toString(),
        paymentId.toString(),
        payment.status === 'approved' ? new Date(payment.date_approved || payment.date_created).toISOString() : null,
      ]);

      // Si el pago fue aprobado, actualizar suscripción
      if (payment.status === 'approved') {
        await sql(`
          UPDATE subscriptions SET
            status = 'active',
            ultimo_pago_at = NOW(),
            meses_pagados = COALESCE(meses_pagados, 0) + 1,
            current_period_start = NOW(),
            current_period_end = NOW() + INTERVAL '1 month',
            updated_at = NOW()
          WHERE tenant_id = $1
        `, [tenantId]);

        await sql('UPDATE tenants SET active = true, updated_at = NOW() WHERE id = $1', [tenantId]);
        console.log(`[Webhook] Pago aprobado para tenant ${tenantId}: $${payment.transaction_amount}`);
      } else if (payment.status === 'rejected') {
        // Cobro rechazado — marcar como atrasado (pero MP reintenta automáticamente)
        await sql(`
          UPDATE subscriptions SET status = 'past_due', updated_at = NOW() WHERE tenant_id = $1
        `, [tenantId]);
        console.log(`[Webhook] Pago rechazado para tenant ${tenantId}`);
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    return res.status(200).json({ error: error.message });
  }
};
