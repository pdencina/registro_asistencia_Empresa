import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, Building2 } from 'lucide-react';

export default function LoginRedirectPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Buscar tenant por email
      const res = await fetch('/api/auth/find-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        const data = await res.json();
        navigate(`/admin/${data.slug}`);
      } else {
        setError('No encontramos una cuenta con ese email. Verifica o contacta a soporte.');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-8 h-8 text-primary-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Iniciar sesión</h2>
          <p className="text-sm text-gray-500">Ingresa tu email para acceder al panel de tu empresa</p>
        </div>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl mb-4 text-center">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email del administrador</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@empresa.cl"
              required
              autoFocus
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!email || loading}
            className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? 'Buscando...' : (
              <>Continuar <ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>

        <a href="/" className="block text-center mt-4 text-sm text-gray-400 hover:text-gray-600">
          ← Volver al inicio
        </a>
      </div>
    </div>
  );
}
