const { getDb } = require('../lib/db');
const { corsHeaders, handleCors } = require('../lib/cors');
const { requireTenant } = require('../lib/tenant');
const { verifyPin } = require('../lib/hash');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const tenant = await requireTenant(req, res);
  if (!tenant) return;

  const sql = getDb();

  try {
    // GET ?totem=1: Leer la ubicación fija del tótem principal del tenant.
    // Es la ubicación que se usa como fallback en las marcas de tótem (email/evidencia).
    if (req.method === 'GET' && (req.query.totem === '1' || req.query.totem === 'true')) {
      const [device] = await sql(
        `SELECT name, lat, lng FROM authorized_devices
         WHERE tenant_id = $1 AND active = true AND lat IS NOT NULL AND lng IS NOT NULL
         ORDER BY (device_id = 'totem-principal') DESC, updated_at DESC
         LIMIT 1`,
        [tenant.id]
      );
      return res.status(200).json({
        configured: !!device,
        name: device?.name || null,
        lat: device ? Number(device.lat) : null,
        lng: device ? Number(device.lng) : null,
      });
    }

    // PUT: Guardar/actualizar la ubicación fija del tótem principal del tenant.
    // No exige PIN (usa el contexto de admin por slug) y NO cuenta contra max_devices:
    // gestiona un único registro estable con device_id = 'totem-principal'.
    if (req.method === 'PUT') {
      const { lat, lng, name } = req.body;

      const nLat = lat === '' || lat == null ? null : Number(lat);
      const nLng = lng === '' || lng == null ? null : Number(lng);

      if (nLat == null || nLng == null || Number.isNaN(nLat) || Number.isNaN(nLng)) {
        return res.status(400).json({ error: 'lat y lng son requeridos y deben ser números válidos' });
      }
      if (nLat < -90 || nLat > 90 || nLng < -180 || nLng > 180) {
        return res.status(400).json({ error: 'Coordenadas fuera de rango' });
      }

      const [existing] = await sql(
        `SELECT id FROM authorized_devices WHERE tenant_id = $1 AND device_id = 'totem-principal'`,
        [tenant.id]
      );

      if (existing) {
        await sql(
          `UPDATE authorized_devices SET lat = $1, lng = $2, name = $3, active = true, updated_at = NOW()
           WHERE tenant_id = $4 AND device_id = 'totem-principal'`,
          [nLat, nLng, name || 'Tótem principal', tenant.id]
        );
      } else {
        await sql(
          `INSERT INTO authorized_devices (id, tenant_id, device_id, name, lat, lng, active, created_at, updated_at)
           VALUES ($1, $2, 'totem-principal', $3, $4, $5, true, NOW(), NOW())`,
          [crypto.randomUUID(), tenant.id, name || 'Tótem principal', nLat, nLng]
        );
      }

      return res.status(200).json({ message: 'Ubicación del tótem guardada', lat: nLat, lng: nLng });
    }

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
      if (!verifyPin(pin, tenant.admin_pin_hash)) {
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

      // Check if already exists (for any tenant with this device_id)
      const [existing] = await sql(
        'SELECT * FROM authorized_devices WHERE device_id = $1',
        [device_id]
      );

      if (existing) {
        // Reasignar dispositivo a este tenant (o reactivar si ya era de este tenant)
        await sql(
          'UPDATE authorized_devices SET active = true, tenant_id = $1, name = $2, lat = $3, lng = $4, updated_at = NOW() WHERE device_id = $5',
          [tenant.id, name || existing.name, lat || null, lng || null, device_id]
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

      if (!verifyPin(pin, tenant.admin_pin_hash)) {
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
