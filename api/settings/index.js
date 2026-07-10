const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    // GET: Read settings for this tenant
    if (req.method === 'GET') {
      const rows = await sql('SELECT * FROM tenant_settings WHERE tenant_id = $1', [tenant.id]);

      if (rows.length === 0) {
        // Return defaults
        return res.status(200).json({
          geolocation_enabled: true,
          geolocation_radius_meters: 100,
          biometric_consent_required: true,
          timezone: 'America/Santiago',
        });
      }

      const settings = rows[0];
      return res.status(200).json({
        geolocation_enabled: settings.geolocation_enabled,
        geolocation_radius_meters: settings.geolocation_radius_meters,
        biometric_consent_required: settings.biometric_consent_required,
        notification_email: settings.notification_email,
        webhook_url: settings.webhook_url,
        timezone: settings.timezone,
      });
    }

    // PUT: Update settings for this tenant
    if (req.method === 'PUT') {
      const { geolocation_enabled, geolocation_radius_meters, biometric_consent_required, notification_email, webhook_url } = req.body;

      await sql(`
        INSERT INTO tenant_settings (tenant_id, geolocation_enabled, geolocation_radius_meters, biometric_consent_required, notification_email, webhook_url, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (tenant_id) DO UPDATE SET
          geolocation_enabled = COALESCE($2, tenant_settings.geolocation_enabled),
          geolocation_radius_meters = COALESCE($3, tenant_settings.geolocation_radius_meters),
          biometric_consent_required = COALESCE($4, tenant_settings.biometric_consent_required),
          notification_email = COALESCE($5, tenant_settings.notification_email),
          webhook_url = COALESCE($6, tenant_settings.webhook_url),
          updated_at = NOW()
      `, [
        tenant.id,
        geolocation_enabled !== undefined ? geolocation_enabled : true,
        geolocation_radius_meters || 100,
        biometric_consent_required !== undefined ? biometric_consent_required : true,
        notification_email || null,
        webhook_url || null
      ]);

      return res.status(200).json({ message: 'Configuración guardada' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
