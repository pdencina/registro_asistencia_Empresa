// Radio permitido en metros (200m por defecto)
const ALLOWED_RADIUS_METERS = 200;

/**
 * Obtiene la posición actual del dispositivo
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalización no disponible en este dispositivo'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('Permiso de ubicación denegado. Actívalo en la configuración del navegador.'));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error('No se pudo obtener la ubicación'));
            break;
          case error.TIMEOUT:
            reject(new Error('Tiempo de espera agotado para obtener ubicación'));
            break;
          default:
            reject(new Error('Error obteniendo ubicación'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000, // Cache de 1 minuto
      }
    );
  });
}

/**
 * Calcula la distancia en metros entre dos puntos GPS (Haversine)
 */
export function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Radio de la tierra en metros
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Verifica si la posición actual está dentro del radio permitido
 */
export function isWithinAllowedRadius(currentLat, currentLng, authorizedLat, authorizedLng, radiusMeters = ALLOWED_RADIUS_METERS) {
  const distance = getDistanceMeters(currentLat, currentLng, authorizedLat, authorizedLng);
  return {
    allowed: distance <= radiusMeters,
    distance: Math.round(distance),
    radius: radiusMeters,
  };
}

/**
 * Guarda la ubicación autorizada en localStorage
 */
export function saveAuthorizedLocation(lat, lng) {
  localStorage.setItem('authorized_location', JSON.stringify({ lat, lng }));
}

/**
 * Obtiene la ubicación autorizada guardada
 */
export function getAuthorizedLocation() {
  try {
    const data = localStorage.getItem('authorized_location');
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}
