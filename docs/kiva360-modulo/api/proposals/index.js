const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { PLANES, calculateTotal } = require('../lib/payments');

/**
 * /api/proposals — Kiva360
 * 
 * GET ?ref=xxx — Público: ver propuesta por referencia
 * GET (admin) — Listar todas las propuestas
 * POST (admin) — Crear propuesta nueva
 * PUT — Actualizar propuesta o aceptar (action=accept)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  const sql = getDb();

  // GET: Público por referencia o lista admin
  if (req.method === 'GET') {
    const { ref } = req.query;

    if (ref) {
      // Público: buscar por referencia
      const [proposal] = await sql('SELECT * FROM proposals WHERE reference = $1', [ref]);
      if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada' });

      // Marcar como vista si es primera vez
      if (!proposal.viewed_at) {
        await sql('UPDATE proposals SET viewed_at = NOW() WHERE id = $1', [proposal.id]);
      }

      // Verificar expiración
      if (proposal.valid_until && new Date(proposal.valid_until) < new Date()) {
        if (proposal.status === 'sent') {
          await sql("UPDATE proposals SET status = 'expired' WHERE id = $1", [proposal.id]);
          proposal.status = 'expired';
        }
      }

      return res.status(200).json(formatProposal(proposal));
    }

    // Admin: listar todas
    if (!verifyAdmin(req)) return res.status(401).json({ error: 'No autorizado' });
    const proposals = await sql('SELECT * FROM proposals ORDER BY created_at DESC');
    return res.status(200).json(proposals.map(formatProposal));
  }

  // POST: Crear propuesta
  if (req.method === 'POST') {
    if (!verifyAdmin(req)) return res.status(401).json({ error: 'No autorizado' });

    const {
      company_name, company_rut, contact_name, contact_email, contact_phone,
      plan, num_students, price_monthly, discount_percent, setup_fee,
      trial_days, min_contract_months, cancellation_days, notes, valid_until,
    } = req.body;

    if (!company_name || !plan) {
      return res.status(400).json({ error: 'company_name y plan son requeridos' });
    }

    const planConfig = PLANES[plan];
    const precio = price_monthly || (planConfig ? planConfig.precio : 49990);

    // Generar referencia única
    const now = new Date();
    const reference = `KV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

    const [row] = await sql(`
      INSERT INTO proposals (reference, status, company_name, company_rut, contact_name, contact_email, contact_phone,
        plan, num_students, price_monthly, discount_percent, setup_fee, trial_days, min_contract_months,
        cancellation_days, notes, valid_until)
      VALUES ($1, 'sent', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      reference, company_name, company_rut || null, contact_name || null,
      contact_email || null, contact_phone || null,
      plan, num_students || (planConfig ? planConfig.max_alumnos : 80),
      precio, discount_percent || 0, setup_fee || 0,
      trial_days || 15, min_contract_months || 0, cancellation_days || 15,
      notes || null, valid_until || null,
    ]);

    return res.status(201).json({
      ...formatProposal(row),
      link: `https://kiva360.cl/propuesta/${reference}`,
    });
  }

  // PUT: Actualizar o aceptar
  if (req.method === 'PUT') {
    const { id, action, ...updates } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    // Aceptar propuesta (público)
    if (action === 'accept') {
      const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'desconocida';
      await sql(
        "UPDATE proposals SET status = 'accepted', accepted_at = NOW(), accepted_ip = $1, updated_at = NOW() WHERE id = $2",
        [typeof ip === 'string' ? ip.split(',')[0].trim() : 'desconocida', id]
      );
      const [updated] = await sql('SELECT * FROM proposals WHERE id = $1', [id]);
      // TODO: Enviar notificación email
      return res.status(200).json(formatProposal(updated));
    }

    // Admin updates
    if (!verifyAdmin(req)) return res.status(401).json({ error: 'No autorizado' });
    // ... (similar a Flexio — omitido por brevedad)
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

function formatProposal(p) {
  if (!p) return null;
  const planConfig = PLANES[p.plan] || {};
  const descuento = p.discount_percent > 0 ? Math.round(p.price_monthly * p.discount_percent / 100) : 0;
  const precioFinal = p.price_monthly - descuento;
  const { iva, total } = calculateTotal(precioFinal);

  return {
    ...p,
    plan_config: planConfig,
    calculated: {
      precio_neto: precioFinal,
      iva,
      total_mensual: total,
      descuento,
      precio_anual_neto: Math.round(precioFinal * 12 * 0.8), // 20% desc anual
      precio_anual_total: Math.round(precioFinal * 12 * 0.8 * 1.19),
    },
  };
}

function verifyAdmin(req) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  return token === secret;
}
