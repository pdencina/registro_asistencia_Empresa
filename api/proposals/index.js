const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');

/**
 * /api/proposals
 * 
 * GET ?ref=xxx — Public: get proposal by reference code (for client view)
 * GET (with x-tenant-slug or superadmin) — List all proposals (admin)
 * POST — Create proposal (superadmin)
 * PUT — Update proposal (superadmin)
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const sql = getDb();

  // Ensure table exists
  await sql(`
    CREATE TABLE IF NOT EXISTS proposals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reference VARCHAR(30) UNIQUE NOT NULL,
      status VARCHAR(20) DEFAULT 'draft',
      
      -- Client info
      company_name VARCHAR(200) NOT NULL,
      company_rut VARCHAR(20),
      contact_name VARCHAR(200),
      contact_email VARCHAR(200),
      contact_phone VARCHAR(50),
      
      -- Pricing
      num_employees INTEGER NOT NULL DEFAULT 10,
      price_per_user INTEGER NOT NULL DEFAULT 1490,
      minimum_monthly INTEGER NOT NULL DEFAULT 29900,
      discount_percent INTEGER DEFAULT 0,
      annual_discount_percent INTEGER DEFAULT 20,
      setup_fee INTEGER DEFAULT 0,
      
      -- Terms
      trial_days INTEGER DEFAULT 15,
      min_contract_months INTEGER DEFAULT 0,
      cancellation_days INTEGER DEFAULT 15,
      notes TEXT,
      valid_until DATE,
      
      -- Metadata
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      accepted_at TIMESTAMP,
      accepted_ip VARCHAR(50)
    )
  `);

  // GET: Public fetch by reference OR admin list
  if (req.method === 'GET') {
    const { ref } = req.query;

    // Public: get single proposal by reference
    if (ref) {
      const rows = await sql('SELECT * FROM proposals WHERE reference = $1', [ref]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Propuesta no encontrada' });
      }
      const p = rows[0];
      return res.status(200).json(formatProposal(p));
    }

    // Admin: list all (requires superadmin secret)
    const secret = req.headers['x-admin-secret'];
    if (secret !== process.env.GLOBAL_ADMIN_SECRET) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const proposals = await sql('SELECT * FROM proposals ORDER BY created_at DESC');
    return res.status(200).json(proposals.map(formatProposal));
  }

  // POST: Create proposal (superadmin)
  if (req.method === 'POST') {
    const secret = req.headers['x-admin-secret'];
    if (secret !== process.env.GLOBAL_ADMIN_SECRET) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const {
      company_name, company_rut, contact_name, contact_email, contact_phone,
      num_employees, price_per_user, minimum_monthly, discount_percent,
      annual_discount_percent, setup_fee, trial_days, min_contract_months,
      cancellation_days, notes, valid_until
    } = req.body;

    if (!company_name || !num_employees) {
      return res.status(400).json({ error: 'company_name y num_employees son requeridos' });
    }

    // Generate unique reference: YYYYMMDD-HHMMSS
    const now = new Date();
    const reference = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}`;

    const rows = await sql(`
      INSERT INTO proposals (reference, company_name, company_rut, contact_name, contact_email, contact_phone,
        num_employees, price_per_user, minimum_monthly, discount_percent, annual_discount_percent,
        setup_fee, trial_days, min_contract_months, cancellation_days, notes, valid_until, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'sent')
      RETURNING *
    `, [
      reference, company_name, company_rut || null, contact_name || null,
      contact_email || null, contact_phone || null,
      num_employees, price_per_user || 1490, minimum_monthly || 29900,
      discount_percent || 0, annual_discount_percent || 20, setup_fee || 0,
      trial_days || 15, min_contract_months || 0, cancellation_days || 15,
      notes || null, valid_until || null
    ]);

    return res.status(201).json(formatProposal(rows[0]));
  }

  // PUT: Update proposal (superadmin)
  if (req.method === 'PUT') {
    const secret = req.headers['x-admin-secret'];
    if (secret !== process.env.GLOBAL_ADMIN_SECRET) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { id, ...updates } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    // Accept action from client
    if (updates.action === 'accept') {
      const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'desconocida';
      await sql(
        `UPDATE proposals SET status = 'accepted', accepted_at = NOW(), accepted_ip = $1, updated_at = NOW() WHERE id = $2`,
        [typeof ip === 'string' ? ip.split(',')[0].trim() : 'desconocida', id]
      );
      const rows = await sql('SELECT * FROM proposals WHERE id = $1', [id]);
      return res.status(200).json(formatProposal(rows[0]));
    }

    // Build update fields
    const allowedFields = [
      'company_name', 'company_rut', 'contact_name', 'contact_email', 'contact_phone',
      'num_employees', 'price_per_user', 'minimum_monthly', 'discount_percent',
      'annual_discount_percent', 'setup_fee', 'trial_days', 'min_contract_months',
      'cancellation_days', 'notes', 'valid_until', 'status'
    ];

    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${idx}`);
        values.push(updates[field]);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    await sql(
      `UPDATE proposals SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      values
    );

    const rows = await sql('SELECT * FROM proposals WHERE id = $1', [id]);
    return res.status(200).json(formatProposal(rows[0]));
  }

  // DELETE
  if (req.method === 'DELETE') {
    const secret = req.headers['x-admin-secret'];
    if (secret !== process.env.GLOBAL_ADMIN_SECRET) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });
    await sql('DELETE FROM proposals WHERE id = $1', [id]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

function formatProposal(p) {
  if (!p) return null;

  // Calculate pricing
  const rawMonthly = p.num_employees * p.price_per_user;
  const monthlyNet = Math.max(rawMonthly, p.minimum_monthly);
  const discountedMonthly = p.discount_percent > 0
    ? Math.round(monthlyNet * (1 - p.discount_percent / 100))
    : monthlyNet;
  const monthlyIva = Math.round(discountedMonthly * 1.19);
  const annualNet = Math.round(discountedMonthly * 12 * (1 - (p.annual_discount_percent || 0) / 100));
  const annualIva = Math.round(annualNet * 1.19);
  const perEmployee = Math.round(discountedMonthly / Math.max(p.num_employees, 1));

  return {
    ...p,
    // Calculated fields
    calculated: {
      raw_monthly: rawMonthly,
      monthly_net: discountedMonthly,
      monthly_iva: monthlyIva,
      annual_net: annualNet,
      annual_iva: annualIva,
      per_employee: perEmployee,
      minimum_applied: rawMonthly < p.minimum_monthly,
    },
  };
}
