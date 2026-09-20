const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireAuth } = require('../lib/auth');
const { verifyPin, hashPin } = require('../lib/hash');

/**
 * POST /api/auth/change-password
 * Cambiar contraseña del admin.
 * Body: { current_password, new_password }
 */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tenant = await requireAuth(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son obligatorias' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    // Un usuario secundario (tenant_users) cambia SU contraseña, no la del admin principal
    const isMainAdmin = req.session.email === String(tenant.admin_email).toLowerCase();
    if (!isMainAdmin) {
      const [user] = await sql('SELECT id, password FROM tenant_users WHERE tenant_id = $1 AND email = $2 AND active = true', [tenant.id, req.session.email]);
      if (!user || !verifyPin(current_password, user.password)) {
        return res.status(401).json({ error: 'Contraseña actual incorrecta' });
      }
      await sql('UPDATE tenant_users SET password = $1 WHERE id = $2', [hashPin(new_password), user.id]);
      return res.status(200).json({ message: 'Contraseña actualizada correctamente' });
    }

    // Verificar contraseña actual (compatible con legacy texto plano)
    if (!verifyPin(current_password, tenant.admin_password)) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    // Actualizar contraseña hasheada y desactivar flag de cambio obligatorio
    await sql('UPDATE tenants SET admin_password = $1, must_change_password = false, updated_at = NOW() WHERE id = $2', [hashPin(new_password), tenant.id]);

    return res.status(200).json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
