const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const sql = getDb();

  // Ensure settings table exists
  await sql(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key VARCHAR(50) PRIMARY KEY,
      value VARCHAR(255) NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  try {
    // GET: Read settings
    if (req.method === 'GET') {
      const rows = await sql('SELECT key, value FROM app_settings');
      const settings = {};
      for (const row of rows) {
        settings[row.key] = row.value === 'true' ? true : row.value === 'false' ? false : row.value;
      }
      // Defaults
      if (settings.geolocation_enabled === undefined) settings.geolocation_enabled = true;

      return res.status(200).json(settings);
    }

    // PUT: Update settings
    if (req.method === 'PUT') {
      const { geolocation_enabled } = req.body;

      if (geolocation_enabled !== undefined) {
        await sql(`
          INSERT INTO app_settings (key, value, updated_at) 
          VALUES ('geolocation_enabled', $1, NOW())
          ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
        `, [String(geolocation_enabled)]);
      }

      return res.status(200).json({ message: 'Configuración guardada' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
