const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const crypto = require('crypto');

/**
 * POST /api/contracts/sign-prestador
 * Firma del prestador (super admin) sobre un contrato ya firmado por el cliente.
 * Body: { contract_id, firma_data }
 * Header: Authorization Bearer (super admin token)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verificar super admin
  const GLOBAL_SECRET = process.env.GLOBAL_ADMIN_SECRET;
  if (!GLOBAL_SECRET) {
    return res.status(500).json({ error: 'Configuración de admin no disponible' });
  }

  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  let isAdmin = false;
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    isAdmin = decoded.startsWith(GLOBAL_SECRET + ':');
  } catch {}

  if (!isAdmin) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const sql = getDb();

  try {
    const { contract_id, firma_data } = req.body;

    if (!contract_id || !firma_data) {
      return res.status(400).json({ error: 'contract_id y firma_data son obligatorios' });
    }

    // Buscar contrato
    const [contract] = await sql('SELECT * FROM contracts WHERE id = $1', [contract_id]);
    if (!contract) {
      return res.status(404).json({ error: 'Contrato no encontrado' });
    }

    if (contract.estado === 'firmado') {
      return res.status(409).json({ error: 'Este contrato ya fue firmado por ambas partes' });
    }

    if (contract.estado !== 'firmado_cliente') {
      return res.status(400).json({ error: 'El cliente aún no ha firmado este contrato' });
    }

    // Generar hash y auditoría
    const firmaHash = crypto.createHash('sha256').update(firma_data).digest('hex');
    const timestamp = new Date().toISOString();
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'desconocida';
    const userAgent = req.headers['user-agent'] || 'desconocido';

    const auditoria = {
      firmante: {
        nombre: 'Pablo David Encina Acevedo',
        rut: '17.339.278-8',
        rol: 'prestador',
      },
      timestamp,
      ip: typeof ip === 'string' ? ip.split(',')[0].trim() : 'desconocida',
      user_agent: userAgent,
      firma_hash: firmaHash,
      metodo: 'firma_electronica_simple',
    };

    // Asegurar columnas existen
    await sql('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS prestador_firma TEXT');
    await sql('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS prestador_firmado_at TIMESTAMPTZ');
    await sql('ALTER TABLE contracts ADD COLUMN IF NOT EXISTS prestador_auditoria JSONB');

    // Actualizar contrato con firma del prestador
    await sql(`
      UPDATE contracts SET
        prestador_firma = $1,
        prestador_firmado_at = $2,
        prestador_auditoria = $3,
        estado = 'firmado',
        updated_at = NOW()
      WHERE id = $4
    `, [firma_data, timestamp, JSON.stringify(auditoria), contract_id]);

    return res.status(200).json({
      ok: true,
      message: 'Contrato firmado por el prestador. Ambas partes han firmado.',
      evidencia: { timestamp, firma_hash: firmaHash },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
