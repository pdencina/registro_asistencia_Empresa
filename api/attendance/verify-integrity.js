const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { verifyChainIntegrity, createProtectionRules, ensureIntegrityColumns } = require('../lib/integrity');

/**
 * GET /api/attendance/verify-integrity
 * Verifica la integridad de la cadena de registros de asistencia.
 * Detecta si algún registro fue alterado después de su creación.
 * 
 * Query: start_date, end_date, limit (default 1000)
 * 
 * POST /api/attendance/verify-integrity
 * Activa las protecciones de integridad en la base de datos (triggers).
 * Solo debe ejecutarse una vez o al migrar.
 * 
 * Resolución 38 Exenta — Artículo sobre inalterabilidad de registros.
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  // GET: Verificar integridad
  if (req.method === 'GET') {
    try {
      const { start_date, end_date, limit } = req.query;

      const result = await verifyChainIntegrity(tenant.id, {
        startDate: start_date || null,
        endDate: end_date || null,
        limit: limit ? parseInt(limit) : 1000,
      });

      return res.status(200).json({
        ...result,
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        verified_at: new Date().toISOString(),
        message: result.integrity_ok
          ? 'Todos los registros verificados — integridad OK'
          : `Se detectaron ${result.corrupted_records.length} registro(s) con integridad comprometida`,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST: Activar protecciones (migración)
  if (req.method === 'POST') {
    try {
      await ensureIntegrityColumns();
      const result = await createProtectionRules();
      return res.status(200).json(result);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
