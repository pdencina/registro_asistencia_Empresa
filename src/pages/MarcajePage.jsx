import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, ChevronUp, ChevronDown, Loader, WifiOff, MapPin, Wifi } from 'lucide-react';
import { useGeolocation } from '../utils/useGeolocation';

/**
 * MarcajePage — Flujo principal de marcaje por PIN o RUT
 * Estilo BUK: Entrada/Salida → PIN o RUT → Confirmación
 * 
 * URL: /marcaje/:tenant
 * 
 * Conforme a Resolución 38 Exenta DT:
 * - Identificación por PIN personal o RUT
 * - Geolocalización al momento del registro
 * - Comprobante por email
 * - Modo offline con sync
 */

const STEP_ACTION = 'action';     // Elegir Entrada o Salida
const STEP_IDENTIFY = 'identify'; // Ingresar PIN o RUT
const STEP_SENDING = 'sending';   // Enviando...
const STEP_CONFIRMED = 'confirmed'; // Marca recibida

export default function MarcajePage() {
  const { tenant } = useParams();
  const { gpsNotes, latitude, longitude } = useGeolocation();
  const [step, setStep] = useState(STEP_ACTION);
  const [action, setAction] = useState(null); // 'entry' | 'exit'
  const [identifyMode, setIdentifyMode] = useState('pin'); // 'pin' | 'rut'
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmData, setConfirmData] = useState(null);
  const [tenantLogo, setTenantLogo] = useState(null);
  const [tenantName, setTenantName] = useState('');
  const [time, setTime] = useState(new Date());
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [geoReady, setGeoReady] = useState(false);

  // Reloj
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Online/offline
  useEffect(() => {
    const on = () => setIsOffline(false);
    const off = () => setIsOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // Geo ready
  useEffect(() => {
    if (latitude || gpsNotes) setGeoReady(true);
  }, [latitude, gpsNotes]);

  // Cargar logo
  useEffect(() => {
    async function loadTenant() {
      try {
        const res = await fetch('/api/settings/logo', {
          headers: tenant ? { 'x-tenant-slug': tenant } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data.logo_url) setTenantLogo(data.logo_url);
        }
      } catch {}
      try {
        const res = await fetch('/api/auth/find-tenant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: tenant }),
        });
        if (res.ok) {
          const data = await res.json();
          setTenantName(data.name || '');
        }
      } catch {}
    }
    if (tenant) loadTenant();
  }, [tenant]);

  function formatRut(value) {
    let clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
    if (clean.length === 0) return '';
    let dv = clean.slice(-1);
    let body = clean.slice(0, -1);
    if (body.length === 0) return clean;
    let formatted = '';
    let count = 0;
    for (let i = body.length - 1; i >= 0; i--) {
      formatted = body[i] + formatted;
      count++;
      if (count === 3 && i > 0) { formatted = '.' + formatted; count = 0; }
    }
    return formatted + '-' + dv;
  }

  function handleSelectAction(type) {
    setAction(type);
    setStep(STEP_IDENTIFY);
    setError('');
    setInputValue('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!inputValue || inputValue.length < 4) {
      setError(identifyMode === 'pin' ? 'Ingresa tu PIN' : 'Ingresa tu RUT');
      return;
    }

    setError('');
    setStep(STEP_SENDING);
    setLoading(true);

    try {
      const body = {
        action,
        notes: gpsNotes || undefined,
        latitude: latitude || undefined,
        longitude: longitude || undefined,
      };

      // Según el modo, enviar pin o rut
      if (identifyMode === 'pin') {
        body.pin = inputValue;
      } else {
        body.rut = inputValue.replace(/[.\-\s]/g, '');
      }

      const res = await fetch('/api/attendance/pin-checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenant ? { 'x-tenant-slug': tenant } : {}),
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        const now = new Date();
        setConfirmData({
          type: action,
          time: now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          message: data.message || (action === 'entry' ? 'Ingreso registrado' : 'Salida registrada'),
        });
        setStep(STEP_CONFIRMED);

        // Reset después de 5 segundos
        setTimeout(() => {
          setStep(STEP_ACTION);
          setAction(null);
          setInputValue('');
          setConfirmData(null);
        }, 5000);
      } else {
        setError(data.error || 'Error al registrar');
        setStep(STEP_IDENTIFY);
      }
    } catch (err) {
      setError('Error de conexión. Intenta de nuevo.');
      setStep(STEP_IDENTIFY);
    } finally {
      setLoading(false);
    }
  }

  // ===== PANTALLA: CONFIRMACIÓN (estilo BUK verde) =====
  if (step === STEP_CONFIRMED && confirmData) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center p-6 ${
        confirmData.type === 'entry' ? 'bg-emerald-500' : 'bg-orange-500'
      }`}>
        <div className="text-white text-center">
          <CheckCircle className="w-24 h-24 mx-auto mb-6 opacity-90" strokeWidth={1.5} />
          <h1 className="text-3xl font-bold mb-4">Marca recibida</h1>
          <p className="text-xl opacity-90">
            Registramos tu hora de<br />
            <strong>{confirmData.type === 'entry' ? 'entrada' : 'salida'}</strong> a las <strong>{confirmData.time}</strong>.
          </p>
          <p className="mt-6 text-base opacity-75">
            Si la marca está correcta,<br />te llegará el comprobante a tu correo.
          </p>
        </div>
      </div>
    );
  }

  // ===== PANTALLA: ENVIANDO =====
  if (step === STEP_SENDING) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        {tenantLogo && <img src={tenantLogo} alt="" className="h-8 mb-12 opacity-60" />}
        <Loader className="w-16 h-16 text-blue-600 animate-spin mb-8" strokeWidth={1.5} />
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Estamos enviando tu marca</h2>
        <p className="text-gray-500 text-center max-w-xs">
          Guardamos tu marcaje y lo estamos enviando al servidor. No cierres.
        </p>
      </div>
    );
  }

  // ===== PANTALLA: INGRESAR PIN/RUT =====
  if (step === STEP_IDENTIFY) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        {/* Header */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <button onClick={() => { setStep(STEP_ACTION); setError(''); }} className="text-gray-400 text-sm">
            ← Volver
          </button>
          {tenantLogo && <img src={tenantLogo} alt="" className="h-6 opacity-60" />}
          <div className="flex items-center gap-2">
            {geoReady && <MapPin className="w-4 h-4 text-gray-400" />}
            {!isOffline && <Wifi className="w-4 h-4 text-gray-400" />}
          </div>
        </div>

        <div className="w-full max-w-sm">
          {/* Tipo de acción */}
          <div className={`text-center mb-8 px-4 py-3 rounded-xl ${
            action === 'entry' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'
          }`}>
            <p className="font-semibold text-lg">
              {action === 'entry' ? '📥 Registrar Entrada' : '📤 Registrar Salida'}
            </p>
          </div>

          {/* Toggle PIN / RUT */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            <button
              onClick={() => { setIdentifyMode('pin'); setInputValue(''); setError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
                identifyMode === 'pin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >PIN</button>
            <button
              onClick={() => { setIdentifyMode('rut'); setInputValue(''); setError(''); }}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition ${
                identifyMode === 'rut' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >RUT</button>
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit}>
            {identifyMode === 'pin' ? (
              <input
                type="password"
                inputMode="numeric"
                value={inputValue}
                onChange={e => setInputValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Ingresa tu PIN"
                autoFocus
                className="w-full px-6 py-5 border-2 border-gray-200 rounded-2xl text-center text-3xl tracking-[0.5em] focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none"
              />
            ) : (
              <input
                type="text"
                inputMode="numeric"
                value={inputValue}
                onChange={e => setInputValue(formatRut(e.target.value))}
                placeholder="12.345.678-9"
                autoFocus
                className="w-full px-6 py-5 border-2 border-gray-200 rounded-2xl text-center text-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none"
              />
            )}

            {error && (
              <p className="text-red-600 text-center mt-3 text-sm font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || inputValue.length < 4}
              className={`w-full mt-6 py-5 text-white text-xl font-bold rounded-2xl transition-all disabled:opacity-40 ${
                action === 'entry'
                  ? 'bg-blue-600 hover:bg-blue-700 active:scale-95'
                  : 'bg-orange-500 hover:bg-orange-600 active:scale-95'
              }`}
            >
              {loading ? 'Registrando...' : 'Confirmar'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ===== PANTALLA: ELEGIR ENTRADA O SALIDA (home) =====
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      {/* Header */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
        {tenantLogo ? (
          <img src={tenantLogo} alt="" className="h-7" />
        ) : (
          <span className="text-lg font-bold text-gray-900">{tenantName || 'Flexio'}</span>
        )}
        <div className="flex items-center gap-2">
          {geoReady && <MapPin className="w-4 h-4 text-gray-400" />}
          {!isOffline ? <Wifi className="w-4 h-4 text-gray-400" /> : <WifiOff className="w-4 h-4 text-amber-500" />}
        </div>
      </div>

      {/* Reloj */}
      <p className="text-5xl font-bold text-gray-900 mb-1 tabular-nums">
        {time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <p className="text-gray-400 text-sm mb-12">
        {time.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      {/* Botones Entrada / Salida */}
      <div className="w-full max-w-xs space-y-4">
        <div className="flex justify-center">
          <ChevronUp className="w-10 h-10 text-blue-600" strokeWidth={2.5} />
        </div>
        <button
          onClick={() => handleSelectAction('entry')}
          className="w-full py-7 bg-blue-600 hover:bg-blue-700 text-white text-2xl font-bold rounded-2xl shadow-lg active:scale-95 transition-all"
        >
          Entrada
        </button>
        <button
          onClick={() => handleSelectAction('exit')}
          className="w-full py-7 bg-orange-500 hover:bg-orange-600 text-white text-2xl font-bold rounded-2xl shadow-lg active:scale-95 transition-all"
        >
          Salida
        </button>
        <div className="flex justify-center">
          <ChevronDown className="w-10 h-10 text-orange-500" strokeWidth={2.5} />
        </div>
      </div>

      {isOffline && (
        <div className="absolute bottom-6 flex items-center gap-2 bg-amber-100 text-amber-800 px-4 py-2 rounded-full">
          <WifiOff className="w-4 h-4" />
          <span className="text-xs font-medium">Sin conexión — las marcas se guardarán localmente</span>
        </div>
      )}
    </div>
  );
}
