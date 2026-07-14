const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * GET /api/billing/plans
 * Retorna los planes disponibles con sus precios y IDs de MercadoPago.
 * Los plan IDs se crean una vez en MercadoPago y se guardan como env vars.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const plans = [
    {
      id: 'basico',
      name: 'Básico',
      price: 59990,
      currency: 'CLP',
      interval: 'monthly',
      max_employees: 30,
      max_devices: 1,
      features: ['Hasta 30 colaboradores', '1 dispositivo', 'Reconocimiento facial', 'Reportes básicos', 'Soporte por email'],
      mp_plan_id: process.env.MP_PLAN_BASICO_ID || null,
    },
    {
      id: 'profesional',
      name: 'Profesional',
      price: 119990,
      currency: 'CLP',
      interval: 'monthly',
      max_employees: 100,
      max_devices: 3,
      features: ['Hasta 100 colaboradores', '3 dispositivos', 'Reportes y exportación Excel', 'Webhooks', 'Geolocalización', 'Soporte prioritario'],
      mp_plan_id: process.env.MP_PLAN_PROFESIONAL_ID || null,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 199990,
      currency: 'CLP',
      interval: 'monthly',
      max_employees: 9999,
      max_devices: 999,
      features: ['Colaboradores ilimitados', 'Dispositivos ilimitados', 'Multi-sucursal', 'API completa', 'SLA 99.9%', 'Soporte 24/7'],
      mp_plan_id: process.env.MP_PLAN_ENTERPRISE_ID || null,
    },
  ];

  return res.status(200).json(plans);
};
