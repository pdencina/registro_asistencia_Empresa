const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { getTenant } = require('../lib/tenant');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDb();

  try {
    const {
      tenant_slug,
      firmante_nombre,
      firmante_rut,
      firmante_email,
      firma_data,
      consentimiento,
      plan,
      modalidad,
      precio,
      documento_hash,
    } = req.body;

    // Validaciones
    if (!tenant_slug || !firma_data || !firmante_nombre || !firmante_rut) {
      return res.status(400).json({ error: 'Faltan datos obligatorios: nombre, RUT y firma' });
    }

    if (!consentimiento) {
      return res.status(400).json({ error: 'Debe aceptar el consentimiento para firmar' });
    }

    // Buscar tenant por slug
    const [tenant] = await sql('SELECT * FROM tenants WHERE slug = $1 AND active = true', [tenant_slug]);
    if (!tenant) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    // Verificar que no tenga ya un contrato firmado
    const [existingContract] = await sql(
      'SELECT id FROM contracts WHERE tenant_id = $1 AND estado = $2',
      [tenant.id, 'firmado']
    );
    if (existingContract) {
      return res.status(409).json({ error: 'Ya existe un contrato firmado para esta empresa' });
    }

    // Generar hashes de integridad
    const firmaHash = crypto.createHash('sha256').update(firma_data).digest('hex');
    const timestamp = new Date().toISOString();

    // Datos de auditoría
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'desconocida';
    const userAgent = req.headers['user-agent'] || 'desconocido';

    const auditoria = {
      firmante: {
        nombre: firmante_nombre,
        rut: firmante_rut,
        email: firmante_email || null,
      },
      timestamp,
      ip: typeof ip === 'string' ? ip.split(',')[0].trim() : 'desconocida',
      user_agent: userAgent,
      documento_hash: documento_hash || null,
      firma_hash: firmaHash,
      consentimiento_aceptado: true,
      metodo: 'firma_electronica_simple',
    };

    // Insertar o actualizar contrato
    const [existing] = await sql(
      'SELECT id FROM contracts WHERE tenant_id = $1 AND estado = $2',
      [tenant.id, 'pendiente']
    );

    const contractId = existing ? existing.id : crypto.randomUUID();

    if (existing) {
      await sql(`
        UPDATE contracts SET
          plan = $1, modalidad = $2, precio = $3,
          firmante_nombre = $4, firmante_rut = $5, firmante_email = $6,
          firma_digital = $7, firmado_at = $8, auditoria_firma = $9,
          estado = 'firmado', updated_at = NOW()
        WHERE id = $10
      `, [
        plan || tenant.plan,
        modalidad || 'mensual',
        precio || null,
        firmante_nombre,
        firmante_rut,
        firmante_email || null,
        firma_data,
        timestamp,
        JSON.stringify(auditoria),
        existing.id,
      ]);
    } else {
      await sql(`
        INSERT INTO contracts (id, tenant_id, plan, modalidad, precio, firmante_nombre, firmante_rut, firmante_email, firma_digital, firmado_at, auditoria_firma, estado)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'firmado')
      `, [
        contractId,
        tenant.id,
        plan || tenant.plan,
        modalidad || 'mensual',
        precio || null,
        firmante_nombre,
        firmante_rut,
        firmante_email || null,
        firma_data,
        timestamp,
        JSON.stringify(auditoria),
      ]);
    }

    return res.status(200).json({
      ok: true,
      contract_id: contractId,
      evidencia: {
        timestamp,
        firma_hash: firmaHash,
        documento_hash: documento_hash || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
