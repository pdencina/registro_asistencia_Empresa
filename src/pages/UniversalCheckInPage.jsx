import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, Loader, Clock, ScanFace, KeyRound } from 'lucide-react';

export default function UniversalCheckInPage() {
  const [rut, setRut] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState(null);
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());

  // Live clock
  useState(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  });

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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/find-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut: rut.replace(/[.\-]/g, '') }),
      });

      const data = await res.json();

      if (res.ok) {
        // Si hay múltiples empresas, mostrar selector
        if (data.multiple && data.options) {
          setOptions(data.options);
        } else {
          redirectToCheckin(data);
        }
      } else {
        setError(data.error || 'RUT no encontrado en el sistema');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  function redirectToCheckin(data) {
    const cleanRut = rut.replace(/[.\-]/g, '');
    // Store identified employee in sessionStorage to avoid re-asking RUT
    sessionStorage.setItem('flexio_checkin_rut', cleanRut);
    sessionStorage.setItem('flexio_checkin_tenant', data.slug);
    if (data.employee) {
      sessionStorage.setItem('flexio_checkin_employee', JSON.stringify(data.employee));
    }
    if (data.method === 'pin') {
      navigate(`/pin/${data.slug}`);
    } else {
      navigate(`/marcar/${data.slug}`);
    }
  }

  // Si hay múltiples empresas, mostrar selector
  if (options) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-center">
          <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm text-center">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Selecciona tu empresa</h2>
            <p className="text-sm text-gray-500 mb-6">Tu RUT está asociado a más de una empresa</p>
            <div className="space-y-3">
              {options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => redirectToCheckin(opt)}
                  className="w-full p-4 bg-white border border-gray-200 rounded-xl text-left hover:border-primary-300 hover:shadow-md transition-all"
                >
                  <p className="font-semibold text-gray-900">{opt.tenant_name}</p>
                  <p className="text-xs text-gray-400 mt-1">flexio.cl/{opt.method === 'pin' ? 'pin' : 'marcar'}/{opt.slug}</p>
                </button>
              ))}
            </div>
            <button onClick={() => { setOptions(null); setRut(''); }} className="mt-4 text-sm text-gray-400 hover:text-gray-600">
              ← Volver
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
        <p className="text-sm font-bold text-primary-600 tabular-nums">
          {time.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          {/* Icon */}
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary-100">
              <ScanFace className="w-10 h-10 text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Marcar asistencia</h1>
            <p className="text-sm text-gray-500 mt-1">Ingresa tu RUT para registrar entrada o salida</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                value={rut}
                onChange={e => setRut(formatRut(e.target.value))}
                placeholder="12.345.678-9"
                required
                autoFocus
                inputMode="numeric"
                className="w-full px-4 py-4 border border-gray-200 rounded-xl text-center text-xl font-medium focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading || rut.length < 8}
              className="w-full py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Continuar'}
            </button>
          </form>

          {/* Quick access links */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center mb-3">Acceso rápido</p>
            <div className="flex gap-3">
              <a href="/mis-horas" className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-50 rounded-xl text-xs text-gray-600 hover:bg-gray-100 transition font-medium">
                <Clock className="w-3.5 h-3.5" /> Mis horas
              </a>
              <button
                onClick={() => {
                  const slug = prompt('Ingresa el código de tu empresa:');
                  if (slug) navigate(`/pin/${slug}`);
                }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-50 rounded-xl text-xs text-gray-600 hover:bg-gray-100 transition font-medium"
              >
                <KeyRound className="w-3.5 h-3.5" /> Marcar con PIN
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center mt-6">
            Si no recuerdas tu RUT o tienes problemas, contacta a tu administrador.
          </p>
        </div>
      </div>
    </div>
  );
}
