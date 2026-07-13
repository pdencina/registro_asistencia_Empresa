import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { KeyRound, LogIn, LogOut, CheckCircle, Loader } from 'lucide-react';
import { attendanceApi } from '../api';

const STEP_PIN = 'pin';
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

  // STEP: Ingresar PIN
  if (step === STEP_PIN) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
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
                <p className="text-gray-500 text-sm py-4">Ya completaste tu jornada hoy</p>
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
