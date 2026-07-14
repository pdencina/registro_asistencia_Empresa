const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * POST /api/billing/subscribe
 * Crea una suscripción en MercadoPago y retorna la URL de pago.
 * 
 * Body: { tenant_id, plan, payer_email }
 * 
 * Flujo:
 * 1. Cliente elige plan
 * 2. Este endpoint crea una "preapproval" en MercadoPago
 * 3. Retorna init_point (URL) donde el cliente ingresa su tarjeta
 * 4. MercadoPago cobra automáticamente cada mes
 * 5. Webhook actualiza el estado en nuestra BD
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!MP_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'MP_ACCESS_TOKEN no configurado' });
  }

  const sql = getDb();

  try {
    const { tenant_id, plan, payer_email } = req.body;

    if (!tenant_id || !plan || !payer_email) {
      return res.status(400).json({ error: 'tenant_id, plan y payer_email son obligatorios' });
    }

    // Verificar tenant existe
    const tenants = await sql('SELECT * FROM tenants WHERE id = $1', [tenant_id]);
    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    // Precios por plan (CLP)
    const planPrices = {
      basico: { amount: 59990, reason: 'Flexio Básico - Control de Asistencia' },
      profesional: { amount: 119990, reason: 'Flexio Profesional - Control de Asistencia' },
      enterprise: { amount: 199990, reason: 'Flexio Enterprise - Control de Asistencia' },
    };

    const selectedPlan = planPrices[plan];
    if (!selectedPlan) {
      return res.status(400).json({ error: 'Plan inválido' });
    }

    // Crear suscripción en MercadoPago (preapproval sin plan asociado)
    const BASE_URL = process.env.BASE_URL || 'https://flexio.cl';

    const subscriptionData = {
      reason: selectedPlan.reason,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: selectedPlan.amount,
        currency_id: 'CLP',
      },
      back_url: `${BASE_URL}/admin/settings?payment=success`,
      payer_email: payer_email,
      external_reference: `${tenant_id}|${plan}`,
    };

    const mpResponse = await fetch('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(subscriptionData),
    });

    const mpData = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('MercadoPago error:', mpData);
      return res.status(500).json({ error: 'Error al crear suscripción', details: mpData.message });
    }

    // Guardar referencia en nuestra BD
    await sql(`
      UPDATE subscriptions 
      SET plan = $1, status = 'pending', mp_subscription_id = $2, updated_at = NOW()
      WHERE tenant_id = $3
    `, [plan, mpData.id, tenant_id]);

    // Si no existe subscription, crear
    if (!mpData.id) {
      return res.status(500).json({ error: 'No se recibió ID de suscripción' });
    }

    return res.status(200).json({
      subscription_id: mpData.id,
      init_point: mpData.init_point,
      status: mpData.status,
      message: 'Redirige al cliente a init_point para que ingrese su tarjeta',
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    return res.status(500).json({ error: error.message });
  }
};
