const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    // GET: Check if device is authorized for this tenant
    if (req.method === 'GET') {
      const { device_id } = req.query;

      if (!device_id) {
        return res.status(400).json({ error: 'device_id es requerido' });
      }

      const [device] = await sql(
        'SELECT * FROM authorized_devices WHERE device_id = $1 AND tenant_id = $2 AND active = true',
        [device_id, tenant.id]
      );

      return res.status(200).json({
        authorized: !!device,
        device: device || null,
        location: device ? { lat: device.lat, lng: device.lng } : null,
      });
    }

    // POST: Authorize a new device (requires admin PIN)
    if (req.method === 'POST') {
      const { device_id, pin, name, lat, lng } = req.body;

      if (!device_id || !pin) {
        return res.status(400).json({ error: 'device_id y pin son requeridos' });
      }

      // Verificar PIN del tenant
      if (pin !== tenant.admin_pin_hash) {
        return res.status(401).json({ error: 'PIN incorrecto' });
      }

      // Verificar límite de dispositivos del plan
      const [countRow] = await sql(
        'SELECT COUNT(*) as count FROM authorized_devices WHERE tenant_id = $1 AND active = true',
        [tenant.id]
      );
      if (Number(countRow.count) >= tenant.max_devices) {
        return res.status(403).json({ error: `Límite de ${tenant.max_devices} dispositivo(s) alcanzado. Actualiza tu plan.` });
      }

      // Check if already exists for this tenant
      const [existing] = await sql(
        'SELECT * FROM authorized_devices WHERE device_id = $1 AND tenant_id = $2',
        [device_id, tenant.id]
      );

      if (existing) {
        await sql(
          'UPDATE authorized_devices SET active = true, name = $1, lat = $3, lng = $4, updated_at = NOW() WHERE device_id = $2 AND tenant_id = $5',
          [name || existing.name, device_id, lat || null, lng || null, tenant.id]
        );
      } else {
        await sql(
          'INSERT INTO authorized_devices (id, tenant_id, device_id, name, lat, lng, active, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())',
          [crypto.randomUUID(), tenant.id, device_id, name || 'Dispositivo', lat || null, lng || null]
        );
      }

      return res.status(200).json({ authorized: true, message: 'Dispositivo autorizado' });
    }

    // DELETE: Deauthorize device
    if (req.method === 'DELETE') {
      const { device_id, pin } = req.body;

      if (pin !== tenant.admin_pin_hash) {
        return res.status(401).json({ error: 'PIN incorrecto' });
      }

      await sql(
        'UPDATE authorized_devices SET active = false, updated_at = NOW() WHERE device_id = $1 AND tenant_id = $2',
        [device_id, tenant.id]
      );

      return res.status(200).json({ message: 'Dispositivo desautorizado' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
