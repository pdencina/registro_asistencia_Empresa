const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { PRESTADOR, BILLING_CONFIG, calculateTotal, getNextBillingDate, getGraceDate } = require('../lib/payments');
const crypto = require('crypto');

/**
 * POST /api/contracts/sign
 * El cliente firma digitalmente el contrato de Kiva360.
 * Crea el contrato + la suscripción activa.
 * 
 * Body: {
 *   proposal_ref, firmante_nombre, firmante_rut,
 *   firmante_email, firmante_cargo, firma_data, consentimiento
 * }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = getDb();

  try {
    const {
      proposal_ref, firmante_nombre, firmante_rut,
      firmante_email, firmante_cargo, firma_data, consentimiento,
    } = req.body;

    if (!proposal_ref || !firmante_nombre || !firmante_rut || !firma_data) {
      return res.status(400).json({ error: 'Faltan datos: nombre, RUT y firma son obligatorios' });
    }
    if (!consentimiento) {
      return res.status(400).json({ error: 'Debe aceptar los términos para firmar' });
    }

    // Buscar propuesta
    const [proposal] = await sql('SELECT * FROM proposals WHERE reference = $1', [proposal_ref]);
    if (!proposal) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (proposal.status !== 'accepted') {
      return res.status(400).json({ error: 'La propuesta debe estar aceptada antes de firmar' });
    }

    // Verificar no tenga contrato firmado ya
    const [existing] = await sql(
      "SELECT id FROM contracts WHERE proposal_id = $1 AND estado IN ('firmado_cliente','firmado','activo')",
      [proposal.id]
    );
    if (existing) return res.status(409).json({ error: 'Ya existe un contrato firmado' });

    // Generar evidencia
    const firmaHash = crypto.createHash('sha256').update(firma_data).digest('hex');
    const timestamp = new Date().toISOString();
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'desconocida';

    const auditoria = {
      firmante: { nombre: firmante_nombre, rut: firmante_rut, email: firmante_email, cargo: firmante_cargo },
      timestamp,
      ip: typeof ip === 'string' ? ip.split(',')[0].trim() : ip,
      user_agent: req.headers['user-agent'] || '',
      firma_hash: firmaHash,
      metodo: 'firma_electronica_simple',
    };

    const descuento = proposal.discount_percent > 0
      ? Math.round(proposal.price_monthly * proposal.discount_percent / 100) : 0;
    const precioFinal = proposal.price_monthly - descuento;

    // Crear contrato
    const contractId = crypto.randomUUID();
    await sql(`
      INSERT INTO contracts (id, proposal_id, company_name, company_rut, plan, price_monthly, billing_cycle,
        firmante_nombre, firmante_rut, firmante_email, firmante_cargo,
        firma_digital, firmado_at, firma_hash, auditoria_firma, estado, fecha_inicio)
      VALUES ($1,$2,$3,$4,$5,$6,'monthly',$7,$8,$9,$10,$11,$12,$13,$14,'firmado_cliente',$15)
    `, [
      contractId, proposal.id, proposal.company_name, proposal.company_rut,
      proposal.plan, precioFinal,
      firmante_nombre, firmante_rut, firmante_email || null, firmante_cargo || null,
      firma_data, timestamp, firmaHash, JSON.stringify(auditoria),
      new Date().toISOString().split('T')[0],
    ]);

    // Crear suscripción activa
    const today = new Date();
    const periodStart = today.toISOString().split('T')[0];
    const periodEnd = getNextBillingDate(today);
    const nextBilling = periodEnd;
    const graceUntil = getGraceDate(nextBilling);

    await sql(`
      INSERT INTO subscriptions (contract_id, company_name, company_rut, plan, price_monthly,
        status, current_period_start, current_period_end, next_billing_date, grace_until, billing_day)
      VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10)
    `, [
      contractId, proposal.company_name, proposal.company_rut,
      proposal.plan, precioFinal,
      periodStart, periodEnd, nextBilling, graceUntil, BILLING_CONFIG.billing_day,
    ]);

    // Actualizar propuesta a contratada
    await sql("UPDATE proposals SET status = 'contracted', updated_at = NOW() WHERE id = $1", [proposal.id]);

    return res.status(200).json({
      ok: true,
      contract_id: contractId,
      evidencia: { timestamp, firma_hash: firmaHash },
      payment_info: PRESTADOR,
      next_billing: nextBilling,
      grace_until: graceUntil,
      message: 'Contrato firmado exitosamente. La suscripción está activa.',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
