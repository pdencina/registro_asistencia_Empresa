const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * POST /api/billing/setup-plans
 * Crea los planes de suscripción en MercadoPago (ejecutar UNA sola vez).
 * Requiere GLOBAL_ADMIN_SECRET en header.
 * 
 * Después de ejecutar, guardar los IDs retornados como variables de entorno:
 * MP_PLAN_BASICO_ID, MP_PLAN_PROFESIONAL_ID, MP_PLAN_ENTERPRISE_ID
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verificar super admin
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  const GLOBAL_SECRET = process.env.GLOBAL_ADMIN_SECRET;

  if (!token || !GLOBAL_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    if (!decoded.startsWith(GLOBAL_SECRET + ':')) {
      return res.status(401).json({ error: 'No autorizado' });
    }
  } catch {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  if (!MP_ACCESS_TOKEN) {
    return res.status(500).json({ error: 'MP_ACCESS_TOKEN no configurado' });
  }

  const BASE_URL = process.env.BASE_URL || 'https://flexio.cl';

  const plans = [
    {
      reason: 'Flexio Básico - Control de Asistencia',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 39990,
        currency_id: 'CLP',
        repetitions: null, // infinito
      },
      back_url: `${BASE_URL}/admin/settings`,
    },
    {
      reason: 'Flexio Profesional - Control de Asistencia',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 79990,
        currency_id: 'CLP',
        repetitions: null,
      },
      back_url: `${BASE_URL}/admin/settings`,
    },
    {
      reason: 'Flexio Enterprise - Control de Asistencia',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: 149990,
        currency_id: 'CLP',
        repetitions: null,
      },
      back_url: `${BASE_URL}/admin/settings`,
    },
  ];

  const results = [];

  for (const plan of plans) {
    const mpRes = await fetch('https://api.mercadopago.com/preapproval_plan', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(plan),
    });

    const data = await mpRes.json();
    results.push({
      reason: plan.reason,
      id: data.id,
      status: data.status,
      init_point: data.init_point,
    });
  }

  return res.status(200).json({
    message: 'Planes creados en MercadoPago. Guardar estos IDs como variables de entorno:',
    plans: results,
    env_vars: {
      MP_PLAN_BASICO_ID: results[0]?.id,
      MP_PLAN_PROFESIONAL_ID: results[1]?.id,
      MP_PLAN_ENTERPRISE_ID: results[2]?.id,
    },
  });
};
