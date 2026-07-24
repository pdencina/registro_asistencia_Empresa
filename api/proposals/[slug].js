const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');

/**
 * GET /api/proposals/:slug
 * Returns proposal data.
 * First tries to find by reference code in proposals table (new system).
 * Falls back to tenant-based calculation (legacy).
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;
  if (!slug) {
    return res.status(400).json({ error: 'Referencia requerida' });
  }

  const sql = getDb();

  try {
    // First: try to find a proposal by reference
    const proposals = await sql(
      'SELECT * FROM proposals WHERE reference = $1',
      [slug]
    ).catch(() => []);

    if (proposals.length > 0) {
      const p = proposals[0];
      return res.status(200).json(formatDbProposal(p));
    }

    // Fallback: legacy tenant-based calculation
    const tenants = await sql(
      'SELECT id, name, slug, plan, created_at FROM tenants WHERE slug = $1',
      [slug]
    );

    if (tenants.length === 0) {
      return res.status(404).json({ error: 'Propuesta no encontrada' });
    }

    const tenant = tenants[0];

    // Count employees
    const countResult = await sql(
      'SELECT COUNT(*) as total FROM employees WHERE tenant_id = $1',
      [tenant.id]
    );
    const employeeCount = parseInt(countResult[0]?.total || 0);

    // Calculate pricing (legacy)
    const pricing = calculatePricing(employeeCount);

    return res.status(200).json({
      source: 'legacy',
      company: tenant.name,
      slug: tenant.slug,
      employeeCount,
      pricing,
      features: getFeatures(),
      comparison: getComparison(),
      trial: { days: 15, noCard: true, noCommitment: true },
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

function formatDbProposal(p) {
  const rawMonthly = p.num_employees * p.price_per_user;
  const monthlyNet = Math.max(rawMonthly, p.minimum_monthly);
  const discountedMonthly = p.discount_percent > 0
    ? Math.round(monthlyNet * (1 - p.discount_percent / 100))
    : monthlyNet;
  const monthlyIva = Math.round(discountedMonthly * 1.19);
  const annualNet = Math.round(discountedMonthly * 12 * (1 - (p.annual_discount_percent || 0) / 100));
  const annualIva = Math.round(annualNet * 1.19);
  const perEmployee = Math.round(discountedMonthly / Math.max(p.num_employees, 1));

  return {
    source: 'proposal',
    id: p.id,
    reference: p.reference,
    status: p.status,
    company: p.company_name,
    companyRut: p.company_rut,
    contact: { name: p.contact_name, email: p.contact_email, phone: p.contact_phone },
    employeeCount: p.num_employees,
    pricing: {
      plan: p.num_employees <= 30 ? 'Básico' : p.num_employees <= 100 ? 'Profesional' : 'Enterprise',
      pricePerUser: p.price_per_user,
      minimum: p.minimum_monthly,
      minimumApplied: rawMonthly < p.minimum_monthly,
      monthly: discountedMonthly,
      monthlyIva,
      annual: annualNet,
      annualIva,
      annualDiscount: `${p.annual_discount_percent}%`,
      perEmployee,
      discount: p.discount_percent,
      setupFee: p.setup_fee,
      employeeCount: p.num_employees,
    },
    features: getFeatures(),
    comparison: getComparison(),
    trial: { days: p.trial_days, noCard: true, noCommitment: true },
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
      minMonths: p.min_contract_months,
      cancellation: `${p.cancellation_days} días de aviso`,
      digital: true,
      link: null,
    },
    notes: p.notes,
    validUntil: p.valid_until,
    createdAt: p.created_at,
    acceptedAt: p.accepted_at,
  };
}

function calculatePricing(employeeCount) {
  const pricePerUser = 1490;
  const minimum = 29900;
  const rawMonthly = employeeCount * pricePerUser;
  const monthlyNet = Math.max(rawMonthly, minimum);
  const plan = employeeCount <= 30 ? 'Básico' : employeeCount <= 100 ? 'Profesional' : 'Enterprise';
  const iva = Math.round(monthlyNet * 0.19);
  const monthlyTotal = monthlyNet + iva;
  const annualDiscount = 0.20;
  const annualNet = Math.round(monthlyNet * 12 * (1 - annualDiscount));
  const annualTotal = Math.round(annualNet * 1.19);
  const perEmployee = Math.round(monthlyNet / Math.max(employeeCount, 1));

  return {
    plan,
    pricePerUser,
    minimum,
    minimumApplied: rawMonthly < minimum,
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

function getComparison() {
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
