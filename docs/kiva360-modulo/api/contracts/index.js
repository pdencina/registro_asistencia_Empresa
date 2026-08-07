const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { PRESTADOR, PLANES, calculateTotal, BILLING_CONFIG } = require('../lib/payments');

/**
 * GET /api/contracts?proposal_ref=KV-XXXXXXXX
 * Retorna datos del contrato basado en la propuesta aceptada.
 * Incluye: datos del prestador, términos, info de pago.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();
  const { proposal_ref } = req.query;

  if (!proposal_ref) {
    return res.status(400).json({ error: 'proposal_ref es obligatorio' });
  }

  try {
    // Buscar propuesta
    const [proposal] = await sql('SELECT * FROM proposals WHERE reference = $1', [proposal_ref]);
    if (!proposal) {
      return res.status(404).json({ error: 'Propuesta no encontrada' });
    }

    // Buscar contrato existente
    const [contract] = await sql(
      'SELECT * FROM contracts WHERE proposal_id = $1 ORDER BY created_at DESC LIMIT 1',
      [proposal.id]
    );

    const planConfig = PLANES[proposal.plan] || {};
    const descuento = proposal.discount_percent > 0 ? Math.round(proposal.price_monthly * proposal.discount_percent / 100) : 0;
    const precioFinal = proposal.price_monthly - descuento;
    const { iva, total } = calculateTotal(precioFinal);

    return res.status(200).json({
      proposal: {
        id: proposal.id,
        reference: proposal.reference,
        status: proposal.status,
        company_name: proposal.company_name,
        company_rut: proposal.company_rut,
        contact_name: proposal.contact_name,
        contact_email: proposal.contact_email,
        plan: proposal.plan,
        plan_nombre: planConfig.nombre || proposal.plan,
      },
      contract: contract ? {
        id: contract.id,
        estado: contract.estado,
        firmante_nombre: contract.firmante_nombre,
        firmante_rut: contract.firmante_rut,
        firmado_at: contract.firmado_at,
      } : null,
      terms: {
        plan: planConfig.nombre || proposal.plan,
        features: planConfig.features || [],
        precio_neto: precioFinal,
        iva,
        total_mensual: total,
        billing_day: BILLING_CONFIG.billing_day,
        grace_days: BILLING_CONFIG.grace_days,
        trial_days: proposal.trial_days,
        min_contract_months: proposal.min_contract_months,
        cancellation_days: proposal.cancellation_days,
        descuento: proposal.discount_percent,
      },
      payment_info: {
        prestador: PRESTADOR,
        metodos: [
          {
            tipo: 'transferencia',
            label: 'Transferencia Bancaria',
            instrucciones: `Transferir a: ${PRESTADOR.razon_social} | RUT: ${PRESTADOR.rut} | ${PRESTADOR.banco} | ${PRESTADOR.tipo_cuenta} N° ${PRESTADOR.numero_cuenta} | Email: ${PRESTADOR.email}`,
          },
          {
            tipo: 'tarjeta',
            label: 'Tarjeta de crédito/débito (cobro automático)',
            instrucciones: 'Registra tu tarjeta para cobro automático el día 30 de cada mes.',
          },
        ],
        nota: `El pago se realiza el día ${BILLING_CONFIG.billing_day} de cada mes. Se otorgan ${BILLING_CONFIG.grace_days} días de gracia.`,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
