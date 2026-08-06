const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { generateDailyAnchor } = require('../lib/timestamp');

/**
 * POST /api/attendance/daily-anchor
 * 
 * Genera un hash de anclaje diario que consolida todos los registros del día.
 * Este hash puede publicarse externamente (GitHub, blockchain, etc.) como
 * prueba de existencia de los registros a una fecha determinada.
 * 
 * Body: { date: "YYYY-MM-DD" } (default: ayer)
 * 
 * GET /api/attendance/daily-anchor
 * Consulta anchors existentes.
 * Query: start_date, end_date
 * 
 * Resolución 38 Exenta — Sello de tiempo y prueba de existencia.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  // Asegurar tabla de anchors
  try {
    await sql(`
      CREATE TABLE IF NOT EXISTS daily_anchors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        date DATE NOT NULL,
        anchor_hash VARCHAR(64) NOT NULL,
        records_count INTEGER NOT NULL,
        generated_at TIMESTAMP NOT NULL,
        UNIQUE(tenant_id, date)
      )
    `);
  } catch (e) {}

  // GET: Consultar anchors
  if (req.method === 'GET') {
    try {
      const { start_date, end_date } = req.query;
      let query = 'SELECT * FROM daily_anchors WHERE tenant_id = $1';
      const params = [tenant.id];
      let idx = 2;

      if (start_date) {
        query += ` AND date >= $${idx++}`;
        params.push(start_date);
      }
      if (end_date) {
        query += ` AND date <= $${idx++}`;
        params.push(end_date);
      }
      query += ' ORDER BY date DESC LIMIT 90';

      const anchors = await sql(query, params);
      return res.status(200).json({ anchors });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST: Generar anchor
  if (req.method === 'POST') {
    try {
      // Default: ayer
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const date = req.body.date || yesterday.toISOString().split('T')[0];

      // Obtener todos los hashes del día
      const records = await sql(`
        SELECT record_hash FROM attendance_records
        WHERE tenant_id = $1 AND date(timestamp AT TIME ZONE 'America/Santiago') = $2
          AND record_hash IS NOT NULL
        ORDER BY timestamp
      `, [tenant.id, date]);

      if (records.length === 0) {
        return res.status(200).json({
          message: `No hay registros para el ${date}`,
          date,
          anchor: null,
        });
      }

      const hashes = records.map(r => r.record_hash);
      const anchor = generateDailyAnchor(hashes, date);

      // Guardar anchor
      await sql(`
        INSERT INTO daily_anchors (tenant_id, date, anchor_hash, records_count, generated_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (tenant_id, date) DO UPDATE SET
          anchor_hash = $3, records_count = $4, generated_at = $5
      `, [tenant.id, date, anchor.anchor_hash, anchor.records_count, anchor.generated_at]);

      return res.status(200).json({
        message: `Anchor generado para ${date}`,
        anchor,
        nota: 'Este hash consolida todos los registros del día. Publíquelo externamente como prueba de existencia.',
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
