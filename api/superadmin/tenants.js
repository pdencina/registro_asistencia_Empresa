const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

/**
 * Verifica que el request venga del super admin.
 */
function verifySuperAdmin(req) {
  const GLOBAL_SECRET = process.env.GLOBAL_ADMIN_SECRET;
  if (!GLOBAL_SECRET) return false;

  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '');
  if (!token) return false;

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    return decoded.startsWith(GLOBAL_SECRET + ':');
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (!verifySuperAdmin(req)) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const sql = getDb();

  // GET - Listar tenants con stats
  if (req.method === 'GET') {
    try {
      const tenants = await sql(`
        SELECT t.*,
               (SELECT COUNT(*) FROM employees e WHERE e.tenant_id = t.id) as employee_count,
               s.status as subscription_status,
               c.estado as contract_status,
               c.firmado_at as contract_firmado_at,
               c.firmante_nombre as contract_firmante
        FROM tenants t
        LEFT JOIN subscriptions s ON s.tenant_id = t.id
        LEFT JOIN contracts c ON c.tenant_id = t.id AND c.estado = 'firmado'
        ORDER BY t.created_at DESC
      `);

      const [statsRow] = await sql(`
        SELECT 
          (SELECT COUNT(*) FROM tenants) as total_tenants,
          (SELECT COUNT(*) FROM tenants WHERE active = true) as active_tenants,
          (SELECT COUNT(*) FROM employees) as total_employees
      `);

      return res.status(200).json({
        tenants,
        stats: statsRow || { total_tenants: 0, active_tenants: 0, total_employees: 0 },
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // POST - Crear tenant
  if (req.method === 'POST') {
    try {
      const { name, slug, rut_empresa, admin_email, admin_pin, plan } = req.body;

      if (!name || !slug || !admin_email || !admin_pin) {
        return res.status(400).json({ error: 'name, slug, admin_email y admin_pin son obligatorios' });
      }

      if (!/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({ error: 'Slug solo puede tener letras minúsculas, números y guiones' });
      }

      // Verificar slug único
      const existing = await sql('SELECT id FROM tenants WHERE slug = $1', [slug]);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Ese identificador ya está en uso' });
      }

      // Generar contraseña temporal para el admin
      const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4);

      // Límites por plan
      const planLimits = {
        basico: { max_employees: 30, max_devices: 1 },
        profesional: { max_employees: 100, max_devices: 3 },
        enterprise: { max_employees: 300, max_devices: 10 },
      };
      const selectedPlan = plan || 'basico';
      const limits = planLimits[selectedPlan] || planLimits.basico;

      // Trial 15 días
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 15);

      // Asegurar columna admin_password
      await sql('ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_password VARCHAR(200)');

      const rows = await sql(`
        INSERT INTO tenants (name, slug, rut_empresa, plan, max_employees, max_devices, admin_email, admin_pin_hash, admin_password, trial_ends_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [name, slug, rut_empresa || null, selectedPlan, limits.max_employees, limits.max_devices, admin_email, admin_pin, tempPassword, trialEnds.toISOString()]);

      // Crear settings por defecto
      await sql('INSERT INTO tenant_settings (tenant_id) VALUES ($1)', [rows[0].id]);

      // Crear subscription
      await sql(`
        INSERT INTO subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
        VALUES ($1, $2, 'trial', NOW(), $3)
      `, [rows[0].id, selectedPlan, trialEnds.toISOString()]);

      // Enviar email de bienvenida con credenciales
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      if (RESEND_API_KEY) {
        const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';
        const welcomeHtml = buildWelcomeEmail({
          tenantName: name,
          slug,
          adminEmail: admin_email,
          tempPassword,
          devicePin: admin_pin,
          plan: selectedPlan,
          trialDays: 15,
        });

        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `Flexio <${FROM_EMAIL}>`,
              to: [admin_email],
              subject: `Bienvenido a Flexio — Tus datos de acceso`,
              html: welcomeHtml,
            }),
          });
        } catch (emailErr) {
          console.error('Error enviando email de bienvenida:', emailErr);
        }
      }

      return res.status(201).json({
        tenant: rows[0],
        temp_password: tempPassword,
        message: `Empresa creada. URL: flexio.cl/app/${slug}`,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // PUT - Actualizar tenant (activar/pausar, cambiar plan, logo)
  if (req.method === 'PUT') {
    try {
      const { id, active, plan, max_employees, max_devices, logo_url } = req.body;

      if (!id) return res.status(400).json({ error: 'id es obligatorio' });

      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (active !== undefined) {
        updates.push(`active = $${paramIndex++}`);
        values.push(active);
      }
      if (plan) {
        updates.push(`plan = $${paramIndex++}`);
        values.push(plan);
      }
      if (max_employees) {
        updates.push(`max_employees = $${paramIndex++}`);
        values.push(max_employees);
      }
      if (max_devices) {
        updates.push(`max_devices = $${paramIndex++}`);
        values.push(max_devices);
      }
      if (logo_url !== undefined) {
        updates.push(`logo_url = $${paramIndex++}`);
        values.push(logo_url || null);
      }

      updates.push(`updated_at = NOW()`);
      values.push(id);

      await sql(`UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

      return res.status(200).json({ message: 'Empresa actualizada' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // DELETE - Eliminar tenant y todos sus datos
  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id es obligatorio' });

      // Eliminar en orden por foreign keys
      try { await sql('DELETE FROM attendance_records WHERE tenant_id = $1', [id]); } catch(e) {}
      try { await sql('DELETE FROM authorized_devices WHERE tenant_id = $1', [id]); } catch(e) {}
      try { await sql('DELETE FROM employee_schedules WHERE tenant_id = $1', [id]); } catch(e) {}
      try { await sql('DELETE FROM employees WHERE tenant_id = $1', [id]); } catch(e) {}
      try { await sql('DELETE FROM tenant_settings WHERE tenant_id = $1', [id]); } catch(e) {}
      try { await sql('DELETE FROM subscriptions WHERE tenant_id = $1', [id]); } catch(e) {}
      await sql('DELETE FROM tenants WHERE id = $1', [id]);

      return res.status(200).json({ message: 'Empresa eliminada permanentemente' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
};

function buildWelcomeEmail({ tenantName, slug, adminEmail, tempPassword, devicePin, plan, trialDays }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
          <tr>
            <td style="background:#2563eb;padding:35px;text-align:center;">
              <h1 style="color:#ffffff;font-size:24px;margin:0;">Bienvenido a Flexio</h1>
              <p style="color:#bfdbfe;font-size:14px;margin:8px 0 0 0;">Tu sistema de control de asistencia está listo</p>
            </td>
          </tr>
          <tr>
            <td style="padding:35px;">
              <p style="font-size:16px;color:#374151;margin:0 0 20px 0;">
                Hola, la cuenta de <strong>${tenantName}</strong> ha sido creada exitosamente en Flexio.
              </p>

              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin:20px 0;">
                <p style="font-size:13px;color:#64748b;margin:0 0 12px 0;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Datos de acceso al panel</p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#64748b;width:120px;">URL Panel:</td>
                    <td style="padding:6px 0;font-size:14px;color:#1e40af;font-weight:600;">
                      <a href="https://flexio.cl/admin/${slug}" style="color:#1e40af;text-decoration:none;">flexio.cl/admin/${slug}</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#64748b;">Email:</td>
                    <td style="padding:6px 0;font-size:14px;color:#0f172a;font-weight:600;">${adminEmail}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:14px;color:#64748b;">Contraseña:</td>
                    <td style="padding:6px 0;font-size:16px;color:#0f172a;font-weight:700;font-family:monospace;letter-spacing:1px;">${tempPassword}</td>
                  </tr>
                </table>
              </div>

              <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px;margin:20px 0;">
                <p style="font-size:13px;color:#92400e;margin:0 0 8px 0;font-weight:600;">PIN para activar dispositivos</p>
                <p style="font-size:13px;color:#78350f;margin:0;">
                  Para activar el dispositivo de marcaje (tablet/celular), usa el PIN: <strong style="font-size:18px;letter-spacing:3px;">${devicePin}</strong>
                </p>
              </div>

              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:20px 0;">
                <p style="font-size:13px;color:#166534;margin:0 0 8px 0;font-weight:600;">URL del kiosko de registro</p>
                <p style="font-size:13px;color:#14532d;margin:0;">
                  Tus colaboradores marcan asistencia en:<br>
                  <a href="https://flexio.cl/app/${slug}" style="color:#166534;font-weight:600;font-size:15px;">flexio.cl/app/${slug}</a>
                </p>
              </div>

              <p style="font-size:13px;color:#6b7280;margin:25px 0 0 0;">
                Tu plan <strong>${plan}</strong> incluye ${trialDays} días de prueba gratis. Te recomendamos cambiar tu contraseña en el primer ingreso.
              </p>

              <div style="text-align:center;margin:30px 0 0 0;">
                <a href="https://flexio.cl/admin/${slug}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Acceder a mi panel</a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="font-size:12px;color:#9ca3af;margin:0;">Flexio · Control de Asistencia con Reconocimiento Facial</p>
              <p style="font-size:11px;color:#d1d5db;margin:5px 0 0 0;">flexio.cl · +56 9 4961 6038</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
