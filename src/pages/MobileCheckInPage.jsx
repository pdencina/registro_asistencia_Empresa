import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Webcam from 'react-webcam';
import { MapPin, Camera, LogIn, LogOut, CheckCircle, XCircle, Loader, Navigation } from 'lucide-react';
import { attendanceApi, employeesApi } from '../api';

const STEP_IDENTIFY = 'identify';
const STEP_CAPTURE = 'capture';
const STEP_CONFIRMED = 'confirmed';
const STEP_ERROR = 'error';

export default function MobileCheckInPage() {
  const { tenant } = useParams();
  const [step, setStep] = useState(STEP_IDENTIFY);
  const [rut, setRut] = useState('');
  const [employee, setEmployee] = useState(null);
  const [status, setStatus] = useState(null);
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmData, setConfirmData] = useState(null);
  const [tenantLogo, setTenantLogo] = useState(null);
  const webcamRef = useRef(null);

  // Obtener GPS al montar
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err) => setLocationError('No se pudo obtener ubicación. Activa el GPS.'),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      setLocationError('Tu dispositivo no soporta geolocalización');
    }
  }, []);

  // Cargar logo del tenant
  useEffect(() => {
    async function loadLogo() {
      try {
        const res = await fetch('/api/settings/logo', {
          headers: tenant ? { 'x-tenant-slug': tenant } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data.logo_url) setTenantLogo(data.logo_url);
        }
      } catch (e) {}
    }
    loadLogo();
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

  async function handleIdentify(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Buscar con el RUT formateado (como está en la BD)
      const employees = await employeesApi.getAll({ search: rut });
      const found = employees.find(emp =>
        emp.rut.replace(/[.\-\s]/g, '').toLowerCase() === rut.replace(/[.\-\s]/g, '').toLowerCase()
      );

      if (!found) {
        setError('RUT no encontrado. Verifica con tu administrador.');
        setLoading(false);
        return;
      }

      setEmployee(found);

      // Obtener estado actual
      try {
        const st = await attendanceApi.getEmployeeStatus(found.id);
        setStatus(st);
      } catch { setStatus(null); }

      setStep(STEP_CAPTURE);
    } catch (err) {
      setError(err.message || 'Error al buscar colaborador');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(type) {
    if (!employee || !webcamRef.current) return;
    setLoading(true);
    setError('');

    try {
      const photo = webcamRef.current.getScreenshot();

      const result = await attendanceApi.register({
        employee_id: employee.id,
        type,
        photo_snapshot: photo,
        notes: location ? `GPS: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} (±${Math.round(location.accuracy)}m)` : 'Sin GPS',
      });

      setConfirmData({
        type,
        time: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        location,
      });
      setStep(STEP_CONFIRMED);

      // Volver al inicio después de 5 segundos
      setTimeout(() => {
        setStep(STEP_IDENTIFY);
        setEmployee(null);
        setStatus(null);
        setRut('');
        setConfirmData(null);
      }, 5000);
    } catch (err) {
      setError(err.message || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  }

  // ========================
  // STEP: IDENTIFICARSE
  // ========================
  if (step === STEP_IDENTIFY) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {tenantLogo ? (
              <img src={tenantLogo} alt="Logo empresa" className="h-7 max-w-[120px] object-contain" />
            ) : (
              <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
            )}
            <span className="text-xs text-gray-400">Marcaje Móvil</span>
          </div>
          {location && (
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <Navigation className="w-3 h-3" />
              GPS activo
            </div>
          )}
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-primary-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Marcaje en Terreno</h1>
              <p className="text-sm text-gray-500">Ingresa tu RUT para registrar asistencia</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {locationError && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                <p className="text-amber-700 text-sm">{locationError}</p>
              </div>
            )}

            <form onSubmit={handleIdentify} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">RUT</label>
                <input
                  type="text"
                  value={rut}
                  onChange={e => setRut(formatRut(e.target.value))}
                  placeholder="12.345.678-9"
                  required
                  autoFocus
                  inputMode="numeric"
                  className="w-full px-4 py-4 border border-gray-200 rounded-xl text-center text-lg focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading || rut.length < 8}
                className="w-full py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50"
              >
                {loading ? 'Buscando...' : 'Continuar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ========================
  // STEP: CAPTURAR SELFIE + MARCAR
  // ========================
  if (step === STEP_CAPTURE && employee) {
    const canEntry = !status || status.status === 'absent';
    const canExit = status?.status === 'present';

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {tenantLogo ? (
              <img src={tenantLogo} alt="Logo empresa" className="h-7 max-w-[120px] object-contain" />
            ) : (
              <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
            )}
          </div>
          {location && (
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <Navigation className="w-3 h-3" />
              ±{Math.round(location.accuracy)}m
            </div>
          )}
        </header>

        <div className="flex-1 p-4">
          {/* Employee info */}
          <div className="text-center mb-4">
            <p className="text-lg font-bold text-gray-900">{employee.first_name} {employee.last_name}</p>
            <p className="text-sm text-gray-500">{employee.rut}</p>
            {status?.status === 'present' && status.last_record && (
              <p className="text-xs text-primary-600 mt-1">
                Ingreso hoy: {new Date(status.last_record.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs
              </p>
            )}
          </div>

          {/* Camera */}
          <div className="relative rounded-2xl overflow-hidden bg-black mx-auto" style={{ maxWidth: '300px' }}>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={{ width: 480, height: 480, facingMode: 'user' }}
              className="w-full aspect-square object-cover"
              mirrored={true}
            />
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-center">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-6 space-y-3 max-w-sm mx-auto">
            {canEntry && (
              <button
                onClick={() => handleRegister('entry')}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50"
              >
                {loading ? <Loader className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                Registrar ingreso
              </button>
            )}
            {canExit && (
              <button
                onClick={() => handleRegister('exit')}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-4 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50"
              >
                {loading ? <Loader className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                Registrar salida
              </button>
            )}
            {status?.status === 'exited' && (
              <div className="text-center py-4 bg-gray-100 rounded-xl">
                <p className="text-gray-500 text-sm">Ya completaste tu jornada hoy</p>
              </div>
            )}
          </div>

          <button
            onClick={() => { setStep(STEP_IDENTIFY); setEmployee(null); setRut(''); setError(''); }}
            className="block mx-auto mt-4 text-sm text-gray-400 hover:text-gray-600"
          >
            ← Cambiar colaborador
          </button>
        </div>
      </div>
    );
  }

  // ========================
  // STEP: CONFIRMADO
  // ========================
  if (step === STEP_CONFIRMED && confirmData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {confirmData.type === 'entry' ? 'Ingreso' : 'Salida'} registrado
          </h2>
          <p className="text-lg text-gray-700 font-medium">{confirmData.time} hrs</p>
          {confirmData.location && (
            <div className="mt-4 flex items-center justify-center gap-1 text-sm text-gray-400">
              <MapPin className="w-4 h-4" />
              GPS: {confirmData.location.lat.toFixed(4)}, {confirmData.location.lng.toFixed(4)}
            </div>
          )}
          <p className="text-sm text-gray-400 mt-4">Volviendo al inicio...</p>
        </div>
      </div>
    );
  }

  return null;
}
