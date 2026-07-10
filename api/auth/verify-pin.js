const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

/**
 * POST /api/auth/verify-pin
 * Verifica el PIN del admin contra el tenant.
 * Body: { pin: "1234" }
 * Header: x-tenant-slug: "constructora-acme"
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const { pin } = req.body;

  if (!pin) {
    return res.status(400).json({ error: 'PIN es obligatorio' });
  }

  // Verificar PIN contra el almacenado del tenant
  if (pin !== tenant.admin_pin_hash) {
    return res.status(401).json({ error: 'PIN incorrecto' });
  }

  return res.status(200).json({ 
    success: true, 
    tenant_name: tenant.name,
    tenant_slug: tenant.slug,
    plan: tenant.plan,
  });
};
