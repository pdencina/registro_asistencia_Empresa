import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { KeyRound, LogIn, LogOut, CheckCircle, Loader, UserPlus } from 'lucide-react';
import { attendanceApi } from '../api';

const STEP_PIN = 'pin';
const STEP_CREATE_PIN = 'create_pin';
const STEP_ACTION = 'action';
const STEP_CONFIRMED = 'confirmed';

export default function PinCheckInPage() {
  const { tenant } = useParams();
  const [step, setStep] = useState(STEP_PIN);
  const [pin, setPin] = useState('');
  const [employee, setEmployee] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmData, setConfirmData] = useState(null);
  const [tenantLogo, setTenantLogo] = useState(null);

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

  async function handlePinSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/attendance/pin-checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenant ? { 'x-tenant-slug': tenant } : {}),
        },
        body: JSON.stringify({ pin, action: 'identify' }),
      });

      const data = await res.json();

      if (res.ok) {
        setEmployee(data.employee);
        setStatus(data.status);
        setStep(STEP_ACTION);
      } else {
        setError(data.error || 'PIN no reconocido');
        setPin('');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(type) {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/attendance/pin-checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenant ? { 'x-tenant-slug': tenant } : {}),
        },
        body: JSON.stringify({ pin, action: type }),
      });

      const data = await res.json();

      if (res.ok) {
        setConfirmData({
          type,
          time: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        });
        setStep(STEP_CONFIRMED);
        setTimeout(() => resetFlow(), 5000);
      } else {
        setError(data.error || 'Error al registrar');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  function resetFlow() {
    setStep(STEP_PIN);
    setPin('');
    setEmployee(null);
    setStatus(null);
    setError('');
    setConfirmData(null);
  }

  // CREATE PIN flow
  const [createRut, setCreateRut] = useState('');
  const [createPin, setCreatePin] = useState('');
  const [createPinConfirm, setCreatePinConfirm] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  function formatRutCreate(value) {
    let cleaned = value.replace(/[^0-9kK]/g, '');
    if (cleaned.length > 9) cleaned = cleaned.slice(0, 9);
    if (cleaned.length > 1) {
      const body = cleaned.slice(0, -1);
      const dv = cleaned.slice(-1);
      const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return `${formatted}-${dv}`;
    }
    return cleaned;
  }

  async function handleCreatePin(e) {
    e.preventDefault();
    setError('');
    setCreateSuccess('');

    if (createPin.length < 4) {
      setError('El PIN debe tener al menos 4 dígitos');
      return;
    }
    if (createPin !== createPinConfirm) {
      setError('Los PIN no coinciden');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/create-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenant ? { 'x-tenant-slug': tenant } : {}),
        },
        body: JSON.stringify({ rut: createRut, pin: createPin }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreateSuccess(`PIN creado para ${data.employee.first_name}. Ya puedes usarlo para marcar.`);
        setTimeout(() => {
          setStep(STEP_PIN);
          setCreateRut('');
          setCreatePin('');
          setCreatePinConfirm('');
          setCreateSuccess('');
        }, 3000);
      } else {
        setError(data.error || 'Error al crear PIN');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  // STEP: Ingresar PIN
  if (step === STEP_PIN) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
          {tenantLogo && (
            <img src={tenantLogo} alt="Logo empresa" className="h-6 max-w-[80px] object-contain border-l border-gray-200 pl-2 ml-1" />
          )}
          <span className="text-xs text-gray-400">Marcaje por PIN</span>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <KeyRound className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Marcaje por PIN</h1>
            <p className="text-sm text-gray-500 mb-8">Ingresa tu PIN personal para registrar asistencia</p>

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
                placeholder="••••••"
                required
                autoFocus
                inputMode="numeric"
                className="w-full px-4 py-5 border border-gray-200 rounded-xl text-center text-3xl tracking-[0.5em] focus:ring-2 focus:ring-primary-500 outline-none mb-4"
              />
              <button
                type="submit"
                disabled={loading || pin.length < 4}
                className="w-full py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50"
              >
                {loading ? 'Verificando...' : 'Ingresar'}
              </button>
            </form>

            <button
              onClick={() => { setStep(STEP_CREATE_PIN); setError(''); }}
              className="mt-6 text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              ¿No tienes PIN? Créalo aquí
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STEP: Crear PIN
  if (step === STEP_CREATE_PIN) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
          <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
          {tenantLogo && (
            <img src={tenantLogo} alt="Logo empresa" className="h-6 max-w-[80px] object-contain border-l border-gray-200 pl-2 ml-1" />
          )}
          <span className="text-xs text-gray-400">Crear PIN</span>
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserPlus className="w-8 h-8 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Crear tu PIN</h1>
              <p className="text-sm text-gray-500">Ingresa tu RUT y elige un PIN de 4-6 dígitos</p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {createSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-emerald-700 text-sm font-medium">{createSuccess}</p>
              </div>
            )}

            {!createSuccess && (
              <form onSubmit={handleCreatePin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tu RUT</label>
                  <input
                    type="text"
                    value={createRut}
                    onChange={e => setCreateRut(formatRutCreate(e.target.value))}
                    placeholder="12.345.678-9"
                    required
                    inputMode="numeric"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-center focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Elige tu PIN (4-6 dígitos)</label>
                  <input
                    type="password"
                    value={createPin}
                    onChange={e => setCreatePin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••"
                    required
                    inputMode="numeric"
                    className="w-full px-4 py-4 border border-gray-200 rounded-xl text-center text-2xl tracking-[0.3em] focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirma tu PIN</label>
                  <input
                    type="password"
                    value={createPinConfirm}
                    onChange={e => setCreatePinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••"
                    required
                    inputMode="numeric"
                    className="w-full px-4 py-4 border border-gray-200 rounded-xl text-center text-2xl tracking-[0.3em] focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || createPin.length < 4 || createRut.length < 8}
                  className="w-full py-4 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  {loading ? 'Creando...' : 'Crear mi PIN'}
                </button>
              </form>
            )}

            <button
              onClick={() => { setStep(STEP_PIN); setError(''); setCreateSuccess(''); }}
              className="block mx-auto mt-4 text-sm text-gray-400 hover:text-gray-600"
            >
              ← Volver a ingresar PIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STEP: Elegir acción
  if (step === STEP_ACTION && employee) {
    const canEntry = !status || status.status === 'absent';
    const canExit = status?.status === 'present';

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
          {tenantLogo && (
            <img src={tenantLogo} alt="Logo empresa" className="h-6 max-w-[80px] object-contain border-l border-gray-200 pl-2 ml-1" />
          )}
        </header>

        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-gray-400">
              {employee.first_name[0]}{employee.last_name[0]}
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">{employee.first_name} {employee.last_name}</h2>
            <p className="text-sm text-gray-500 mb-6">{employee.department || ''}</p>

            {status?.status === 'present' && status.last_record && (
              <p className="text-xs text-primary-600 bg-primary-50 inline-block px-3 py-1.5 rounded-full mb-6">
                Ingreso: {new Date(status.last_record.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })} hrs
              </p>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <div className="space-y-3">
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
                <div className="text-center py-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-emerald-800 font-semibold text-sm">Jornada completada</p>
                  <div className="flex items-center justify-center gap-3 text-xs text-emerald-700 mt-1">
                    {status.entry_time && <span>Entrada: <strong>{status.entry_time}</strong></span>}
                    {status.exit_time && <span>Salida: <strong>{status.exit_time}</strong></span>}
                  </div>
                  {status.hours_worked && (
                    <p className="text-xs text-emerald-600 mt-1">Total: {status.hours_worked}h</p>
                  )}
                </div>
              )}
            </div>

            <button onClick={resetFlow} className="mt-4 text-sm text-gray-400 hover:text-gray-600">
              ← Cambiar usuario
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STEP: Confirmado
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
          <p className="text-sm text-gray-400 mt-3">Método: PIN personal</p>
          <p className="text-xs text-gray-400 mt-4">Volviendo al inicio...</p>
        </div>
      </div>
    );
  }

  return null;
}
