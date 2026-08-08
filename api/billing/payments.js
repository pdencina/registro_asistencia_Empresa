const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

/**
 * GET /api/billing/payments
 * Historial de pagos de la suscripción del tenant.
 * Header: x-tenant-slug
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    // Asegurar tabla existe
    await sql(`
      CREATE TABLE IF NOT EXISTS pagos_suscripcion (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        monto INTEGER NOT NULL,
        periodo TEXT,
        estado TEXT NOT NULL DEFAULT 'pendiente',
        metodo TEXT,
        referencia TEXT,
        mp_payment_id TEXT,
        pagado_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const payments = await sql(
      'SELECT * FROM pagos_suscripcion WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 24',
      [tenant.id]
    );

    // Calcular estadísticas
    const totalPagado = payments.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.monto, 0);
    const mesesPagados = payments.filter(p => p.estado === 'pagado').length;

    return res.status(200).json({
      payments: payments.map(p => ({
        id: p.id,
        monto: p.monto,
        monto_iva: Math.round(p.monto * 1.19),
        periodo: p.periodo,
        estado: p.estado,
        estado_label: { pagado: 'Pagado', pendiente: 'Pendiente', fallido: 'Fallido', atrasado: 'Atrasado' }[p.estado] || p.estado,
        metodo: p.metodo,
        referencia: p.referencia,
        pagado_at: p.pagado_at,
        created_at: p.created_at,
      })),
      stats: {
        total_pagado: totalPagado,
        total_pagado_iva: Math.round(totalPagado * 1.19),
        meses_pagados: mesesPagados,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
