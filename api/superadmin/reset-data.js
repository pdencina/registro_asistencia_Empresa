const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireSuperAdmin } = require('../lib/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireSuperAdmin(req, res)) return;

  const sql = getDb();

  try {
    // Borrar data en orden por foreign keys (solo data, tablas intactas)
    try { await sql('DELETE FROM early_exits'); } catch(e) {}
    try { await sql('DELETE FROM contracts'); } catch(e) {}
    try { await sql('DELETE FROM attendance_records'); } catch(e) {}
    try { await sql('DELETE FROM employee_schedules'); } catch(e) {}
    try { await sql('DELETE FROM authorized_devices'); } catch(e) {}
    try { await sql('DELETE FROM employees'); } catch(e) {}
    try { await sql('DELETE FROM schedules'); } catch(e) {}
    try { await sql('DELETE FROM tenant_settings'); } catch(e) {}
    try { await sql('DELETE FROM subscriptions'); } catch(e) {}
    try { await sql('DELETE FROM tenants'); } catch(e) {}

    return res.status(200).json({ ok: true, message: 'Toda la data fue eliminada. Base de datos limpia.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
