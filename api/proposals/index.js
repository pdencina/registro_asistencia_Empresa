const { getDb } = require('../lib/db');
const { handleCors } = require('../lib/cors');

/**
 * Verify superadmin token (same as tenants.js)
 */
function verifySuperAdmin(req) {
  const GLOBAL_SECRET = process.env.GLOBAL_ADMIN_SECRET;
  if (!GLOBAL_SECRET) return false;

  // Try Authorization header (Bearer token) — check both cases
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const bearerToken = auth.replace('Bearer ', '').replace('bearer ', '');
  if (bearerToken) {
    // Direct secret match
    if (bearerToken === GLOBAL_SECRET) return true;
    try {
      const decoded = Buffer.from(bearerToken, 'base64').toString('utf8');
      if (decoded.startsWith(GLOBAL_SECRET + ':')) return true;
    } catch {}
  }

  // Try x-admin-secret header (direct or base64)
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret) {
    if (adminSecret === GLOBAL_SECRET) return true;
    try {
      const decoded = Buffer.from(adminSecret, 'base64').toString('utf8');
      if (decoded.startsWith(GLOBAL_SECRET + ':')) return true;
    } catch {}
  }

  return false;
}

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

    // Admin: list all (requires superadmin)
    if (!verifySuperAdmin(req)) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const proposals = await sql('SELECT * FROM proposals ORDER BY created_at DESC');
    return res.status(200).json(proposals.map(formatProposal));
  }

  // POST: Create proposal (superadmin)
  if (req.method === 'POST') {
    if (!verifySuperAdmin(req)) {
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

  // PUT: Update proposal (superadmin) or accept (client)
  if (req.method === 'PUT') {
    const { id, ...updates } = req.body;
    if (!id) return res.status(400).json({ error: 'ID requerido' });

    // Accept action from client (no auth required — it's a public action)
    if (updates.action === 'accept') {
      const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'desconocida';
      const cleanIp = typeof ip === 'string' ? ip.split(',')[0].trim() : 'desconocida';

      await sql(
        `UPDATE proposals SET status = 'accepted', accepted_at = NOW(), accepted_ip = $1, updated_at = NOW() WHERE id = $2`,
        [cleanIp, id]
      );

      const rows = await sql('SELECT * FROM proposals WHERE id = $1', [id]);
      const proposal = rows[0];

      // Send notification email to Pablo
      if (proposal) {
        sendAcceptanceNotification(proposal, cleanIp).catch(err => console.error('Email error:', err));
      }

      return res.status(200).json(formatProposal(proposal));
    }

    // All other updates require superadmin
    if (!verifySuperAdmin(req)) {
      return res.status(401).json({ error: 'No autorizado' });
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
    if (!verifySuperAdmin(req)) {
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

async function sendAcceptanceNotification(proposal, ip) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) return;

  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@flexio.cl';
  const OWNER_EMAIL = 'pablo@flexio.cl';

  const rawMonthly = proposal.num_employees * proposal.price_per_user;
  const monthlyNet = Math.max(rawMonthly, proposal.minimum_monthly);
  const monthlyIva = Math.round(monthlyNet * 1.19);
  const fechaStr = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  // Email to Pablo (owner)
  const ownerHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f0f9ff;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <tr><td style="background:#059669;padding:30px;text-align:center;">
          <h1 style="color:#ffffff;font-size:22px;margin:0;">Propuesta Aceptada</h1>
          <p style="color:#d1fae5;font-size:14px;margin:8px 0 0 0;">Nuevo cliente confirmado</p>
        </td></tr>
        <tr><td style="padding:35px;">
          <p style="font-size:16px;color:#374151;margin:0 0 20px 0;">
            <strong>${proposal.company_name}</strong> aceptó la propuesta comercial.
          </p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:20px 0;">
            <p style="font-size:13px;color:#166534;margin:0 0 8px 0;font-weight:600;">Detalle</p>
            <p style="font-size:12px;color:#14532d;margin:0;line-height:2;">
              <strong>Empresa:</strong> ${proposal.company_name}<br>
              <strong>RUT:</strong> ${proposal.company_rut || 'No informado'}<br>
              <strong>Contacto:</strong> ${proposal.contact_name || '-'} · ${proposal.contact_email || '-'} · ${proposal.contact_phone || '-'}<br>
              <strong>Colaboradores:</strong> ${proposal.num_employees}<br>
              <strong>Precio mensual:</strong> $${monthlyIva.toLocaleString('es-CL')} IVA incl.<br>
              <strong>Referencia:</strong> ${proposal.reference}<br>
              <strong>Fecha:</strong> ${fechaStr}<br>
              <strong>IP:</strong> ${ip}
            </p>
          </div>
          <p style="font-size:14px;color:#374151;margin:20px 0 0 0;font-weight:600;">
            Siguiente paso: contactar al cliente para activar el servicio.
          </p>
        </td></tr>
        <tr><td style="padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Flexio · flexio.cl</p>
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
      to: [OWNER_EMAIL],
      subject: `Propuesta aceptada — ${proposal.company_name}`,
      html: ownerHtml,
    }),
  });

  // Email to client (if has email)
  if (proposal.contact_email) {
    const clientHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <tr><td style="background:#2563eb;padding:30px;text-align:center;">
          <h1 style="color:#ffffff;font-size:22px;margin:0;">Propuesta Confirmada</h1>
          <p style="color:#bfdbfe;font-size:14px;margin:8px 0 0 0;">Flexio · Control de Asistencia</p>
        </td></tr>
        <tr><td style="padding:35px;">
          <p style="font-size:16px;color:#374151;margin:0 0 20px 0;">
            Hola${proposal.contact_name ? ` ${proposal.contact_name}` : ''},
          </p>
          <p style="font-size:14px;color:#6b7280;margin:0 0 16px 0;">
            Confirmamos la recepción de tu aceptación de la propuesta de servicios Flexio para <strong>${proposal.company_name}</strong>.
          </p>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:20px;margin:20px 0;">
            <p style="font-size:13px;color:#1e40af;margin:0;line-height:1.8;">
              <strong>Plan:</strong> ${proposal.num_employees} colaboradores<br>
              <strong>Precio:</strong> $${monthlyIva.toLocaleString('es-CL')}/mes IVA incl.<br>
              <strong>Trial:</strong> ${proposal.trial_days} días sin costo
            </p>
          </div>
          <p style="font-size:14px;color:#374151;margin:20px 0 0 0;">
            Pablo Encina de Flexio se pondrá en contacto contigo para activar el servicio y comenzar tu período de prueba.
          </p>
          <p style="font-size:13px;color:#6b7280;margin:16px 0 0 0;">
            Si tienes alguna duda, escríbenos por WhatsApp al +56 9 4961 6038.
          </p>
        </td></tr>
        <tr><td style="padding:20px 30px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;margin:0;">Flexio · flexio.cl · +56 9 4961 6038</p>
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
        to: [proposal.contact_email],
        subject: `Propuesta confirmada — Flexio para ${proposal.company_name}`,
        html: clientHtml,
      }),
    });
  }
}
