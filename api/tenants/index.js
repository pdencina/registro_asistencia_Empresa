const { getDb } = require('../lib/db');

module.exports = async function handler(req, res) {
  const sql = getDb();

  // POST - Crear nuevo tenant (signup)
  if (req.method === 'POST') {
    try {
      const { name, slug, rut_empresa, admin_email, plan } = req.body;

      if (!name || !slug || !admin_email) {
        return res.status(400).json({
          error: 'name, slug y admin_email son obligatorios'
        });
      }

      // Validar slug único
      const existing = await sql(
        'SELECT id FROM tenants WHERE slug = $1', [slug]
      );
      if (existing.length > 0) {
        return res.status(409).json({ error: 'Ese subdominio ya está en uso' });
      }

      // Validar formato slug
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return res.status(400).json({
          error: 'El slug solo puede contener letras minúsculas, números y guiones'
        });
      }

      // Determinar límites del plan
      const planLimits = {
        basico: { max_employees: 30, max_devices: 1 },
        profesional: { max_employees: 100, max_devices: 3 },
        enterprise: { max_employees: 9999, max_devices: 999 },
      };
      const selectedPlan = plan || 'basico';
      const limits = planLimits[selectedPlan] || planLimits.basico;

      // Trial: 15 días
      const trialEnds = new Date();
      trialEnds.setDate(trialEnds.getDate() + 15);

      const rows = await sql(`
        INSERT INTO tenants (name, slug, rut_empresa, plan, max_employees, max_devices, admin_email, trial_ends_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [name, slug, rut_empresa || null, selectedPlan, limits.max_employees, limits.max_devices, admin_email, trialEnds.toISOString()]);

      // Crear settings por defecto
      await sql(`
        INSERT INTO tenant_settings (tenant_id) VALUES ($1)
      `, [rows[0].id]);

      // Crear subscription
      await sql(`
        INSERT INTO subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
        VALUES ($1, $2, 'trial', NOW(), $3)
      `, [rows[0].id, selectedPlan, trialEnds.toISOString()]);

      return res.status(201).json({
        tenant: rows[0],
        message: `Cuenta creada. Accede en: ${slug}.flexio.cl`,
        trial_days: 15,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // GET - Listar tenants (solo admin global)
  if (req.method === 'GET') {
    try {
      const rows = await sql(`
        SELECT t.*, s.status as subscription_status,
               (SELECT COUNT(*) FROM employees e WHERE e.tenant_id = t.id) as employee_count
        FROM tenants t
        LEFT JOIN subscriptions s ON s.tenant_id = t.id
        ORDER BY t.created_at DESC
      `);
      return res.status(200).json(rows);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Método no permitido' });
};
