import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

export default function AdminLoginPage({ onLogin }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // PIN configurable via variable de entorno, default: 1234
    const correctPin = import.meta.env.VITE_ADMIN_PIN || '1234';

    if (pin === correctPin) {
      sessionStorage.setItem('admin_auth', 'true');
      onLogin();
    } else {
      setError('PIN incorrecto');
      setPin('');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="card w-full max-w-sm text-center">
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
          <button type="submit" className="btn-primary w-full" disabled={pin.length < 4}>
            Ingresar
          </button>
        </form>

        <a href="/" className="inline-block mt-4 text-sm text-gray-400 hover:text-gray-600">
          ← Volver al registro
        </a>
      </div>
    </div>
  );
}
