import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';

export default function AdminLoginPage({ onLogin }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const { tenant } = useParams();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validar PIN contra el backend (que verifica el tenant)
      const res = await fetch('/api/auth/verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenant ? { 'x-tenant-slug': tenant } : {}),
        },
        body: JSON.stringify({ pin }),
      });

      if (res.ok) {
        sessionStorage.setItem('admin_auth', 'true');
        if (tenant) sessionStorage.setItem('admin_tenant', tenant);
        onLogin();
      } else {
        const data = await res.json();
        setError(data.error || 'PIN incorrecto');
        setPin('');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-primary-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Panel Administrador</h2>
        <p className="text-sm text-gray-500 mb-6">Ingresa el PIN de acceso</p>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 p-3 rounded-xl mb-4">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••"
              className="w-full px-4 py-4 border border-gray-200 rounded-xl text-center text-2xl tracking-widest focus:ring-2 focus:ring-primary-500 outline-none"
              inputMode="numeric"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <button type="submit" className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50" disabled={pin.length < 4 || loading}>
            {loading ? 'Verificando...' : 'Ingresar'}
          </button>
        </form>

        <a href="/" className="inline-block mt-4 text-sm text-gray-400 hover:text-gray-600">
          ← Volver al inicio
        </a>
      </div>
    </div>
  );
}
