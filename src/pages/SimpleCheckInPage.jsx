import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Loader, WifiOff } from 'lucide-react';
import { attendanceApi, employeesApi } from '../api';
import { addToQueue, getQueue, syncQueue } from '../utils/offlineQueue';

/**
 * Simplified check-in page for workers with low digital literacy.
 * URL: /simple/:tenant
 * 
 * Flow: RUT → Big green/red button → Full-screen confirmation
 * No camera, no GPS, no extra steps. Maximum simplicity.
 */
export default function SimpleCheckInPage() {
  const { tenant } = useParams();
  const [rut, setRut] = useState('');
  const [employee, setEmployee] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [error, setError] = useState('');
  const [time, setTime] = useState(new Date());
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(getQueue().length);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function goOnline() {
      setIsOffline(false);
      syncQueue().then(r => { if (r.synced > 0) setPendingCount(getQueue().length); });
    }
    function goOffline() { setIsOffline(true); }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

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

  async function handleFindEmployee(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const employees = await employeesApi.getAll({ search: rut });
      const found = employees.find(emp =>
        emp.rut.replace(/[.\-\s]/g, '').toLowerCase() === rut.replace(/[.\-\s]/g, '').toLowerCase()
      );

      if (!found) {
        setError('RUT no encontrado');
        setLoading(false);
        return;
      }

      setEmployee(found);

      try {
        const st = await attendanceApi.getEmployeeStatus(found.id);
        setStatus(st);
      } catch { setStatus(null); }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  async function handleMark(type) {
    if (!employee) return;
    setLoading(true);
    setError('');

    try {
      if (isOffline) {
        // Queue for later sync
        const count = addToQueue({
          employee_id: employee.id,
          type,
          tenant_slug: tenant,
          notes: 'Marcaje offline',
        });
        setPendingCount(count);
      } else {
        await attendanceApi.register({
          employee_id: employee.id,
          type,
        });
      }

      setConfirmed({
        type,
        time: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
        offline: isOffline,
      });

      // Reset after 5 seconds
      setTimeout(() => {
        setConfirmed(null);
        setEmployee(null);
        setStatus(null);
        setRut('');
      }, 5000);
    } catch (err) {
      // If network error, queue offline
      if (err.message?.includes('conexión') || err.message?.includes('fetch')) {
        const count = addToQueue({
          employee_id: employee.id,
          type,
          tenant_slug: tenant,
          notes: 'Marcaje offline (error de red)',
        });
        setPendingCount(count);
        setIsOffline(true);
        setConfirmed({
          type,
          time: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
          offline: true,
        });
        setTimeout(() => { setConfirmed(null); setEmployee(null); setStatus(null); setRut(''); }, 5000);
      } else {
        setError(err.message || 'Error al registrar');
      }
    } finally {
      setLoading(false);
    }
  }

  // CONFIRMED — Full screen green/orange
  if (confirmed) {
    const isEntry = confirmed.type === 'entry';
    return (
      <div className={`fixed inset-0 flex flex-col items-center justify-center p-8 ${
        isEntry ? 'bg-emerald-500' : 'bg-orange-500'
      }`}>
        <CheckCircle className="w-24 h-24 text-white mb-6" />
        <h1 className="text-4xl font-bold text-white mb-3">
          {isEntry ? '¡ENTRADA!' : '¡SALIDA!'}
        </h1>
        <p className="text-2xl text-white/90 mb-2">{employee?.first_name} {employee?.last_name}</p>
        <p className="text-3xl font-bold text-white">{confirmed.time}</p>
        {confirmed.offline && (
          <div className="mt-6 flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full">
            <WifiOff className="w-4 h-4 text-white" />
            <p className="text-white text-sm">Guardado offline — se sincronizará al volver la conexión</p>
          </div>
        )}
      </div>
    );
  }

  // MARK — Big buttons
  if (employee) {
    const canEntry = !status || status.status === 'absent';
    const canExit = status?.status === 'present';

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        {/* Clock */}
        <p className="text-5xl font-bold text-gray-900 mb-2">
          {time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-lg text-gray-500 mb-8">
          {time.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>

        {/* Employee name */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 px-8 py-5 mb-8 text-center">
          <p className="text-2xl font-bold text-gray-900">{employee.first_name} {employee.last_name}</p>
          <p className="text-gray-500">{employee.department || ''}</p>
        </div>

        {error && <p className="text-red-600 text-lg mb-4">{error}</p>}

        {/* Big buttons */}
        <div className="w-full max-w-sm space-y-4">
          {canEntry && (
            <button
              onClick={() => handleMark('entry')}
              disabled={loading}
              className="w-full py-8 bg-emerald-500 hover:bg-emerald-600 text-white text-3xl font-bold rounded-3xl shadow-lg active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? 'Registrando...' : 'ENTRADA'}
            </button>
          )}
          {canExit && (
            <button
              onClick={() => handleMark('exit')}
              disabled={loading}
              className="w-full py-8 bg-orange-500 hover:bg-orange-600 text-white text-3xl font-bold rounded-3xl shadow-lg active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? 'Registrando...' : 'SALIDA'}
            </button>
          )}
          {status?.status === 'exited' && (
            <div className="text-center py-8">
              <p className="text-xl text-gray-500">Ya completaste tu jornada hoy</p>
            </div>
          )}
        </div>

        <button
          onClick={() => { setEmployee(null); setRut(''); setError(''); }}
          className="mt-6 text-gray-400 text-lg"
        >
          ← Cambiar persona
        </button>
      </div>
    );
  }

  // RUT INPUT — Simple and big
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      {/* Clock */}
      <p className="text-4xl font-bold text-gray-900 mb-1">
        {time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
      <p className="text-gray-500 mb-10">
        {time.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Marcar Asistencia</h1>
      <p className="text-gray-500 mb-8 text-lg">Ingresa tu RUT</p>

      {isOffline && (
        <div className="flex items-center gap-2 bg-amber-100 text-amber-800 px-4 py-2 rounded-full mb-4">
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">Sin conexión — los registros se guardarán localmente</span>
        </div>
      )}

      {pendingCount > 0 && !isOffline && (
        <div className="flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full mb-4">
          <span className="text-sm font-medium">{pendingCount} registro(s) pendiente(s) de sincronizar</span>
        </div>
      )}

      {error && <p className="text-red-600 text-lg mb-4">{error}</p>}

      <form onSubmit={handleFindEmployee} className="w-full max-w-sm">
        <input
          type="text"
          value={rut}
          onChange={e => setRut(formatRut(e.target.value))}
          placeholder="12.345.678-9"
          required
          autoFocus
          inputMode="numeric"
          className="w-full px-6 py-5 border-2 border-gray-300 rounded-2xl text-center text-2xl focus:ring-4 focus:ring-primary-200 focus:border-primary-500 outline-none mb-4"
        />
        <button
          type="submit"
          disabled={loading || rut.length < 8}
          className="w-full py-5 bg-primary-600 text-white text-xl font-bold rounded-2xl hover:bg-primary-700 transition-all disabled:opacity-50"
        >
          {loading ? 'Buscando...' : 'CONTINUAR'}
        </button>
      </form>
    </div>
  );
}
