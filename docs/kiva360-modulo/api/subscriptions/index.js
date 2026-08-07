const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { PRESTADOR, BILLING_CONFIG, calculateTotal } = require('../lib/payments');

/**
 * GET /api/subscriptions?company_rut=78.479.402-4
 * 
 * Portal del cliente: muestra su suscripción activa,
 * historial de pagos, próximo vencimiento y estado.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sql = getDb();
  const { company_rut, contract_id } = req.query;

  if (!company_rut && !contract_id) {
    return res.status(400).json({ error: 'company_rut o contract_id es requerido' });
  }

  try {
    // Buscar suscripción
    let sub;
    if (contract_id) {
      [sub] = await sql('SELECT * FROM subscriptions WHERE contract_id = $1', [contract_id]);
    } else {
      [sub] = await sql(
        "SELECT * FROM subscriptions WHERE company_rut = $1 AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1",
        [company_rut]
      );
    }

    if (!sub) {
      return res.status(404).json({ error: 'No se encontró suscripción activa' });
    }

    // Historial de pagos
    const payments = await sql(
      'SELECT * FROM payments WHERE subscription_id = $1 ORDER BY period_start DESC LIMIT 24',
      [sub.id]
    );

    // Calcular estado actualizado
    const today = new Date().toISOString().split('T')[0];
    let currentStatus = sub.status;

    if (sub.status === 'active' && today > sub.next_billing_date) {
      // Pasó la fecha de cobro
      if (today <= sub.grace_until) {
        currentStatus = 'grace_period';
      } else {
        currentStatus = 'past_due';
      }
    }

    const { neto, iva, total } = calculateTotal(sub.price_monthly);

    return res.status(200).json({
      subscription: {
        id: sub.id,
        status: currentStatus,
        status_label: STATUS_LABELS[currentStatus] || currentStatus,
        plan: sub.plan,
        company_name: sub.company_name,
        price_monthly_neto: neto,
        price_monthly_iva: iva,
        price_monthly_total: total,
        current_period: {
          start: sub.current_period_start,
          end: sub.current_period_end,
        },
        next_billing_date: sub.next_billing_date,
        grace_until: sub.grace_until,
        billing_day: sub.billing_day,
        card: sub.card_registered ? {
          registered: true,
          last_four: sub.card_last_four,
          brand: sub.card_brand,
          auto_charge: sub.auto_charge,
        } : { registered: false },
      },
      payments: payments.map(p => ({
        id: p.id,
        period: `${p.period_start} → ${p.period_end}`,
        amount_neto: p.amount,
        iva: p.iva,
        total: p.total,
        status: p.status,
        status_label: PAYMENT_STATUS[p.status] || p.status,
        method: p.method,
        paid_at: p.paid_at,
        reference: p.payment_reference,
      })),
      payment_info: PRESTADOR,
      config: {
        billing_day: BILLING_CONFIG.billing_day,
        grace_days: BILLING_CONFIG.grace_days,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const STATUS_LABELS = {
  active: 'Activa',
  grace_period: 'En período de gracia',
  past_due: 'Pago pendiente (vencido)',
  suspended: 'Suspendida por falta de pago',
  cancelled: 'Cancelada',
};

const PAYMENT_STATUS = {
  pending: 'Pendiente',
  paid: 'Pagado',
  failed: 'Fallido',
  refunded: 'Reembolsado',
};
