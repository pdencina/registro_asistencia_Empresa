import { useState, useEffect, useRef } from 'react';
import Webcam from 'react-webcam';
import * as faceapi from 'face-api.js';
import { LogIn, LogOut, XCircle, Loader, Scan, Fingerprint, AlertTriangle, Eye, KeyRound, CheckCircle } from 'lucide-react';
import { employeesApi, attendanceApi, tardinessApi, earlyExitApi, authorizersApi, schedulesApi } from '../api';
import { playSuccess, playError, playRecognized } from '../utils/sounds';
import { LivenessDetector } from '../utils/livenessDetection';

// Estados del flujo
const STEP_SELECT = 'select';
const STEP_HOME = 'home';
const STEP_PIN_INPUT = 'pin_input';
const STEP_SCANNING = 'scanning';
const STEP_LIVENESS = 'liveness';
const STEP_RECOGNIZED = 'recognized';
const STEP_EARLY_EXIT = 'early_exit';
const STEP_CONFIRMED = 'confirmed';
const STEP_ERROR = 'error';

export default function CheckInPage() {
  const [step, setStep] = useState(STEP_SELECT);
  const [employees, setEmployees] = useState([]);
  const [recognizedEmployee, setRecognizedEmployee] = useState(null);
  const [employeeStatus, setEmployeeStatus] = useState(null);
  const [employeeTardiness, setEmployeeTardiness] = useState(null);
  const [employeeSchedule, setEmployeeSchedule] = useState(null);
  const [confirmData, setConfirmData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [modelLoadError, setModelLoadError] = useState('');
  const [tenantLogo, setTenantLogo] = useState(null);
  const [faceMatcher, setFaceMatcher] = useState(null);
  const [loadingDescriptors, setLoadingDescriptors] = useState(false);
  // Early exit state
  const [earlyExitReason, setEarlyExitReason] = useState('');
  const [earlyExitAuthorizer, setEarlyExitAuthorizer] = useState('');
  const [earlyExitNotes, setEarlyExitNotes] = useState('');
  const [authorizers, setAuthorizers] = useState([]);
  // Liveness detection
  const [livenessStatus, setLivenessStatus] = useState('waiting'); // waiting | confirmed | failed
  const livenessDetector = useRef(new LivenessDetector());
  const livenessInterval = useRef(null);

  const webcamRef = useRef(null);
  const detectionInterval = useRef(null);

  // Load tenant logo
  useEffect(() => {
    async function loadLogo() {
      try {
        // Extraer slug del tenant desde la URL
        const path = window.location.pathname;
        const match = path.match(/^\/(app|admin|marcar|pin)\/([^/]+)/);
        const slug = match ? match[2] : null;
        const res = await fetch('/api/settings/logo', {
          headers: slug ? { 'x-tenant-slug': slug } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data.logo_url) setTenantLogo(data.logo_url);
        }
      } catch (e) {}
    }
    loadLogo();
  }, []);

  // Load face-api models on mount
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
        console.error('Error loading models:', err);
        setModelLoadError('Error cargando modelos de reconocimiento facial');
      }
    }
    loadModels();
  }, []);

  // Load employees and build face descriptors
  useEffect(() => {
    if (modelsLoaded) loadEmployeesAndDescriptors();
  }, [modelsLoaded]);

  async function loadEmployeesAndDescriptors() {
    setLoadingDescriptors(true);
    try {
      const data = await employeesApi.getAll({ active: '1' });
      setEmployees(data);

      const labeledDescriptors = [];
      for (const emp of data) {
        if (!emp.photo_url) continue;
        // Solo usar empleados que hayan autorizado el uso biométrico
        if (emp.consent_status && emp.consent_status !== 'approved') continue;
        try {
          const img = await faceapi.fetchImage(emp.photo_url);
          const detection = await faceapi
            .detectSingleFace(img)
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (detection) {
            labeledDescriptors.push(
              new faceapi.LabeledFaceDescriptors(emp.id, [detection.descriptor])
            );
          }
        } catch (err) {
          console.warn(`No se pudo procesar foto de ${emp.first_name}:`, err.message);
        }
      }

      if (labeledDescriptors.length > 0) {
        setFaceMatcher(new faceapi.FaceMatcher(labeledDescriptors, 0.5));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDescriptors(false);
    }
  }

  // Detection loop — only when scanning
  useEffect(() => {
    if (step === STEP_SCANNING && modelsLoaded && faceMatcher) {
      startDetection();
    }
    return () => stopDetection();
  }, [step, modelsLoaded, faceMatcher]);

  // Timeout: volver al home si no detecta rostro en 30 segundos
  useEffect(() => {
    if (step === STEP_SCANNING) {
      const timeout = setTimeout(() => {
        resetFlow();
      }, 30000);
      return () => clearTimeout(timeout);
    }
  }, [step]);

  function startDetection() {
    if (detectionInterval.current) return;
    detectionInterval.current = setInterval(detectFace, 1500);
  }

  function stopDetection() {
    if (detectionInterval.current) {
      clearInterval(detectionInterval.current);
      detectionInterval.current = null;
    }
  }

  async function detectFace() {
    if (!webcamRef.current || !webcamRef.current.video || !faceMatcher) return;
    const video = webcamRef.current.video;
    if (video.readyState !== 4) return;

    try {
      const detection = await faceapi
        .detectSingleFace(video)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        const match = faceMatcher.findBestMatch(detection.descriptor);
        if (match.label !== 'unknown') {
          const employee = employees.find(e => e.id === match.label);
          if (employee) {
            stopDetection();
            setRecognizedEmployee(employee);
            playRecognized();
            // Get status
            try {
              const status = await attendanceApi.getEmployeeStatus(employee.id);
              setEmployeeStatus(status);
            } catch (e) {
              setEmployeeStatus(null);
            }
            // Get tardiness info
            try {
              const tardiness = await tardinessApi.get(employee.id, 'week');
              setEmployeeTardiness(tardiness);
            } catch (e) {
              setEmployeeTardiness(null);
            }
            // Get schedule
            try {
              const schedule = await schedulesApi.getEmployeeSchedule(employee.id);
              setEmployeeSchedule(schedule);
            } catch (e) {
              setEmployeeSchedule(null);
            }
            // Go directly to recognized (liveness disabled for now)
            setStep(STEP_RECOGNIZED);
          }
        }
      }
    } catch (err) {
      // Silent fail
    }
  }

  async function handleRegister(type) {
    if (!recognizedEmployee) return;
    setLoading(true);
    setErrorMsg('');

    try {
      // Use employeeStatus which already correctly knows today's state
      const status = employeeStatus || await attendanceApi.getEmployeeStatus(recognizedEmployee.id);

      if (type === 'entry') {
        // Can't entry if already present or exited
        if (status.status === 'present' || status.status === 'exited') {
          setErrorMsg('Ya registraste tu ingreso hoy');
          setLoading(false);
          return;
        }
      }

      if (type === 'exit') {
        // Can't exit if absent (no entry today)
        if (status.status === 'absent') {
          setErrorMsg('Debes registrar tu ingreso antes de marcar salida');
          setLoading(false);
          return;
        }
        // Can't exit if already exited
        if (status.status === 'exited') {
          setErrorMsg('Ya registraste tu salida hoy');
          setLoading(false);
          return;
        }

        // Check if early exit
        if (employeeSchedule && employeeSchedule.exit_time) {
          const now = new Date();
          const exitTimeClean = employeeSchedule.exit_time.slice(0, 5); // "18:00:00" -> "18:00"
          const [exitH, exitM] = exitTimeClean.split(':').map(Number);
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const exitMinutes = exitH * 60 + exitM;

          if (currentMinutes < exitMinutes - 10) {
            // Early exit detected — show form
            setLoading(false);
            try {
              const auths = await authorizersApi.getAll();
              setAuthorizers(auths);
            } catch (e) {}
            setStep(STEP_EARLY_EXIT);
            return;
          }
        }
      }

      await doRegister(type);
    } catch (err) {
      setErrorMsg(err.message);
      playError();
    } finally {
      setLoading(false);
    }
  }

  async function doRegister(type, earlyExitData = null) {
    setLoading(true);
    try {
      let photo_snapshot = null;
      if (webcamRef.current) {
        photo_snapshot = webcamRef.current.getScreenshot();
      }

      const result = await attendanceApi.register({
        employee_id: recognizedEmployee.id,
        type,
        photo_snapshot,
      });

      // Email notification is now sent automatically by the register endpoint

      // Save early exit info if applicable
      if (earlyExitData) {
        try {
          await earlyExitApi.create({
            attendance_record_id: result.id,
            employee_id: recognizedEmployee.id,
            reason: earlyExitData.reason,
            authorized_by: earlyExitData.authorized_by || null,
            notes: earlyExitData.notes || null,
          });
        } catch (e) {
          console.error('Error saving early exit:', e);
        }
      }

      // Get summary for confirmation screen
      const today = new Date().toISOString().split('T')[0];
      let todayEntry = null;
      let todayExit = null;
      try {
        const allToday = await attendanceApi.getHistory({
          employee_id: recognizedEmployee.id,
          start_date: today,
          end_date: today,
        });
        const entry = allToday.find(r => r.type === 'entry');
        const exit = allToday.find(r => r.type === 'exit');
        if (entry) todayEntry = new Date(entry.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        if (exit) todayExit = new Date(exit.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      } catch (e) {}

      setConfirmData({
        actionType: type,
        employee: `${recognizedEmployee.first_name} ${recognizedEmployee.last_name}`,
        time: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        todayEntry,
        todayExit,
        tardiness: employeeTardiness,
      });

      playSuccess();
      setStep(STEP_CONFIRMED);
      setTimeout(() => resetFlow(), 6000);
    } catch (err) {
      setErrorMsg(err.message);
      playError();
    } finally {
      setLoading(false);
    }
  }

  async function handleEarlyExitSubmit() {
    if (!earlyExitReason) {
      setErrorMsg('Selecciona un motivo');
      return;
    }
    if (earlyExitReason === 'authorized' && !earlyExitAuthorizer) {
      setErrorMsg('Selecciona quién te autorizó');
      return;
    }
    setErrorMsg('');
    await doRegister('exit', {
      reason: earlyExitReason,
      authorized_by: earlyExitReason === 'authorized' ? earlyExitAuthorizer : null,
      notes: earlyExitNotes,
    });
    // Reset early exit state
    setEarlyExitReason('');
    setEarlyExitAuthorizer('');
    setEarlyExitNotes('');
  }

  function resetFlow() {
    setStep(STEP_SELECT);
    setRecognizedEmployee(null);
    setEmployeeStatus(null);
    setEmployeeTardiness(null);
    setEmployeeSchedule(null);
    setConfirmData(null);
    setErrorMsg('');
    setEarlyExitReason('');
    setEarlyExitAuthorizer('');
    setEarlyExitNotes('');
  }

  function startScanning() {
    setStep(STEP_SCANNING);
  }

  function cancelRecognition() {
    resetFlow();
  }

  // Auto-return to home if employee already completed their day
  useEffect(() => {
    if (step === STEP_RECOGNIZED && employeeStatus?.status === 'exited') {
      const timer = setTimeout(() => resetFlow(), 3000);
      return () => clearTimeout(timer);
    }
  }, [step, employeeStatus]);

  // Timeout: volver al home si no interactúa en 15 segundos
  useEffect(() => {
    if (step === STEP_RECOGNIZED && employeeStatus?.status !== 'exited') {
      const timeout = setTimeout(() => resetFlow(), 15000);
      return () => clearTimeout(timeout);
    }
  }, [step, employeeStatus]);

  // Liveness detection loop
  useEffect(() => {
    if (step === STEP_LIVENESS) {
      livenessInterval.current = setInterval(async () => {
        if (!webcamRef.current || !webcamRef.current.video) return;
        const result = await livenessDetector.current.checkFrame(webcamRef.current.video);
        if (result.blinkDetected) {
          clearInterval(livenessInterval.current);
          livenessInterval.current = null;
          setLivenessStatus('confirmed');
          playSuccess();
          // Move to recognized step
          setTimeout(() => setStep(STEP_RECOGNIZED), 500);
        }
      }, 200);

      // Timeout: if no blink in 15 seconds, fail
      const timeout = setTimeout(() => {
        if (livenessInterval.current) {
          clearInterval(livenessInterval.current);
          livenessInterval.current = null;
        }
        setLivenessStatus('failed');
        setTimeout(() => resetFlow(), 3000);
      }, 15000);

      return () => {
        if (livenessInterval.current) clearInterval(livenessInterval.current);
        clearTimeout(timeout);
      };
    }
  }, [step]);

  const videoConstraints = {
    width: 640,
    height: 480,
    facingMode: 'user',
  };

  // ═══════════════════════════════════════════════════════════
  // STEP: SELECT — Elegir método de marcaje
  // ═══════════════════════════════════════════════════════════
  if (step === STEP_SELECT) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 bg-gray-50">
        <div className="text-center max-w-sm w-full">
          {tenantLogo ? (
            <img src={tenantLogo} alt="Logo empresa" className="h-16 mx-auto mb-8 max-w-[200px] object-contain" />
          ) : (
            <img src="/logo-flexio.svg" alt="Flexio" className="h-8 mx-auto mb-8" />
          )}
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Registrar asistencia</h2>
          <p className="text-sm text-gray-500 mb-10">Selecciona tu método de marcaje</p>

          <div className="space-y-4">
            <button
              onClick={() => setStep(STEP_HOME)}
              className="w-full p-6 bg-white border-2 border-gray-200 rounded-2xl hover:border-primary-300 hover:shadow-lg transition-all text-left flex items-center gap-4 group"
            >
              <div className="w-14 h-14 bg-primary-100 rounded-xl flex items-center justify-center group-hover:bg-primary-200 transition-colors">
                <Scan className="w-7 h-7 text-primary-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-lg">Reconocimiento facial</p>
                <p className="text-sm text-gray-500">Acércate a la cámara para identificarte</p>
              </div>
            </button>

            <button
              onClick={() => setStep(STEP_PIN_INPUT)}
              className="w-full p-6 bg-white border-2 border-gray-200 rounded-2xl hover:border-primary-300 hover:shadow-lg transition-all text-left flex items-center gap-4 group"
            >
              <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-gray-200 transition-colors">
                <Fingerprint className="w-7 h-7 text-gray-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-lg">Marcar con PIN</p>
                <p className="text-sm text-gray-500">Ingresa tu PIN personal</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP: PIN_INPUT — Marcaje por PIN integrado en punto de registro
  // ═══════════════════════════════════════════════════════════
  if (step === STEP_PIN_INPUT) {
    return <KioskPinMode onDone={resetFlow} />;
  }

  // ═══════════════════════════════════════════════════════════
  // STEP: HOME — Pantalla de bienvenida (reconocimiento facial)
  // ═══════════════════════════════════════════════════════════
  if (step === STEP_HOME) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 animate-fade-in bg-gradient-to-br from-slate-50 via-white to-primary-50">
        <div className="text-center max-w-md">
          <div className="w-28 h-28 bg-gradient-to-br from-primary-100 to-primary-200 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-primary-100">
            <Fingerprint className="w-16 h-16 text-primary-600" />
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-3">Registra tu asistencia</h2>
          <p className="text-lg text-gray-500 mb-10">
            Presiona el botón y acércate a la cámara para identificarte
          </p>

          {modelsLoaded && faceMatcher ? (
            <button
              onClick={startScanning}
              className="w-full py-5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-2xl
                         font-bold text-xl shadow-xl shadow-primary-200/50 transition-all active:scale-95 hover:scale-[1.02]
                         flex items-center justify-center gap-3"
            >
              <Scan className="w-7 h-7" />
              Iniciar Reconocimiento
            </button>
          ) : modelsLoaded && !faceMatcher && !loadingDescriptors ? (
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200">
              <p className="text-amber-700 font-medium">No hay colaboradores con foto registrada</p>
              <p className="text-amber-600 text-sm mt-1">Contacta al administrador</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Loader className="w-10 h-10 text-primary-500 animate-spin" />
              <p className="text-gray-500">
                {!modelsLoaded ? 'Cargando sistema...' : 'Preparando reconocimiento...'}
              </p>
            </div>
          )}

          {modelLoadError && (
            <div className="mt-6 p-4 bg-red-50 rounded-2xl border border-red-200">
              <p className="text-red-700">{modelLoadError}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP: SCANNING — Cámara activa buscando rostro
  // ═══════════════════════════════════════════════════════════
  if (step === STEP_SCANNING) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 bg-gray-50">
        <div className="w-full max-w-sm">
          {/* Camera with oval mask */}
          <div className="relative mx-auto" style={{width: '320px', height: '400px'}}>
            {/* Video feed */}
            <div className="absolute inset-0 rounded-[2rem] overflow-hidden bg-gray-200">
              <Webcam
                ref={webcamRef}
                audio={false}
                screenshotFormat="image/jpeg"
                videoConstraints={{...videoConstraints, width: 480, height: 600}}
                className="w-full h-full object-cover"
                mirrored={true}
              />
            </div>

            {/* Oval guide overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <svg className="w-full h-full" viewBox="0 0 320 400" fill="none">
                {/* Dark mask with oval cutout */}
                <defs>
                  <mask id="oval-mask">
                    <rect width="320" height="400" fill="white"/>
                    <ellipse cx="160" cy="185" rx="110" ry="140" fill="black"/>
                  </mask>
                </defs>
                <rect width="320" height="400" fill="rgba(249,250,251,0.85)" mask="url(#oval-mask)" rx="32"/>
                {/* Oval border */}
                <ellipse cx="160" cy="185" rx="110" ry="140" stroke="#2563eb" strokeWidth="2.5" fill="none" opacity="0.6"/>
              </svg>
            </div>
          </div>

          {/* Instructions below camera */}
          <div className="text-center mt-6">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
              <p className="text-sm font-medium text-gray-700">Posiciona tu rostro dentro del óvalo</p>
            </div>
            <p className="text-xs text-gray-400">Mantenlo centrado y mira directamente a la cámara</p>
          </div>

          {/* Cancel */}
          <button onClick={cancelRecognition} className="w-full mt-8 py-3 text-gray-400 hover:text-gray-600 text-sm transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP: LIVENESS — Verificación de parpadeo anti-spoofing
  // ═══════════════════════════════════════════════════════════
  if (step === STEP_LIVENESS && recognizedEmployee) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 animate-fade-in">
        <div className="w-full max-w-md text-center">
          {/* Camera for liveness */}
          <div className="relative rounded-3xl overflow-hidden bg-black shadow-xl mb-6 mx-auto" style={{ maxWidth: '320px' }}>
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              className="w-full aspect-square object-cover"
              mirrored={true}
            />
            <div className="absolute inset-0 border-4 border-primary-400/50 rounded-3xl pointer-events-none" />
          </div>

          {livenessStatus === 'waiting' && (
            <>
              <div className="flex items-center justify-center gap-2 mb-3">
                <Eye className="w-6 h-6 text-primary-600 animate-pulse" />
                <h3 className="text-xl font-bold text-gray-900">Verificación de Identidad</h3>
              </div>
              <p className="text-gray-600 text-lg mb-2">
                Hola, {recognizedEmployee.first_name}
              </p>
              <p className="text-primary-600 font-medium text-lg animate-pulse">
                👁️ Parpadea mirando la cámara
              </p>
              <p className="text-gray-400 text-sm mt-3">Esto confirma que eres una persona real</p>
            </>
          )}

          {livenessStatus === 'confirmed' && (
            <div className="text-emerald-600">
              <p className="text-xl font-bold">✓ Identidad verificada</p>
            </div>
          )}

          {livenessStatus === 'failed' && (
            <div className="text-red-600">
              <p className="text-xl font-bold mb-2">No se detectó parpadeo</p>
              <p className="text-gray-500 text-sm">Volviendo al inicio...</p>
            </div>
          )}

          <button onClick={cancelRecognition} className="mt-6 text-gray-400 hover:text-gray-600 text-sm">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP: RECOGNIZED — Empleado reconocido, elige acción
  // ═══════════════════════════════════════════════════════════
  if (step === STEP_RECOGNIZED && recognizedEmployee) {
    // Determinar qué botones mostrar según el status
    const alreadyEntry = employeeStatus?.status === 'present' || employeeStatus?.status === 'exited';
    const alreadyExit = employeeStatus?.status === 'exited';

    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 bg-gray-50">
        {/* Webcam oculta para snapshot */}
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={videoConstraints}
          className="hidden"
          mirrored={true}
        />

        <div className="w-full max-w-sm">
          {/* Avatar y saludo */}
          <div className="text-center mb-8">
            <div className="w-24 h-24 rounded-full bg-gray-200 overflow-hidden mx-auto mb-5 ring-[3px] ring-primary-200 shadow-lg">
              {recognizedEmployee.photo_url ? (
                <img src={recognizedEmployee.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-2xl bg-gray-100">
                  {recognizedEmployee.first_name[0]}{recognizedEmployee.last_name[0]}
                </div>
              )}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1">
              {recognizedEmployee.first_name} {recognizedEmployee.last_name}
            </h2>
            <p className="text-sm text-gray-400">
              {recognizedEmployee.department || ''}{recognizedEmployee.department && recognizedEmployee.position ? ' · ' : ''}{recognizedEmployee.position || ''}
            </p>

            {/* Status info */}
            {employeeStatus?.status === 'present' && employeeStatus.last_record && (
              <p className="text-xs text-primary-600 mt-4 bg-primary-50 inline-block px-3 py-1.5 rounded-full border border-primary-100">
                Ingreso registrado a las {new Date(employeeStatus.last_record.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs
              </p>
            )}
            {employeeStatus?.status === 'exited' && (
              <p className="text-xs text-gray-500 mt-4 bg-gray-100 inline-block px-3 py-1.5 rounded-full">
                Jornada completada — volviendo al inicio...
              </p>
            )}
            {/* Tardiness alert */}
            {employeeTardiness && employeeTardiness.tardy_count > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left">
                <div className="flex items-center gap-2 text-amber-700 font-medium text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  {employeeTardiness.tardy_count} {employeeTardiness.tardy_count === 1 ? 'atraso' : 'atrasos'} esta semana
                </div>
              </div>
            )}
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-xl text-center">
              <p className="text-red-700 text-sm font-medium">{errorMsg}</p>
            </div>
          )}

          {/* Botones */}
          <div className="space-y-3 mb-6">
            <button
              onClick={() => handleRegister('entry')}
              disabled={loading || alreadyEntry}
              className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl
                         font-semibold text-base transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
                         ${alreadyEntry 
                           ? 'bg-gray-100 text-gray-400 border border-gray-200' 
                           : 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-200/50'
                         }`}
            >
              <LogIn className="w-5 h-5" />
              {alreadyEntry ? 'Ingreso ya registrado' : 'Registrar ingreso'}
            </button>

            <button
              onClick={() => handleRegister('exit')}
              disabled={loading || alreadyExit || !alreadyEntry}
              className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl
                         font-semibold text-base transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed
                         ${alreadyExit || !alreadyEntry
                           ? 'bg-gray-100 text-gray-400 border border-gray-200' 
                           : 'bg-gray-900 hover:bg-gray-800 text-white shadow-lg shadow-gray-300/50'
                         }`}
            >
              <LogOut className="w-5 h-5" />
              {alreadyExit ? 'Salida ya registrada' : !alreadyEntry ? 'Primero registra ingreso' : 'Registrar salida'}
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-gray-500 mb-4">
              <Loader className="w-5 h-5 animate-spin" />
              <span>Registrando...</span>
            </div>
          )}

          <button onClick={cancelRecognition} className="w-full py-3 text-gray-400 hover:text-gray-600 text-sm">
            No soy esta persona
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP: EARLY EXIT — Salida anticipada, pide motivo
  // ═══════════════════════════════════════════════════════════
  if (step === STEP_EARLY_EXIT && recognizedEmployee) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 animate-fade-in">
        <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg"
          videoConstraints={videoConstraints} className="hidden" mirrored={true} />

        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Salida Anticipada</h3>
            <p className="text-gray-500 mt-1">
              Tu horario de salida es a las {employeeSchedule?.exit_time?.slice(0, 5)} hrs
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-center">
              <p className="text-red-700 text-sm font-medium">{errorMsg}</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">¿Cuál es el motivo?</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { value: 'medical', label: '🏥 Hora médica' },
                  { value: 'personal', label: '👤 Motivo personal' },
                  { value: 'authorized', label: '✅ Autorizado por jefatura' },
                  { value: 'other', label: '📝 Otro motivo' },
                ].map(opt => (
                  <button key={opt.value}
                    onClick={() => { setEarlyExitReason(opt.value); setErrorMsg(''); }}
                    className={`p-3 rounded-xl text-left text-sm font-medium transition-all ${
                      earlyExitReason === opt.value
                        ? 'bg-primary-50 border-2 border-primary-400 text-primary-700'
                        : 'bg-gray-50 border-2 border-gray-100 text-gray-700 hover:bg-gray-100'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {earlyExitReason === 'authorized' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">¿Quién te autorizó?</label>
                <div className="grid grid-cols-1 gap-2">
                  {authorizers.map(auth => (
                    <button key={auth.id}
                      onClick={() => { setEarlyExitAuthorizer(auth.id); setErrorMsg(''); }}
                      className={`p-3 rounded-xl text-left text-sm transition-all ${
                        earlyExitAuthorizer === auth.id
                          ? 'bg-primary-50 border-2 border-primary-400 text-primary-700 font-medium'
                          : 'bg-gray-50 border-2 border-gray-100 text-gray-700 hover:bg-gray-100'
                      }`}>
                      {auth.name}{auth.position ? ` · ${auth.position}` : ''}
                    </button>
                  ))}
                  {authorizers.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-2">No hay autorizadores configurados</p>
                  )}
                </div>
              </div>
            )}

            {(earlyExitReason === 'other' || earlyExitReason === 'personal') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
                <input value={earlyExitNotes} onChange={e => setEarlyExitNotes(e.target.value)}
                  placeholder="Breve descripción..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
            )}

            <button onClick={handleEarlyExitSubmit} disabled={loading}
              className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold text-lg transition-all active:scale-95 disabled:opacity-50">
              {loading ? 'Registrando...' : 'Confirmar Salida'}
            </button>

            <button onClick={cancelRecognition} className="w-full py-2 text-gray-400 hover:text-gray-600 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // STEP: CONFIRMED — Registro exitoso
  // ═══════════════════════════════════════════════════════════
  if (step === STEP_CONFIRMED && confirmData) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] p-6 animate-fade-in">
        <div className="w-full max-w-md p-10 rounded-3xl text-center bg-white border-2 border-emerald-200 shadow-xl">
          <div className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${
            confirmData.actionType === 'entry' ? 'bg-emerald-100' : 'bg-orange-100'
          }`}>
            {confirmData.actionType === 'entry' ? (
              <LogIn className="w-14 h-14 text-emerald-600" />
            ) : (
              <LogOut className="w-14 h-14 text-orange-600" />
            )}
          </div>

          <p className={`text-3xl font-bold mb-2 ${
            confirmData.actionType === 'entry' ? 'text-emerald-700' : 'text-orange-700'
          }`}>
            {confirmData.actionType === 'entry' ? '¡Ingreso Registrado!' : '¡Salida Registrada!'}
          </p>

          <p className="text-xl text-gray-700 mb-4">{confirmData.employee}</p>

          {/* Resumen del día */}
          <div className="bg-gray-50 rounded-2xl p-4 mt-4 space-y-2">
            {confirmData.actionType === 'entry' ? (
              <div className="flex items-center justify-center gap-2 text-gray-600">
                <LogIn className="w-5 h-5 text-emerald-500" />
                <span>Tu ingreso hoy: <strong>{confirmData.time} hrs</strong></span>
              </div>
            ) : (
              <>
                {confirmData.todayEntry && (
                  <div className="flex items-center justify-center gap-2 text-gray-600">
                    <LogIn className="w-5 h-5 text-emerald-500" />
                    <span>Ingreso: <strong>{confirmData.todayEntry} hrs</strong></span>
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 text-gray-600">
                  <LogOut className="w-5 h-5 text-orange-500" />
                  <span>Salida: <strong>{confirmData.time} hrs</strong></span>
                </div>
                {confirmData.todayEntry && (
                  <p className="text-sm text-gray-400 mt-2 pt-2 border-t border-gray-200">
                    ¡Buen trabajo hoy! 🙌
                  </p>
                )}
              </>
            )}
          </div>

          <p className="text-sm text-gray-400 mt-6">Volviendo al inicio...</p>
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}


// Componente de marcaje por PIN integrado en el punto de registro
function KioskPinMode({ onDone }) {
  const [pin, setPin] = useState('');
  const [employee, setEmployee] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(null);

  async function handlePinSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const tenantSlug = window.location.pathname.match(/\/app\/([^/]+)/)?.[1] || '';
      const res = await fetch('/api/attendance/pin-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
        body: JSON.stringify({ pin, action: 'identify' }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmployee(data.employee);
        setStatus(data.status);
      } else {
        setError(data.error || 'PIN no reconocido');
        setPin('');
      }
    } catch { setError('Error de conexión'); }
    finally { setLoading(false); }
  }

  async function handleRegister(type) {
    setLoading(true);
    setError('');
    try {
      const tenantSlug = window.location.pathname.match(/\/app\/([^/]+)/)?.[1] || '';
      const res = await fetch('/api/attendance/pin-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
        body: JSON.stringify({ pin, action: type }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfirmed({ type, time: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) });
        setTimeout(() => onDone(), 4000);
      } else { setError(data.error || 'Error al registrar'); }
    } catch { setError('Error de conexión'); }
    finally { setLoading(false); }
  }

  // Confirmado
  if (confirmed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 bg-gray-50">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {confirmed.type === 'entry' ? 'Ingreso' : 'Salida'} registrado
        </h2>
        <p className="text-lg text-gray-700">{confirmed.time} hrs</p>
        <p className="text-sm text-gray-400 mt-2">Método: PIN personal</p>
      </div>
    );
  }

  // Elegir acción
  if (employee) {
    const canEntry = !status || status.status === 'absent';
    const canExit = status?.status === 'present';
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 bg-gray-50">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold text-gray-400">
            {employee.first_name[0]}{employee.last_name[0]}
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">{employee.first_name} {employee.last_name}</h2>
          <p className="text-sm text-gray-500 mb-6">{employee.department || ''}</p>

          {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl mb-4">{error}</p>}

          <div className="space-y-3">
            {canEntry && (
              <button onClick={() => handleRegister('entry')} disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50">
                {loading ? <Loader className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />} Registrar ingreso
              </button>
            )}
            {canExit && (
              <button onClick={() => handleRegister('exit')} disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-4 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 disabled:opacity-50">
                {loading ? <Loader className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />} Registrar salida
              </button>
            )}
            {status?.status === 'exited' && <p className="text-gray-500 text-sm py-4">Jornada completada hoy</p>}
          </div>
          <button onClick={onDone} className="mt-4 text-sm text-gray-400 hover:text-gray-600">← Volver</button>
        </div>
      </div>
    );
  }

  // Ingresar PIN
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 bg-gray-50">
      <div className="w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <KeyRound className="w-8 h-8 text-primary-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Ingresa tu PIN</h2>
        <p className="text-sm text-gray-500 mb-6">PIN personal de 4 dígitos</p>

        {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl mb-4">{error}</p>}

        <form onSubmit={handlePinSubmit}>
          <input type="password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••" required autoFocus inputMode="numeric"
            className="w-full px-4 py-5 border border-gray-200 rounded-xl text-center text-3xl tracking-[0.5em] focus:ring-2 focus:ring-primary-500 outline-none mb-4" />
          <button type="submit" disabled={loading || pin.length < 4}
            className="w-full py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 disabled:opacity-50">
            {loading ? 'Verificando...' : 'Continuar'}
          </button>
        </form>
        <button onClick={onDone} className="mt-4 text-sm text-gray-400 hover:text-gray-600">← Volver al inicio</button>
      </div>
    </div>
  );
}
