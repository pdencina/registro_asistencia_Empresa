/**
 * Módulo de Validación de Geolocalización — Resolución 38 Exenta DT
 * 
 * Valida que las marcaciones se realicen dentro del radio autorizado
 * del dispositivo o ubicación configurada para el tenant.
 * 
 * Usa la fórmula de Haversine para calcular distancia entre coordenadas.
 */

const EARTH_RADIUS_METERS = 6371000;

/**
 * Calcula la distancia en metros entre dos puntos geográficos (Haversine).
 * @param {number} lat1 - Latitud punto 1
 * @param {number} lng1 - Longitud punto 1
 * @param {number} lat2 - Latitud punto 2
 * @param {number} lng2 - Longitud punto 2
 * @returns {number} Distancia en metros
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Valida si una marcación está dentro del geofence autorizado.
 * 
 * @param {object} params
 * @param {number} params.latitude - Lat de la marcación
 * @param {number} params.longitude - Lng de la marcación
 * @param {object} params.device - Dispositivo autorizado { lat, lng }
 * @param {number} params.radiusMeters - Radio máximo permitido (default 150m)
 * @param {boolean} params.geolocationRequired - Si la geo es obligatoria
 * @returns {{ valid: boolean, distance: number|null, message: string }}
 */
function validateGeofence({ latitude, longitude, device, radiusMeters = 150, geolocationRequired = false }) {
  // Si no hay coordenadas en la marcación
  if (latitude == null || longitude == null) {
    if (geolocationRequired) {
      return {
        valid: false,
        distance: null,
        message: 'Geolocalización es obligatoria para registrar asistencia',
      };
    }
    // No obligatoria: permitir sin validar
    return { valid: true, distance: null, message: 'Sin datos de ubicación (no requerido)' };
  }

  // Si no hay dispositivo con ubicación configurada, solo registrar coords
  if (!device || device.lat == null || device.lng == null) {
    return {
      valid: true,
      distance: null,
      message: 'Ubicación registrada (sin dispositivo de referencia para validar)',
    };
  }

  // Calcular distancia
  const distance = Math.round(haversineDistance(latitude, longitude, device.lat, device.lng));

  if (distance > radiusMeters) {
    return {
      valid: false,
      distance,
      message: `Fuera del área autorizada. Distancia: ${distance}m (máximo: ${radiusMeters}m)`,
    };
  }

  return {
    valid: true,
    distance,
    message: `Dentro del área autorizada (${distance}m de ${radiusMeters}m permitidos)`,
  };
}

/**
 * Obtiene la configuración de geofence para un tenant.
 * @param {Function} sql - DB query function
 * @param {string} tenantId - ID del tenant
 * @returns {{ geolocationEnabled: boolean, radiusMeters: number, geolocationRequired: boolean }}
 */
async function getTenantGeoConfig(sql, tenantId) {
  try {
    const [settings] = await sql(
      'SELECT geolocation_enabled, geolocation_radius_meters FROM tenant_settings WHERE tenant_id = $1',
      [tenantId]
    );

    // Asegurar columna geolocation_required
    await sql('ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS geolocation_required BOOLEAN DEFAULT false');

    const [settingsWithReq] = await sql(
      'SELECT geolocation_enabled, geolocation_radius_meters, geolocation_required FROM tenant_settings WHERE tenant_id = $1',
      [tenantId]
    );

    if (settingsWithReq) {
      return {
        geolocationEnabled: settingsWithReq.geolocation_enabled !== false,
        radiusMeters: settingsWithReq.geolocation_radius_meters || 150,
        geolocationRequired: settingsWithReq.geolocation_required === true,
      };
    }

    return { geolocationEnabled: true, radiusMeters: 150, geolocationRequired: false };
  } catch (e) {
    return { geolocationEnabled: true, radiusMeters: 150, geolocationRequired: false };
  }
}

/**
 * Obtiene el dispositivo autorizado más cercano para validar geofence.
 * @param {Function} sql - DB query function
 * @param {string} tenantId - ID del tenant
 * @param {number} latitude - Lat de la marcación
 * @param {number} longitude - Lng de la marcación
 * @returns {object|null} Dispositivo más cercano con lat/lng
 */
async function getNearestDevice(sql, tenantId, latitude, longitude) {
  try {
    const devices = await sql(
      'SELECT device_id, name, lat, lng FROM authorized_devices WHERE tenant_id = $1 AND active = true AND lat IS NOT NULL AND lng IS NOT NULL',
      [tenantId]
    );

    if (devices.length === 0) return null;

    // Encontrar el más cercano
    let nearest = null;
    let minDistance = Infinity;

    for (const d of devices) {
      const dist = haversineDistance(latitude, longitude, d.lat, d.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = { ...d, distance: Math.round(dist) };
      }
    }

    return nearest;
  } catch (e) {
    return null;
  }
}

module.exports = {
  haversineDistance,
  validateGeofence,
  getTenantGeoConfig,
  getNearestDevice,
};
