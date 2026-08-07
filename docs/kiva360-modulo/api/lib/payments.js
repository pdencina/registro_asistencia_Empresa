/**
 * Configuración de pagos — Kiva360
 * Datos del prestador para mostrar en contratos y facturas.
 */

const PRESTADOR = {
  razon_social: 'Flexio Technologies Spa',
  rut: '78.479.402-4',
  banco: 'Bci',
  tipo_cuenta: 'Cuenta corriente en pesos',
  numero_cuenta: '68569265',
  email: 'pablo@flexio.cl',
};

const PLANES = {
  starter: {
    nombre: 'Starter',
    precio: 49990, // neto CLP/mes
    max_alumnos: 80,
    features: [
      'Hasta 80 alumnos',
      'Asistencia y calificaciones',
      'Comunicados y mensajería',
      'Portal para apoderados',
      'Gestión de programas',
      'Reportes diarios',
      'Usuarios ilimitados',
    ],
  },
  profesional: {
    nombre: 'Profesional',
    precio: 89990, // neto CLP/mes
    max_alumnos: 300,
    features: [
      'Hasta 300 alumnos',
      'Todo de Starter',
      'Intervención NEE (PII completo)',
      'Agenda de sesiones terapéuticas',
      'Cobro por sesión individual',
      'Paquetes de sesiones con descuento',
      'Portal de avances para familias',
      'Bitácora conductual (ABC)',
      'Formulario de admisión público',
      'Cobranzas y facturación',
      'Soporte prioritario',
    ],
  },
  enterprise: {
    nombre: 'Enterprise',
    precio: null, // personalizado
    max_alumnos: null, // ilimitado
    features: [
      'Alumnos ilimitados',
      'Todo de Profesional',
      'Multi-sede / multi-colegio',
      'API e integraciones',
      'Onboarding personalizado',
      'SLA garantizado',
      'Account manager dedicado',
    ],
  },
};

// Configuración de cobros
const BILLING_CONFIG = {
  billing_day: 30, // día del mes para cobrar
  grace_days: 5, // días de gracia post vencimiento
  max_retry_attempts: 3, // máximo intentos de cobro
  retry_interval_days: 2, // días entre reintentos
  iva_rate: 0.19,
};

/**
 * Calcula IVA y total.
 */
function calculateTotal(neto) {
  const iva = Math.round(neto * BILLING_CONFIG.iva_rate);
  return { neto, iva, total: neto + iva };
}

/**
 * Calcula la próxima fecha de cobro.
 */
function getNextBillingDate(fromDate = new Date()) {
  const next = new Date(fromDate);
  next.setMonth(next.getMonth() + 1);
  // Ajustar al día 30 (o último día del mes si es menor)
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(BILLING_CONFIG.billing_day, lastDay));
  return next.toISOString().split('T')[0];
}

/**
 * Calcula la fecha de gracia (5 días post vencimiento).
 */
function getGraceDate(billingDate) {
  const grace = new Date(billingDate + 'T12:00:00');
  grace.setDate(grace.getDate() + BILLING_CONFIG.grace_days);
  return grace.toISOString().split('T')[0];
}

module.exports = {
  PRESTADOR,
  PLANES,
  BILLING_CONFIG,
  calculateTotal,
  getNextBillingDate,
  getGraceDate,
};
