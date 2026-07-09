import { useState, useEffect } from 'react';
import { Loader, MapPinOff, WifiOff } from 'lucide-react';
import CheckInPage from '../pages/CheckInPage';
import DeviceActivationPage from '../pages/DeviceActivationPage';
import { devicesApi } from '../api';
import { getDeviceId } from '../utils/deviceId';
import { getCurrentPosition, isWithinAllowedRadius, saveAuthorizedLocation } from '../utils/geolocation';

export default function KioskLayout() {
  const [time, setTime] = useState(new Date());
  const [deviceStatus, setDeviceStatus] = useState('checking'); // checking | authorized | unauthorized | out_of_range
  const [locationInfo, setLocationInfo] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen for online/offline events
  useEffect(() => {
    function handleOnline() { setIsOffline(false); }
    function handleOffline() { setIsOffline(true); }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    checkDevice();
  }, []);

  async function checkDevice() {
    try {
      const deviceId = getDeviceId();
      const result = await devicesApi.check(deviceId);

      if (!result.authorized) {
        setDeviceStatus('unauthorized');
        return;
      }

      // Check if geolocation is enabled in settings
      let geoEnabled = true;
      try {
        const settingsRes = await fetch('/api/settings');
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          geoEnabled = settings.geolocation_enabled !== false;
        }
      } catch (e) {
        // If can't fetch settings, assume geo is enabled (safe default)
      }

      // If device has location configured AND geolocation is enabled, verify
      if (geoEnabled && result.location && result.location.lat && result.location.lng) {
        try {
          const currentPos = await getCurrentPosition();
          const check = isWithinAllowedRadius(
            currentPos.lat, currentPos.lng,
            result.location.lat, result.location.lng
          );

          if (!check.allowed) {
            setLocationInfo(check);
            setDeviceStatus('out_of_range');
            return;
          }

          saveAuthorizedLocation(result.location.lat, result.location.lng);
        } catch (geoErr) {
          setLocationInfo({ error: geoErr.message });
          setDeviceStatus('out_of_range');
          return;
        }
      }

      setDeviceStatus('authorized');
    } catch (err) {
      console.error('Device check failed:', err);
      setDeviceStatus('unauthorized');
    }
  }

  // Loading state
  if (deviceStatus === 'checking') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-4">
        <Loader className="w-10 h-10 text-primary-500 animate-spin" />
        <p className="text-gray-500">Verificando dispositivo...</p>
      </div>
    );
  }

  // Not authorized
  if (deviceStatus === 'unauthorized') {
    return <DeviceActivationPage onActivated={() => checkDevice()} />;
  }

  // Out of range
  if (deviceStatus === 'out_of_range') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-red-100 p-8 w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <MapPinOff className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Ubicación no autorizada</h2>
          <p className="text-sm text-gray-500 mb-4">
            {locationInfo?.error
              ? locationInfo.error
              : `Este dispositivo está a ${locationInfo?.distance}m de la ubicación autorizada (máximo ${locationInfo?.radius}m).`
            }
          </p>
          <p className="text-xs text-gray-400">
            El registro de asistencia solo funciona desde la ubicación configurada.
          </p>
          <button
            onClick={() => { setDeviceStatus('checking'); checkDevice(); }}
            className="mt-6 px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm text-gray-600 transition-all"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Authorized — show kiosk
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Offline banner */}
      {isOffline && (
        <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium">
          <WifiOff className="w-5 h-5" />
          Sin conexión a internet — Los registros no se pueden guardar
        </div>
      )}

      {/* Header Flexio */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo-flexio.svg" alt="Flexio" className="h-8" />
          <div className="border-l border-gray-200 pl-3">
            <p className="text-xs text-gray-500">Sistema de Registro de Asistencia</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-700">
            {time.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p className="text-3xl font-bold text-primary-600">
            {time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 overflow-auto">
        <CheckInPage />
      </main>
    </div>
  );
}
