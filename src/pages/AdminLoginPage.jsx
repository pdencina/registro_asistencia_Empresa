import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, Mail, ArrowLeft, CheckCircle } from 'lucide-react';

export default function AdminLoginPage({ onLogin }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRecover, setShowRecover] = useState(false);
  const [recoverEmail, setRecoverEmail] = useState('');
  const [recoverSent, setRecoverSent] = useState(false);
  const [recoverLoading, setRecoverLoading] = useState(false);
  const { tenant } = useParams();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
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

  async function handleRecover(e) {
    e.preventDefault();
    setRecoverLoading(true);

    try {
      await fetch('/api/auth/recover-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenant ? { 'x-tenant-slug': tenant } : {}),
        },
        body: JSON.stringify({ email: recoverEmail }),
      });
      setRecoverSent(true);
    } catch {
      setRecoverSent(true); // Mostrar éxito de todas formas (seguridad)
    } finally {
      setRecoverLoading(false);
    }
  }

  // Vista de recuperación de PIN
  if (showRecover) {
    if (recoverSent) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-sm text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Revisa tu email</h2>
            <p className="text-sm text-gray-500 mb-6">
              Si el email es correcto, recibirás tu PIN de acceso en los próximos minutos.
            </p>
            <button onClick={() => { setShowRecover(false); setRecoverSent(false); setRecoverEmail(''); }} className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all">
              Volver al login
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Recuperar PIN</h2>
          <p className="text-sm text-gray-500 mb-6">
            Ingresa el email del administrador y te enviaremos el PIN de acceso.
          </p>
          <form onSubmit={handleRecover} className="space-y-4">
            <input
              type="email"
              value={recoverEmail}
              onChange={e => setRecoverEmail(e.target.value)}
              placeholder="admin@empresa.cl"
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none"
            />
            <button type="submit" disabled={recoverLoading} className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50">
              {recoverLoading ? 'Enviando...' : 'Enviar PIN por email'}
            </button>
          </form>
          <button onClick={() => setShowRecover(false)} className="inline-flex items-center gap-1 mt-4 text-sm text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" /> Volver al login
          </button>
        </div>
      </div>
    );
  }

  // Vista principal de login
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

        <button onClick={() => setShowRecover(true)} className="inline-block mt-4 text-sm text-primary-600 hover:text-primary-700 font-medium">
          ¿Olvidaste tu PIN?
        </button>
      </div>
    </div>
  );
}
