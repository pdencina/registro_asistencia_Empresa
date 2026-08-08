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

  const PRICE_PER_PERSON = 1590; // CLP neto por persona/mes

  const plans = [
    {
      id: 'flexio',
      name: 'Flexio',
      price_per_person: PRICE_PER_PERSON,
      currency: 'CLP',
      interval: 'monthly',
      billing_day: 30,
      grace_days: 5,
      features: [
        'Reconocimiento facial IA',
        'Marcaje por PIN (alternativa)',
        'Registros inalterables (hash SHA-256)',
        'Sello de tiempo criptográfico',
        'Geolocalización con geofence',
        'Modo offline + sync automático',
        'Libro de Asistencia DT',
        'Acceso fiscalizador DT',
        'Reportes + exportación Excel/CSV',
        'Reporte de nómina con HHEE',
        'Notificaciones por email',
        'Alertas de jornada excedida',
        'Auditoría completa',
        'Dispositivos ilimitados',
        'Soporte por WhatsApp',
      ],
      examples: [
        { employees: 10, monthly: 15900, monthly_iva: 18921 },
        { employees: 25, monthly: 39750, monthly_iva: 47323 },
        { employees: 50, monthly: 79500, monthly_iva: 94605 },
        { employees: 100, monthly: 159000, monthly_iva: 189210 },
      ],
    },
  ];

  return res.status(200).json(plans);
};
