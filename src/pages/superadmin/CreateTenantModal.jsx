import { useState } from 'react';
import { X, Building2, CheckCircle } from 'lucide-react';

export default function CreateTenantModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    slug: '',
    rut_empresa: '',
    admin_email: '',
    admin_pin: '',
    plan: 'basico',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  function handleSlug(name) {
    return name
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 30);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = sessionStorage.getItem('superadmin_token');
      const res = await fetch('/api/superadmin/tenants', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(data);
      } else {
        setError(data.error || 'Error al crear empresa');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md border border-gray-700 text-center">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Empresa creada</h3>
          <div className="bg-gray-900 rounded-xl p-4 text-left space-y-2 mb-6">
            <p className="text-sm text-gray-400">Empresa: <span className="text-white font-medium">{success.tenant?.name}</span></p>
            <p className="text-sm text-gray-400">URL: <span className="text-primary-400 font-medium">{success.tenant?.slug}.flexio.cl</span></p>
            <p className="text-sm text-gray-400">PIN Admin: <span className="text-white font-mono font-bold text-lg">{form.admin_pin}</span></p>
            <p className="text-sm text-gray-400">Plan: <span className="text-white">{success.tenant?.plan}</span></p>
            <p className="text-sm text-gray-400">Trial: <span className="text-emerald-400">15 días</span></p>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Comparte la URL y el PIN con el administrador de la empresa.
          </p>
          <button onClick={onCreated} className="w-full py-3 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700">
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-md border border-gray-700">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-primary-400" />
            <h3 className="text-lg font-bold text-white">Nueva Empresa</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Nombre empresa *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value, slug: handleSlug(e.target.value) })}
              placeholder="Constructora Acme Ltda"
              required
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Subdominio *</label>
            <div className="flex items-center">
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                placeholder="acme"
                required
                className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded-l-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none"
              />
              <span className="px-3 py-3 bg-gray-600 border border-gray-600 rounded-r-xl text-gray-400 text-sm">
                .flexio.cl
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">RUT empresa</label>
            <input
              value={form.rut_empresa}
              onChange={(e) => setForm({ ...form, rut_empresa: e.target.value })}
              placeholder="76.123.456-7"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email administrador *</label>
            <input
              type="email"
              value={form.admin_email}
              onChange={(e) => setForm({ ...form, admin_email: e.target.value })}
              placeholder="admin@empresa.cl"
              required
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">PIN de acceso admin *</label>
            <input
              type="text"
              value={form.admin_pin}
              onChange={(e) => setForm({ ...form, admin_pin: e.target.value.replace(/\D/g, '').slice(0, 6) })}
              placeholder="1234"
              required
              maxLength={6}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none font-mono text-lg tracking-widest"
            />
            <p className="text-xs text-gray-500 mt-1">4-6 dígitos. El cliente usará este PIN para acceder a su panel.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Plan</label>
            <select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl text-white focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="basico">Básico (30 colaboradores, 1 dispositivo)</option>
              <option value="profesional">Profesional (100 colaboradores, 3 dispositivos)</option>
              <option value="enterprise">Enterprise (ilimitado)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50 mt-2"
          >
            {loading ? 'Creando...' : 'Crear Empresa'}
          </button>
        </form>
      </div>
    </div>
  );
}
