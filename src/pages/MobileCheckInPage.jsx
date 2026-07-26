import { useState, useRef, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import { MapPin, Camera, LogIn, LogOut, CheckCircle, XCircle, Loader, Navigation, KeyRound } from 'lucide-react';
import { attendanceApi, employeesApi } from '../api';

const STEP_IDENTIFY = 'identify';
const STEP_FACE_VERIFY = 'face_verify';
const STEP_PIN_INPUT = 'pin_input';
const STEP_CAPTURE = 'capture';
const STEP_CONFIRMED = 'confirmed';
const STEP_ERROR = 'error';

export default function MobileCheckInPage() {
  const { tenant } = useParams();
  const [searchParams] = useSearchParams();
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
  const [eventName, setEventName] = useState('');
  const webcamRef = useRef(null);
  const autoIdentifyDone = useRef(false);
  const [pin, setPin] = useState('');
  const [faceAttempts, setFaceAttempts] = useState(0);
  const [faceStatus, setFaceStatus] = useState('scanning'); // scanning | matched | failed
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const faceInterval = useRef(null);

  // Load face-api models
  useEffect(() => {
    async function loadModels() {
      try {
        const MODEL_URL = '/models';
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (err) {
        console.warn('Face models failed to load:', err);
      }
    }
    loadModels();
  }, []);

  // Face matching loop (only active during STEP_FACE_VERIFY)
  useEffect(() => {
    if (step !== STEP_FACE_VERIFY || !modelsLoaded || !employee?.photo_url) return;

    faceInterval.current = setInterval(async () => {
      if (!webcamRef.current || !webcamRef.current.video) return;
      const video = webcamRef.current.video;
      if (video.readyState !== 4) return;

      try {
        const detection = await faceapi
          .detectSingleFace(video)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!detection) return;

        const refImg = await faceapi.fetchImage(employee.photo_url);
        const refDetection = await faceapi
          .detectSingleFace(refImg)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!refDetection) return;

        const distance = faceapi.euclideanDistance(detection.descriptor, refDetection.descriptor);

        if (distance < 0.5) {
          // Match!
          clearInterval(faceInterval.current);
          faceInterval.current = null;
          setFaceStatus('matched');

          if (status?.status === 'exited') {
            setStep(STEP_CAPTURE);
            return;
          }

          const nextAction = status?.status === 'present' ? 'exit' : 'entry';
          const photo = webcamRef.current?.getScreenshot();

          await attendanceApi.register({
            employee_id: employee.id,
            type: nextAction,
            photo_snapshot: photo,
            notes: location ? `GPS: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} (±${Math.round(location.accuracy)}m)` : 'Sin GPS',
          });

          setConfirmData({
            type: nextAction,
            time: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            location,
          });
          setStep(STEP_CONFIRMED);
          setTimeout(() => { setStep(STEP_IDENTIFY); setEmployee(null); setRut(''); setStatus(null); setConfirmData(null); setFaceAttempts(0); }, 5000);
        } else {
          setFaceAttempts(prev => {
            if (prev + 1 >= 5) {
              clearInterval(faceInterval.current);
              faceInterval.current = null;
              setFaceStatus('failed');
            }
            return prev + 1;
          });
        }
      } catch (e) { /* silent */ }
    }, 2000);

    // Timeout: 30 seconds max
    const timeout = setTimeout(() => {
      if (faceInterval.current) {
        clearInterval(faceInterval.current);
        faceInterval.current = null;
        setFaceStatus('failed');
      }
    }, 30000);

    return () => {
      if (faceInterval.current) { clearInterval(faceInterval.current); faceInterval.current = null; }
      clearTimeout(timeout);
    };
  }, [step, modelsLoaded, employee?.photo_url]);

  // Auto-identify if RUT passed from /mi
  useEffect(() => {
    const rutFromUrl = searchParams.get('rut');
    if (rutFromUrl && !autoIdentifyDone.current) {
      autoIdentifyDone.current = true;
      autoIdentify(rutFromUrl);
    }
  }, [searchParams]);

  async function autoIdentify(rutValue) {
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/find-employee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenant },
        body: JSON.stringify({ rut: rutValue, tenant_slug: tenant }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.employee) {
          // Also fetch full employee data for consent_status and photo_url
          const employees = await employeesApi.getAll({ search: rutValue });
          const found = employees.find(emp =>
            emp.rut.replace(/[.\-\s]/g, '').toLowerCase() === rutValue.toLowerCase()
          );
          if (found) {
            setEmployee(found);
            setRut(rutValue);
            const st = await attendanceApi.getEmployeeStatus(found.id);
            setStatus(st);

            // Smart routing
            if (found.consent_status === 'approved' && found.photo_url && modelsLoaded) {
              setStep(STEP_FACE_VERIFY);
            } else if (found.personal_pin) {
              setStep(STEP_PIN_INPUT);
            } else {
              setStep(STEP_CAPTURE);
            }
            return;
          }
        }
      }
    } catch (e) { console.warn('Auto-identify failed:', e); }
    finally { setLoading(false); }
  }

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

      // Smart routing: decide method based on consent_status
      if (found.consent_status === 'approved' && found.photo_url && modelsLoaded) {
        // Biometric: face verification
        setStep(STEP_FACE_VERIFY);
        setFaceAttempts(0);
        setFaceStatus('scanning');
      } else if (found.personal_pin) {
        // PIN method
        setStep(STEP_PIN_INPUT);
      } else {
        // Fallback: simple photo capture (no face matching)
        setStep(STEP_CAPTURE);
      }
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
        notes: [
          location ? `GPS: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} (±${Math.round(location.accuracy)}m)` : 'Sin GPS',
          eventName ? `Evento: ${eventName}` : '',
        ].filter(Boolean).join(' | '),
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
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2">
            <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
            {tenantLogo && (
              <img src={tenantLogo} alt="Logo empresa" className="h-6 max-w-[80px] object-contain border-l border-gray-200 pl-2 ml-1" />
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
  // STEP: FACE VERIFICATION (auto-matching)
  // ========================
  if (step === STEP_FACE_VERIFY && employee) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2">
            <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
            {tenantLogo && <img src={tenantLogo} alt="" className="h-6 max-w-[80px] object-contain border-l border-gray-200 pl-2 ml-1" />}
          </div>
          {location && <div className="flex items-center gap-1 text-xs text-emerald-600"><Navigation className="w-3 h-3" />GPS</div>}
        </header>

        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            <p className="text-sm text-gray-500 mb-1">{employee.first_name} {employee.last_name}</p>
            <p className="text-lg font-bold text-gray-900 mb-4">
              {faceStatus === 'scanning' ? 'Verificando identidad...' : faceStatus === 'matched' ? '¡Verificado!' : 'No te reconocemos'}
            </p>

            {faceStatus !== 'failed' && (
              <>
                <div className="relative rounded-2xl overflow-hidden bg-black mx-auto mb-4" style={{ maxWidth: '280px' }}>
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{ width: 480, height: 480, facingMode: 'user' }}
                    className="w-full aspect-square object-cover"
                    mirrored={true}
                  />
                  {faceStatus === 'scanning' && (
                    <div className="absolute inset-0 border-4 border-primary-400/50 rounded-2xl pointer-events-none animate-pulse" />
                  )}
                  {faceStatus === 'matched' && (
                    <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle className="w-16 h-16 text-emerald-500" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-400">
                  {faceStatus === 'scanning' ? 'Mira la cámara de frente' : 'Registrando...'}
                </p>
              </>
            )}

            {faceStatus === 'failed' && (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-amber-800 text-sm font-medium">No pudimos verificar tu identidad</p>
                  <p className="text-amber-600 text-xs mt-1">Puedes marcar con tu PIN como alternativa</p>
                </div>
                {employee.personal_pin && (
                  <button
                    onClick={() => { setStep(STEP_PIN_INPUT); setFaceStatus('scanning'); }}
                    className="w-full py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition flex items-center justify-center gap-2"
                  >
                    <KeyRound className="w-5 h-5" /> Marcar con PIN
                  </button>
                )}
                <button
                  onClick={() => { setFaceStatus('scanning'); setFaceAttempts(0); }}
                  className="w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition"
                >
                  Reintentar con cámara
                </button>
              </div>
            )}

            <button
              onClick={() => { setStep(STEP_IDENTIFY); setEmployee(null); setRut(''); }}
              className="mt-6 text-sm text-gray-400 hover:text-gray-600"
            >
              ← Cambiar colaborador
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========================
  // STEP: PIN INPUT
  // ========================
  if (step === STEP_PIN_INPUT && employee) {
    async function handlePinSubmit(e) {
      e.preventDefault();
      setError('');
      setLoading(true);
      try {
        const res = await fetch('/api/attendance/pin-checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenant },
          body: JSON.stringify({ pin, action: status?.status === 'present' ? 'exit' : 'entry' }),
        });
        const data = await res.json();
        if (res.ok) {
          setConfirmData({
            type: status?.status === 'present' ? 'exit' : 'entry',
            time: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            location,
          });
          setStep(STEP_CONFIRMED);
          setTimeout(() => { setStep(STEP_IDENTIFY); setEmployee(null); setRut(''); setPin(''); setStatus(null); setConfirmData(null); }, 5000);
        } else {
          setError(data.error || 'PIN incorrecto');
        }
      } catch { setError('Error de conexión'); }
      finally { setLoading(false); }
    }

    const nextAction = status?.status === 'present' ? 'Salida' : 'Entrada';

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2">
            <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
            {tenantLogo && <img src={tenantLogo} alt="" className="h-6 max-w-[80px] object-contain border-l border-gray-200 pl-2 ml-1" />}
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-7 h-7 text-primary-600" />
            </div>
            <p className="text-sm text-gray-500 mb-1">{employee.first_name} {employee.last_name}</p>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Ingresa tu PIN</h2>
            <p className="text-sm text-gray-500 mb-6">Registrar <strong>{nextAction}</strong></p>

            {status?.status === 'exited' && (
              <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-emerald-800 font-semibold text-sm">Jornada completada</p>
                {status.entry_time && <p className="text-xs text-emerald-600 mt-1">Entrada: {status.entry_time} · Salida: {status.exit_time}</p>}
              </div>
            )}

            {status?.status !== 'exited' && (
              <>
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}

                <form onSubmit={handlePinSubmit}>
                  <input
                    type="password"
                    value={pin}
                    onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••"
                    required
                    autoFocus
                    inputMode="numeric"
                    className="w-full px-4 py-5 border border-gray-200 rounded-xl text-center text-3xl tracking-[0.5em] focus:ring-2 focus:ring-primary-500 outline-none mb-4"
                  />
                  <button
                    type="submit"
                    disabled={loading || pin.length < 4}
                    className="w-full py-4 bg-primary-600 text-white font-bold text-lg rounded-xl hover:bg-primary-700 transition disabled:opacity-50"
                  >
                    {loading ? 'Registrando...' : `Registrar ${nextAction}`}
                  </button>
                </form>
              </>
            )}

            <button
              onClick={() => { setStep(STEP_IDENTIFY); setEmployee(null); setRut(''); setPin(''); setError(''); }}
              className="mt-6 text-sm text-gray-400 hover:text-gray-600"
            >
              ← Cambiar colaborador
            </button>
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
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2">
            <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
            {tenantLogo && (
              <img src={tenantLogo} alt="Logo empresa" className="h-6 max-w-[80px] object-contain border-l border-gray-200 pl-2 ml-1" />
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
          <div className="text-center mb-3">
            <p className="text-lg font-bold text-gray-900">{employee.first_name} {employee.last_name}</p>
            <p className="text-sm text-gray-500">{employee.rut}</p>
            {status?.status === 'present' && status.last_record && (
              <p className="text-xs text-primary-600 mt-1">
                Ingreso hoy: {new Date(status.last_record.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs
              </p>
            )}
          </div>

          {/* Only show camera + buttons if NOT already completed */}
          {status?.status !== 'exited' && (
            <>
              {/* Camera - smaller to keep button visible */}
              <div className="relative rounded-2xl overflow-hidden bg-black mx-auto" style={{ maxWidth: '240px' }}>
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
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              {/* Event/location field */}
              <div className="mt-3 max-w-sm mx-auto">
                <input
                  type="text"
                  value={eventName}
                  onChange={e => setEventName(e.target.value)}
                  placeholder="¿En qué evento/lugar estás? (opcional)"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>
            </>
          )}

          {/* Action buttons - always visible */}
          <div className="mt-3 space-y-3 max-w-sm mx-auto">
            {canEntry && (
              <button
                onClick={() => handleRegister('entry')}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-5 bg-primary-600 text-white font-bold text-lg rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 shadow-lg shadow-primary-200/50 animate-pulse-subtle"
              >
                {loading ? <Loader className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                Registrar ingreso
              </button>
            )}
            {canExit && (
              <button
                onClick={() => handleRegister('exit')}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-5 bg-gray-900 text-white font-bold text-lg rounded-xl hover:bg-gray-800 transition-all disabled:opacity-50 shadow-lg"
              >
                {loading ? <Loader className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                Registrar salida
              </button>
            )}
            {status?.status === 'exited' && (
              <div className="text-center py-6 bg-emerald-50 border border-emerald-200 rounded-xl">
                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <p className="text-emerald-800 font-semibold mb-2">Jornada completada</p>
                <div className="flex items-center justify-center gap-4 text-sm text-emerald-700">
                  {status.entry_time && <span>Entrada: <strong>{status.entry_time}</strong></span>}
                  {status.exit_time && <span>Salida: <strong>{status.exit_time}</strong></span>}
                </div>
                {status.hours_worked && (
                  <p className="text-xs text-emerald-600 mt-2">Total: {status.hours_worked} horas</p>
                )}
                <p className="text-xs text-gray-400 mt-3">Nos vemos mañana</p>
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
