import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint, Loader } from 'lucide-react';

export default function UniversalCheckInPage() {
  const [rut, setRut] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState(null);
  const navigate = useNavigate();

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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-center" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <img src="/logo-flexio.svg" alt="Flexio" className="h-6" />
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Fingerprint className="w-8 h-8 text-primary-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Marcar asistencia</h1>
          <p className="text-sm text-gray-500 mb-8">Ingresa tu RUT para registrar tu entrada o salida</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={rut}
              onChange={e => setRut(formatRut(e.target.value))}
              placeholder="12.345.678-9"
              required
              autoFocus
              inputMode="numeric"
              className="w-full px-4 py-4 border border-gray-200 rounded-xl text-center text-xl focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <button
              type="submit"
              disabled={loading || rut.length < 8}
              className="w-full py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Continuar'}
            </button>
          </form>

          <p className="text-xs text-gray-400 mt-6">
            Si no recuerdas tu RUT o tienes problemas, contacta a tu administrador.
          </p>
        </div>
      </div>
    </div>
  );
}
