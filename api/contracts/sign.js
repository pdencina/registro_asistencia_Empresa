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

    // Verificar que no tenga ya un contrato firmado por el cliente
    const [existingContract] = await sql(
      'SELECT id, estado FROM contracts WHERE tenant_id = $1 AND estado IN ($2, $3)',
      [tenant.id, 'firmado_cliente', 'firmado']
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

    // Insertar o actualizar contrato — estado 'firmado' directamente
    // (la firma del prestador está pre-insertada en el contrato)
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

    // Enviar email de confirmación al firmante (async, no bloquea respuesta)
    if (firmante_email) {
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (RESEND_API_KEY) {
        const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.NOTIFICATION_FROM_EMAIL || 'notificaciones@flexio.cl';
        const planNombres = { basico: 'Básico', profesional: 'Profesional', enterprise: 'Enterprise' };
        const planNombre = planNombres[plan || tenant.plan] || plan || tenant.plan;
        const precioFormatted = precio ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(precio) : '';
        const fechaFirma = new Date(timestamp).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const emailHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <tr><td style="background:#059669;padding:30px;text-align:center;">
          <h1 style="color:#ffffff;font-size:22px;margin:0;">Contrato Firmado Exitosamente</h1>
          <p style="color:#d1fae5;font-size:14px;margin:8px 0 0 0;">Flexio · Control de Asistencia</p>
        </td></tr>
        <tr><td style="padding:35px;">
          <p style="font-size:16px;color:#374151;margin:0 0 20px 0;">
            Hola <strong>${firmante_nombre}</strong>,
          </p>
          <p style="font-size:14px;color:#6b7280;margin:0 0 24px 0;">
            Confirmamos que el contrato de prestación de servicios entre <strong>${tenant.name}</strong> y <strong>Flexio</strong> ha sido firmado digitalmente.
          </p>

          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:20px 0;">
            <p style="font-size:12px;color:#64748b;margin:0 0 12px 0;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Resumen del contrato</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:5px 0;font-size:13px;color:#64748b;width:130px;">Empresa:</td><td style="padding:5px 0;font-size:13px;color:#0f172a;font-weight:600;">${tenant.name}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#64748b;">Plan:</td><td style="padding:5px 0;font-size:13px;color:#0f172a;font-weight:600;">${planNombre}</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#64748b;">Modalidad:</td><td style="padding:5px 0;font-size:13px;color:#0f172a;font-weight:600;">${(modalidad || 'mensual').charAt(0).toUpperCase() + (modalidad || 'mensual').slice(1)}</td></tr>
              ${precioFormatted ? `<tr><td style="padding:5px 0;font-size:13px;color:#64748b;">Precio:</td><td style="padding:5px 0;font-size:13px;color:#0f172a;font-weight:600;">${precioFormatted} ${modalidad === 'anual' ? '/año' : '/mes'}</td></tr>` : ''}
              <tr><td style="padding:5px 0;font-size:13px;color:#64748b;">Firmante:</td><td style="padding:5px 0;font-size:13px;color:#0f172a;font-weight:600;">${firmante_nombre} (${firmante_rut})</td></tr>
              <tr><td style="padding:5px 0;font-size:13px;color:#64748b;">Fecha firma:</td><td style="padding:5px 0;font-size:13px;color:#0f172a;font-weight:600;">${fechaFirma}</td></tr>
            </table>
          </div>

          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:20px 0;">
            <p style="font-size:12px;color:#166534;margin:0 0 8px 0;font-weight:600;">Evidencia de auditoría</p>
            <p style="font-size:11px;color:#14532d;margin:0;font-family:monospace;word-break:break-all;">
              Hash firma: ${firmaHash.substring(0, 32)}...<br>
              Timestamp: ${timestamp}
            </p>
          </div>

          <p style="font-size:13px;color:#6b7280;margin:24px 0 0 0;">
            Puedes ver tu contrato firmado en cualquier momento desde:
          </p>
          <div style="text-align:center;margin:20px 0;">
            <a href="https://flexio.cl/contrato/${tenant.slug}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Ver mi contrato</a>
          </div>
        </td></tr>
        <tr><td style="padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Flexio · Control de Asistencia con Reconocimiento Facial</p>
          <p style="font-size:11px;color:#d1d5db;margin:5px 0 0 0;">Este correo es una confirmación automática. No responder.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `Flexio <${FROM_EMAIL}>`,
            to: [firmante_email],
            subject: `Contrato firmado — ${tenant.name} · Flexio`,
            html: emailHtml,
          }),
        }).then(async (r) => {
          if (!r.ok) {
            const errBody = await r.text();
            console.error('Resend error:', r.status, errBody);
          }
        }).catch(err => console.error('Error enviando email de contrato:', err));
      }
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
