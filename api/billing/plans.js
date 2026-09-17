const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * GET /api/billing/plans
 * Retorna los planes disponibles con precios por persona.
 * Modelo: $1.590/persona/mes + IVA
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Planes fijos (hasta 300 colaboradores)
  const fixedPlans = [
    { id: 'basico', name: 'Básico', price: 39990, max_employees: 30, max_devices: 1 },
    { id: 'profesional', name: 'Profesional', price: 99990, max_employees: 100, max_devices: 3 },
    { id: 'enterprise', name: 'Enterprise', price: 249990, max_employees: 300, max_devices: 10 },
  ];

  // Plan corporativo: tarifa por trabajador activo según dotación (sobre 300)
  const corporateTiers = [
    { from: 301, to: 750, price: 700 },
    { from: 751, to: 1500, price: 600 },
    { from: 1501, to: 3000, price: 500 },
    { from: 3001, to: null, price: null }, // a convenir
  ];

  const plans = [
    {
      id: 'flexio',
      name: 'Flexio',
      fixed_plans: fixedPlans,
      corporate_tiers: corporateTiers,
      currency: 'CLP',
      interval: 'monthly',
      billing_day: 30,
      grace_days: 5,
      features: [
        'Reconocimiento facial IA',
        'Marcaje por PIN o RUT',
        'Registros inalterables (hash SHA-256)',
        'Sello de tiempo criptográfico',
        'Geolocalización con registro de perímetro',
        'Modo offline + sync automático',
        'Libro de asistencia formato Art. 33',
        'Acceso para fiscalización mediante token',
        'Reportes + exportación Excel/CSV',
        'Reporte de nómina con HHEE',
        'Notificaciones por email',
        'Alertas de jornada excedida',
        'Auditoría completa',
        '15 días de prueba gratis',
        'Soporte por WhatsApp',
      ],
      examples: [
        { plan: 'Básico', employees: 'hasta 30', monthly: 39990, monthly_iva: 47588 },
        { plan: 'Profesional', employees: 'hasta 100', monthly: 99990, monthly_iva: 118988 },
        { plan: 'Enterprise', employees: 'hasta 300', monthly: 249990, monthly_iva: 297488 },
        { plan: 'Corporativo', employees: '1.200 (agrícola)', monthly: 720000, monthly_iva: 856800 },
      ],
    },
  ];

  return res.status(200).json(plans);
};
