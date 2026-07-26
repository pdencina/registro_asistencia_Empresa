import { useState, useEffect } from 'react';

/**
 * Hook to capture GPS location on mount.
 * Returns { location, locationError, locationText }
 * location = { lat, lng, accuracy } or null
 */
export function useGeolocation() {
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocalización no disponible');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        setLocationError('No se pudo obtener ubicación');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const gpsNotes = location
    ? `GPS: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} (±${Math.round(location.accuracy)}m)`
    : 'Sin GPS';

  return { location, locationError, gpsNotes };
}
