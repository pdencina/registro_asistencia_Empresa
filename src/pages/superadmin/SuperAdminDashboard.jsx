import { useState, useEffect } from 'react';
import { Building2, Users, Plus, Search, ToggleLeft, ToggleRight, Edit2, Trash2 } from 'lucide-react';
import CreateTenantModal from './CreateTenantModal';

export default function SuperAdminDashboard({ onLogout }) {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [stats, setStats] = useState({ total_tenants: 0, total_employees: 0, active_tenants: 0 });

  useEffect(() => { loadTenants(); }, []);

  async function loadTenants() {
    try {
      const token = sessionStorage.getItem('superadmin_token');
      const res = await fetch('/api/superadmin/tenants', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTenants(data.tenants || []);
        setStats(data.stats || stats);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleTenant(id, active) {
    const token = sessionStorage.getItem('superadmin_token');
    await fetch(`/api/superadmin/tenants`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active: !active }),
    });
    loadTenants();
  }

  const filtered = tenants.filter(t => {
    const term = search.toLowerCase();
    return t.name.toLowerCase().includes(term) || t.slug.toLowerCase().includes(term) || (t.admin_email || '').toLowerCase().includes(term);
  });

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo-flexio.svg" alt="Flexio" className="h-7 brightness-200" />
          <span className="text-sm text-gray-400 border-l border-gray-600 pl-3">Super Admin</span>
        </div>
        <button onClick={onLogout} className="text-sm text-gray-400 hover:text-red-400 transition-colors">
          Cerrar sesión
        </button>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">Empresas totales</p>
            <p className="text-3xl font-bold mt-1">{stats.total_tenants}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">Empresas activas</p>
            <p className="text-3xl font-bold mt-1 text-emerald-400">{stats.active_tenants}</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <p className="text-sm text-gray-400">Colaboradores totales</p>
            <p className="text-3xl font-bold mt-1 text-primary-400">{stats.total_employees}</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa..."
              className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-3 bg-primary-600 text-white font-medium rounded-xl hover:bg-primary-700 transition-all"
          >
            <Plus className="w-5 h-5" /> Nueva Empresa
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center text-gray-400 py-12">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">No hay empresas registradas</p>
            <button onClick={() => setShowCreate(true)} className="mt-4 text-primary-400 hover:text-primary-300 text-sm">
              Crear la primera empresa
            </button>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700 text-left text-sm text-gray-400">
                  <th className="px-5 py-3">Empresa</th>
                  <th className="px-5 py-3">Plan</th>
                  <th className="px-5 py-3">Colaboradores</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3">Creada</th>
                  <th className="px-5 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tenant => (
                  <tr key={tenant.id} className="border-b border-gray-700/50 hover:bg-gray-750">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
                          {tenant.logo_url ? (
                            <img src={tenant.logo_url} alt="" className="w-full h-full object-contain p-1" />
                          ) : (
                            <Building2 className="w-4 h-4 text-gray-500" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-white">{tenant.name}</p>
                          <p className="text-xs text-gray-400">flexio.cl/app/{tenant.slug}</p>
                          <p className="text-xs text-gray-500">{tenant.admin_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        tenant.plan === 'enterprise' ? 'bg-purple-500/20 text-purple-300' :
                        tenant.plan === 'profesional' ? 'bg-primary-500/20 text-primary-300' :
                        'bg-gray-600/30 text-gray-300'
                      }`}>
                        {tenant.plan}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm">{tenant.employee_count || 0} / {tenant.max_employees}</span>
                    </td>
                    <td className="px-5 py-4">
                      {tenant.active ? (
                        <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full">Activo</span>
                      ) : (
                        <span className="text-xs bg-red-500/20 text-red-300 px-2 py-1 rounded-full">Pausado</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-400">
                      {new Date(tenant.created_at).toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleTenant(tenant.id, tenant.active)}
                          className={`p-1.5 rounded-lg transition-all ${tenant.active ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-gray-500 hover:bg-gray-600/30'}`}
                          title={tenant.active ? 'Pausar' : 'Activar'}
                        >
                          {tenant.active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(tenant)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Eliminar empresa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear empresa */}
      {showCreate && (
        <CreateTenantModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadTenants(); }}
        />
      )}

      {/* Modal confirmar eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl p-6 w-full max-w-sm border border-gray-700 text-center">
            <div className="w-14 h-14 bg-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-7 h-7 text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Eliminar empresa</h3>
            <p className="text-sm text-gray-400 mb-1">
              ¿Estás seguro de eliminar <strong className="text-white">{confirmDelete.name}</strong>?
            </p>
            <p className="text-xs text-red-400 mb-6">
              Se eliminarán todos los colaboradores, registros y datos asociados. Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-xl font-medium transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const token = sessionStorage.getItem('superadmin_token');
                  await fetch('/api/superadmin/tenants', {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: confirmDelete.id }),
                  });
                  setConfirmDelete(null);
                  loadTenants();
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-all"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
