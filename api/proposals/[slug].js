const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');

/**
 * GET /api/proposals/:slug
 * Returns personalized proposal data for a tenant.
 * Public endpoint — no auth required (it's a sales link).
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;
  if (!slug) {
    return res.status(400).json({ error: 'Slug requerido' });
  }

  const sql = getDb();

  try {
    // Get tenant
    const tenants = await sql(
      'SELECT id, name, slug, plan, created_at FROM tenants WHERE slug = $1',
      [slug]
    );

    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const tenant = tenants[0];

    // Count employees
    const countResult = await sql(
      'SELECT COUNT(*) as total FROM employees WHERE tenant_id = $1',
      [tenant.id]
    );
    const employeeCount = parseInt(countResult[0]?.total || 0);

    // Determine recommended plan and pricing
    const pricing = calculatePricing(employeeCount);

    return res.status(200).json({
      company: tenant.name,
      slug: tenant.slug,
      employeeCount,
      pricing,
      features: getFeatures(),
      comparison: getComparison(pricing.monthly),
      trial: {
        days: 15,
        noCard: true,
        noCommitment: true,
      },
      implementation: {
        time: 'Mismo día',
        steps: [
          { step: 'Crear cuenta', time: '2 minutos' },
          { step: 'Cargar colaboradores', time: '1 hora (masivo) o 5 min (uno a uno)' },
          { step: 'Activar dispositivo', time: '1 minuto' },
          { step: 'Colaboradores autorizan desde su celular', time: 'Mismo día' },
        ],
      },
      contract: {
        minMonths: 0,
        cancellation: '15 días de aviso',
        digital: true,
        link: `/contrato/${slug}`,
      },
    });
  } catch (err) {
    console.error('Error in proposals:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};

function calculatePricing(employeeCount) {
  // Pricing tiers (net prices in CLP)
  let plan, monthlyNet, perEmployee;

  if (employeeCount <= 30) {
    plan = 'Básico';
    monthlyNet = 59990;
    perEmployee = Math.round(59990 / Math.max(employeeCount, 1));
  } else if (employeeCount <= 100) {
    plan = 'Profesional';
    monthlyNet = 119990;
    perEmployee = Math.round(119990 / Math.max(employeeCount, 1));
  } else {
    plan = 'Enterprise';
    monthlyNet = 199990;
    perEmployee = Math.round(199990 / Math.max(employeeCount, 1));
  }

  const iva = Math.round(monthlyNet * 0.19);
  const monthlyTotal = monthlyNet + iva;
  const annualDiscount = 0.20;
  const annualNet = Math.round(monthlyNet * 12 * (1 - annualDiscount));
  const annualTotal = Math.round(annualNet * 1.19);

  return {
    plan,
    monthly: monthlyNet,
    monthlyIva: monthlyTotal,
    perEmployee,
    annual: annualNet,
    annualIva: annualTotal,
    annualDiscount: '20%',
    employeeCount,
  };
}

function getFeatures() {
  return [
    { icon: 'scan-face', title: 'Reconocimiento Facial', desc: 'Marca con tu rostro en 2 segundos. Imposible falsificar.' },
    { icon: 'smartphone', title: 'Sin Hardware Especial', desc: 'Funciona con cualquier tablet o celular con cámara.' },
    { icon: 'wifi-off', title: 'Modo Offline', desc: 'Funciona sin internet. Sincroniza al volver la conexión.' },
    { icon: 'map-pin', title: 'Geolocalización', desc: 'Dirección real verificada en cada marcaje.' },
    { icon: 'bell', title: 'Alertas Automáticas', desc: 'Notificaciones de ausencia, exceso de horas, resumen semanal.' },
    { icon: 'file-text', title: 'Libro DT en 1 Click', desc: 'Exporta el libro de asistencia formato Dirección del Trabajo.' },
    { icon: 'shield', title: 'Cumplimiento Legal', desc: 'Ley 19.628, Ley 21.719, firma electrónica Ley 19.799.' },
    { icon: 'zap', title: 'Implementación Día 1', desc: 'Operando el mismo día. Sin semanas de espera.' },
  ];
}

function getComparison(flexioPrice) {
  return {
    headers: ['', 'Flexio', 'GeoVictoria', 'Genera'],
    rows: [
      ['Reconocimiento facial', '✅', '❌', '❌ (solo con reloj)'],
      ['Sin hardware especial', '✅', '❌ (venden relojes)', '❌ (reloj incluido)'],
      ['Modo offline', '✅', '❌', '❌'],
      ['Implementación', 'Mismo día', 'Días/semanas', '10-30 días'],
      ['Contrato mínimo', 'Sin mínimo', '12 meses', '12 meses'],
      ['Aviso de término', '15 días', '60 días carta certificada', '60 días carta certificada'],
      ['Trial sin costo', '15 días', 'No', 'No'],
      ['Geolocalización con dirección', '✅', 'Parcial', '❌'],
      ['Dashboard interactivo', '✅ (drill-down)', 'Básico', 'Básico'],
      ['Contrato digital integrado', '✅', '❌', '❌'],
      ['Sugerencias automáticas (IA)', '✅', '❌', '❌'],
      ['App móvil con selfie', '✅', '❌', 'Incluida'],
    ],
  };
}
