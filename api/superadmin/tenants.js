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
               s.status as subscription_status
        FROM tenants t
        LEFT JOIN subscriptions s ON s.tenant_id = t.id
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
        return res.status(409).json({ error: 'Ese subdominio ya está en uso' });
      }

      // Límites por plan
      const planLimits = {
        basico: { max_employees: 30, max_devices: 1 },
        profesional: { max_employees: 100, max_devices: 3 },
        enterprise: { max_employees: 9999, max_devices: 999 },
      };
      const selectedPlan = plan || 'basico';
      const limits = planLimits[selectedPlan] || planLimits.basico;

      // Trial 30 días
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 30);

      const rows = await sql(`
        INSERT INTO tenants (name, slug, rut_empresa, plan, max_employees, max_devices, admin_email, admin_pin_hash, trial_ends_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [name, slug, rut_empresa || null, selectedPlan, limits.max_employees, limits.max_devices, admin_email, admin_pin, trialEnds.toISOString()]);

      // Crear settings por defecto
      await sql('INSERT INTO tenant_settings (tenant_id) VALUES ($1)', [rows[0].id]);

      // Crear subscription
      await sql(`
        INSERT INTO subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
        VALUES ($1, $2, 'trial', NOW(), $3)
      `, [rows[0].id, selectedPlan, trialEnds.toISOString()]);

      return res.status(201).json({
        tenant: rows[0],
        message: `Empresa creada. URL: ${slug}.flexio.cl`,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // PUT - Actualizar tenant (activar/pausar, cambiar plan)
  if (req.method === 'PUT') {
    try {
      const { id, active, plan, max_employees, max_devices } = req.body;

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

      updates.push(`updated_at = NOW()`);
      values.push(id);

      await sql(`UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIndex}`, values);

      return res.status(200).json({ message: 'Empresa actualizada' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
};
