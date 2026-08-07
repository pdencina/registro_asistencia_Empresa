const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');

/**
 * POST /api/subscriptions/register-card
 * 
 * Registra una tarjeta para cobro automático mensual.
 * Integra con el procesador de pagos (ej: MercadoPago, Flow, Transbank Oneclick).
 * 
 * Body: { subscription_id, card_token, card_last_four, card_brand }
 * 
 * Nota: El card_token viene del frontend después de tokenizar la tarjeta
 * con el SDK del procesador de pagos (no se envían datos de tarjeta al backend).
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sql = getDb();

  try {
    const { subscription_id, card_token, card_last_four, card_brand } = req.body;

    if (!subscription_id || !card_token) {
      return res.status(400).json({ error: 'subscription_id y card_token son obligatorios' });
    }

    // Verificar que la suscripción existe
    const [sub] = await sql('SELECT * FROM subscriptions WHERE id = $1', [subscription_id]);
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    // Guardar token de la tarjeta
    await sql(`
      UPDATE subscriptions SET
        card_registered = true,
        card_last_four = $1,
        card_brand = $2,
        card_token = $3,
        card_registered_at = NOW(),
        auto_charge = true,
        updated_at = NOW()
      WHERE id = $4
    `, [card_last_four || '****', card_brand || 'unknown', card_token, subscription_id]);

    return res.status(200).json({
      ok: true,
      message: 'Tarjeta registrada. El cobro automático se realizará el día 30 de cada mes.',
      card: { last_four: card_last_four, brand: card_brand },
      next_charge: sub.next_billing_date,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
