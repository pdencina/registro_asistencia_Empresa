const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { put } = require('@vercel/blob');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  // Identificar tenant — OBLIGATORIO
  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    if (req.method === 'GET') {
      const { search, active } = req.query;

      let query = 'SELECT * FROM employees WHERE tenant_id = $1';
      const params = [tenant.id];
      let paramIndex = 2;

      if (search) {
        query += ` AND (first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex + 1} OR rut ILIKE $${paramIndex + 2})`;
        const term = `%${search}%`;
        params.push(term, term, term);
        paramIndex += 3;
      }
      if (active !== null && active !== undefined && active !== '') {
        query += ` AND active = $${paramIndex}`;
        params.push(active === '1' || active === 'true');
        paramIndex++;
      }

      query += ' ORDER BY last_name, first_name';
      const rows = await sql(query, params);

      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { rut, first_name, last_name, department, position, photo, email, phone } = req.body;

      if (!rut || !first_name || !last_name) {
        return res.status(400).json({ error: 'RUT, nombre y apellido son obligatorios' });
      }

      // Asegurar columnas de consentimiento existen
      await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS consent_status VARCHAR(20) DEFAULT \'pending\'');
      await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS consent_token VARCHAR(100)');
      await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ');
      await sql('ALTER TABLE employees ADD COLUMN IF NOT EXISTS consent_ip VARCHAR(50)');

      // Verificar límite del plan
      const [countRow] = await sql('SELECT COUNT(*) as count FROM employees WHERE tenant_id = $1 AND active = true', [tenant.id]);
      if (Number(countRow.count) >= tenant.max_employees) {
        return res.status(403).json({ error: `Límite de ${tenant.max_employees} colaboradores alcanzado. Actualiza tu plan.` });
      }

      // RUT único dentro del tenant
      const existing = await sql('SELECT id FROM employees WHERE rut = $1 AND tenant_id = $2', [rut, tenant.id]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Ya existe un empleado con ese RUT en tu empresa' });
      }

      let photo_url = null;
      if (photo) {
        const buffer = base64ToBuffer(photo);
        const blob = await put(`employees/${tenant.slug}/${crypto.randomUUID()}.jpg`, buffer, {
          access: 'public',
          contentType: 'image/jpeg'
        });
        photo_url = blob.url;
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const consentToken = crypto.randomUUID().replace(/-/g, '').slice(0, 24);

      await sql(`
        INSERT INTO employees (id, tenant_id, rut, first_name, last_name, department, position, email, phone, photo_url, active, consent_status, consent_token, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, 'pending', $11, $12, $13)`,
        [id, tenant.id, rut, first_name, last_name, department || null, position || null, email || null, phone || null, photo_url, consentToken, now, now]
      );

      // Enviar email de consentimiento al colaborador si tiene email
      if (email) {
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        if (RESEND_API_KEY) {
          const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || process.env.NOTIFICATION_FROM_EMAIL || 'notificaciones@flexio.cl';
          const consentUrl = `https://flexio.cl/consentimiento/${consentToken}`;

          const emailHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <tr><td style="background:#2563eb;padding:30px;text-align:center;">
          <h1 style="color:#ffffff;font-size:22px;margin:0;">Autorización de Registro Biométrico</h1>
          <p style="color:#bfdbfe;font-size:14px;margin:8px 0 0 0;">Flexio · ${tenant.name}</p>
        </td></tr>
        <tr><td style="padding:35px;">
          <p style="font-size:16px;color:#374151;margin:0 0 20px 0;">
            Hola <strong>${first_name} ${last_name}</strong>,
          </p>
          <p style="font-size:14px;color:#6b7280;margin:0 0 16px 0;">
            La empresa <strong>${tenant.name}</strong> te ha registrado en su sistema de control de asistencia con reconocimiento facial <strong>Flexio</strong>.
          </p>
          <p style="font-size:14px;color:#6b7280;margin:0 0 24px 0;">
            Para completar tu registro, necesitamos que verifiques tu identidad y autorices el uso de tu dato biométrico facial. Este proceso es requerido por la Ley N° 21.719 de Protección de Datos Personales.
          </p>

          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:20px 0;">
            <p style="font-size:13px;color:#166534;margin:0 0 8px 0;font-weight:600;">¿Qué implica?</p>
            <ul style="font-size:13px;color:#14532d;margin:0;padding-left:20px;line-height:1.8;">
              <li>Se usará tu rostro para registrar entrada y salida</li>
              <li>Los datos se almacenan encriptados (AES-256)</li>
              <li>Solo se usan para control de asistencia</li>
              <li>Puedes revocar el consentimiento en cualquier momento</li>
              <li>Si no autorizas, podrás marcar con PIN alternativo</li>
            </ul>
          </div>

          <div style="text-align:center;margin:28px 0;">
            <a href="${consentUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Verificar y Autorizar</a>
          </div>

          <p style="font-size:12px;color:#9ca3af;margin:20px 0 0 0;text-align:center;">
            Si no reconoces esta solicitud, simplemente ignora este correo.
          </p>
        </td></tr>
        <tr><td style="padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Flexio · Control de Asistencia con Reconocimiento Facial</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: `Flexio <${FROM_EMAIL}>`,
              to: [email],
              subject: `Autorización de registro biométrico — ${tenant.name}`,
              html: emailHtml,
            }),
          }).catch(err => console.error('Error enviando email consentimiento:', err));
        }
      }

      const [employee] = await sql('SELECT * FROM employees WHERE id = $1 AND tenant_id = $2', [id, tenant.id]);
      return res.status(201).json(employee);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

function base64ToBuffer(base64) {
  const data = base64.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(data, 'base64');
}
