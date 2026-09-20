import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { KeyRound, CheckCircle, Loader, AlertTriangle } from 'lucide-react';

/**
 * Página pública para que el trabajador cree SU PIN de marcación con el enlace de un solo uso
 * que recibió por correo (Res. Ex. N.º 38, Art. 7 f). Ruta: /crear-pin/:tenant?token=...
 * Nadie de la empresa conoce el PIN.
 */
export default function SetPinPage() {
  const { tenant } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (pin !== confirm) { setError('Los PIN no coinciden.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenant },
        body: JSON.stringify({ token, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDone(true);
      else setError(data.error || 'No se pudo crear el PIN.');
    } catch {
      setError('Error de conexión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm text-center">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <h1 className="text-lg font-bold text-gray-900 mb-2">Enlace incompleto</h1>
          <p className="text-sm text-gray-600">Abre el enlace completo que recibiste por correo, o pide uno nuevo a tu empleador.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm text-center">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">PIN creado</h1>
          <p className="text-sm text-gray-600">Ya puedes marcar con tu RUT y tu PIN. Te enviamos un correo de confirmación. Si no fuiste tú, avisa a tu empleador.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow p-8 w-full max-w-sm">
        <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <KeyRound className="w-7 h-7 text-blue-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 text-center mb-1">Crea tu PIN de marcación</h1>
        <p className="text-sm text-gray-500 text-center mb-6">Elige un PIN numérico de 4 a 8 dígitos. Solo tú lo conocerás.</p>

        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="pin">PIN</label>
        <input
          id="pin" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8}
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg tracking-widest text-center mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />

        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="confirm">Repite tu PIN</label>
        <input
          id="confirm" type="password" inputMode="numeric" autoComplete="new-password" maxLength={8}
          value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
          className="w-full px-4 py-3 border border-gray-300 rounded-xl text-lg tracking-widest text-center mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />

        <p className="text-xs text-gray-500 mb-4">Evita repetir dígitos (1111) o secuencias (1234).</p>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-4" role="alert">{error}</p>}

        <button
          type="submit" disabled={loading || pin.length < 4}
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
        >
          {loading ? <Loader className="w-5 h-5 animate-spin" /> : 'Crear PIN'}
        </button>
      </form>
    </div>
  );
}
