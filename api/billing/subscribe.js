const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

const PRICE_PER_PERSON = 1590; // CLP neto por persona/mes

/**
 * POST /api/billing/subscribe
 * Crea una suscripción en MercadoPago y retorna la URL de pago.
 * 
 * Body: { payer_email }
 * Header: x-tenant-slug
 * 
 * Flujo:
 * 1. Calcula precio según cantidad de empleados activos × $1.590
 * 2. Crea una "preapproval" en MercadoPago
 * 3. Retorna init_point (URL) donde el cliente ingresa su tarjeta
 * 4. MercadoPago cobra automáticamente el 30 de cada mes
 * 5. Webhook actualiza el estado en nuestra BD
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!MP_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'Suscripciones no configuradas. Contacta a soporte.' });
  }

  const sql = getDb();
  const slug = req.headers['x-tenant-slug'];

  try {
    const { payer_email } = req.body;

    if (!payer_email) {
      return res.status(400).json({ error: 'payer_email es obligatorio' });
    }

    // Obtener tenant
    const [tenant] = await sql('SELECT * FROM tenants WHERE slug = $1 AND active = true', [slug]);
    if (!tenant) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    // Contar empleados activos para calcular monto
    const [countRow] = await sql(
      'SELECT COUNT(*) as count FROM employees WHERE tenant_id = $1 AND active = true',
      [tenant.id]
    );
    const numEmployees = Math.max(Number(countRow.count), 1);
    const monthlyAmount = numEmployees * PRICE_PER_PERSON;

    // Crear suscripción en MercadoPago (preapproval)
    const BASE_URL = process.env.BASE_URL || 'https://flexio.cl';

    const subscriptionData = {
      reason: `Flexio - Control de Asistencia (${numEmployees} colaboradores × $${PRICE_PER_PERSON.toLocaleString('es-CL')}/mes)`,
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: monthlyAmount,
        currency_id: 'CLP',
        start_date: getNextBillingDate(), // Primer cobro el próximo día 30
      },
      payer_email: payer_email,
      back_url: `${BASE_URL}/admin/${slug}/settings?payment=success`,
      external_reference: `${tenant.id}|flexio|${numEmployees}`,
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

    // Asegurar tabla suscripciones tiene columnas nuevas
    await sql('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS num_employees INTEGER');
    await sql('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price_per_person INTEGER DEFAULT 1590');
    await sql('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS monto_mensual INTEGER');
    await sql('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS tarjeta_inscrita BOOLEAN DEFAULT false');
    await sql('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS dias_gracia INTEGER DEFAULT 5');
    await sql('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS meses_pagados INTEGER DEFAULT 0');
    await sql('ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS ultimo_pago_at TIMESTAMPTZ');

    // Actualizar suscripción en BD
    await sql(`
      UPDATE subscriptions SET
        plan = 'flexio',
        status = 'pending',
        mp_subscription_id = $1,
        num_employees = $2,
        price_per_person = $3,
        monto_mensual = $4,
        tarjeta_inscrita = false,
        updated_at = NOW()
      WHERE tenant_id = $5
    `, [mpData.id, numEmployees, PRICE_PER_PERSON, monthlyAmount, tenant.id]);

    return res.status(200).json({
      subscription_id: mpData.id,
      init_point: mpData.init_point,
      status: mpData.status,
      pricing: {
        employees: numEmployees,
        price_per_person: PRICE_PER_PERSON,
        monthly_neto: monthlyAmount,
        monthly_iva: Math.round(monthlyAmount * 1.19),
      },
      message: 'Redirige al usuario a init_point para inscribir su tarjeta.',
    });
  } catch (error) {
    console.error('Subscribe error:', error);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Calcula la fecha del próximo día 30 (o último día del mes si es menor).
 */
function getNextBillingDate() {
  const now = new Date();
  let next;
  if (now.getDate() >= 30) {
    // Ya pasó el 30 este mes, programar para el próximo
    next = new Date(now.getFullYear(), now.getMonth() + 1, 30);
  } else {
    next = new Date(now.getFullYear(), now.getMonth(), 30);
  }
  // Ajustar si el mes no tiene 30 días
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  if (30 > lastDay) next.setDate(lastDay);
  return next.toISOString();
}
