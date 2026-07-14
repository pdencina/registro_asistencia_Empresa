import { useState, useEffect } from 'react';
import { Calendar, Plus, CheckCircle, XCircle, Clock, X, User, Palmtree } from 'lucide-react';
import { leaveRequestsApi, employeesApi } from '../api';

const TYPE_LABELS = {
  vacation: { label: 'Vacaciones', color: 'bg-blue-100 text-blue-700' },
  personal: { label: 'Permiso Personal', color: 'bg-purple-100 text-purple-700' },
  medical: { label: 'Licencia Médica', color: 'bg-red-100 text-red-700' },
  family: { label: 'Asunto Familiar', color: 'bg-orange-100 text-orange-700' },
  other: { label: 'Otro', color: 'bg-gray-100 text-gray-700' },
};

const STATUS_LABELS = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700', icon: Clock },
  approved: { label: 'Aprobado', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  rejected: { label: 'Rechazado', color: 'bg-red-100 text-red-700', icon: XCircle },
};

export default function LeaveRequestsPage() {
  const [data, setData] = useState({ requests: [], balances: [] });
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [form, setForm] = useState({ employee_id: '', type: 'vacation', start_date: '', end_date: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('requests'); // requests | balances

  useEffect(() => { loadData(); }, [filterStatus]);

  async function loadData() {
    try {
      const [leaveData, emps] = await Promise.all([
        leaveRequestsApi.getAll(filterStatus ? { status: filterStatus } : {}),
        employeesApi.getAll({ active: '1' }),
      ]);
      setData(leaveData);
      setEmployees(emps);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.employee_id || !form.start_date || !form.end_date) {
      setError('Colaborador, fecha inicio y fin son obligatorios');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await leaveRequestsApi.create(form);
      setShowForm(false);
      setForm({ employee_id: '', type: 'vacation', start_date: '', end_date: '', reason: '' });
      loadData();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleApprove(id) {
    await leaveRequestsApi.approve(id, sessionStorage.getItem('admin_email') || 'Administrador');
    loadData();
  }

  async function handleReject(id) {
    const reason = prompt('Motivo del rechazo (opcional):');
    await leaveRequestsApi.reject(id, reason || '');
    loadData();
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta solicitud?')) return;
    await leaveRequestsApi.delete(id);
    loadData();
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Vacaciones y Permisos</h2>
          <p className="text-sm text-gray-500 mt-1">Solicitudes, aprobaciones y saldo de días</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-all"
        >
          <Plus className="w-4 h-4" /> Nueva Solicitud
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'requests' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Solicitudes
        </button>
        <button
          onClick={() => setActiveTab('balances')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'balances' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Saldo de Días
        </button>
      </div>

      {/* TAB: Solicitudes */}
      {activeTab === 'requests' && (
        <>
          {/* Filter */}
          <div className="mb-4">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            >
              <option value="">Todas las solicitudes</option>
              <option value="pending">Pendientes</option>
              <option value="approved">Aprobadas</option>
              <option value="rejected">Rechazadas</option>
            </select>
          </div>

          {/* Pending count */}
          {data.requests.filter(r => r.status === 'pending').length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <p className="text-sm text-amber-800 font-medium">
                {data.requests.filter(r => r.status === 'pending').length} solicitud(es) pendiente(s) de aprobación
              </p>
            </div>
          )}

          {/* List */}
          {data.requests.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Palmtree className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No hay solicitudes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.requests.map(req => {
                const typeInfo = TYPE_LABELS[req.type] || TYPE_LABELS.other;
                const statusInfo = STATUS_LABELS[req.status] || STATUS_LABELS.pending;
                const StatusIcon = statusInfo.icon;
                return (
                  <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden shrink-0">
                          {req.photo_url ? (
                            <img src={req.photo_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 font-bold text-xs">
                              {req.first_name?.[0]}{req.last_name?.[0]}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{req.first_name} {req.last_name}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                            <span className="text-xs text-gray-500">{req.start_date} al {req.end_date}</span>
                            <span className="text-xs text-gray-400">({req.days} días)</span>
                          </div>
                          {req.reason && <p className="text-xs text-gray-400 mt-1 truncate">{req.reason}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${statusInfo.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusInfo.label}
                        </span>

                        {req.status === 'pending' && (
                          <>
                            <button onClick={() => handleApprove(req.id)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Aprobar">
                              <CheckCircle className="w-5 h-5" />
                            </button>
                            <button onClick={() => handleReject(req.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Rechazar">
                              <XCircle className="w-5 h-5" />
                            </button>
                          </>
                        )}
                        <button onClick={() => handleDelete(req.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Eliminar">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TAB: Saldo de días */}
      {activeTab === 'balances' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 font-semibold text-gray-600">Colaborador</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-center">Acumulados</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-center">Usados</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-center">Disponibles</th>
              </tr>
            </thead>
            <tbody>
              {data.balances.map(emp => (
                <tr key={emp.employee_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{emp.first_name} {emp.last_name}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-gray-700 font-medium">{emp.days_accrued}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-medium ${emp.days_used > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{emp.days_used}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      emp.days_available > 5 ? 'bg-emerald-100 text-emerald-700' :
                      emp.days_available > 0 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {emp.days_available} días
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Nueva solicitud */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">Nueva Solicitud</h3>
              <button onClick={() => { setShowForm(false); setError(''); }} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador *</label>
                <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}
                  required className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="">Seleccionar...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="vacation">Vacaciones</option>
                  <option value="personal">Permiso Personal</option>
                  <option value="medical">Licencia Médica</option>
                  <option value="family">Asunto Familiar</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Desde *</label>
                  <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })}
                    required className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hasta *</label>
                  <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })}
                    required className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                  placeholder="Opcional..." rows={2} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>

              <button type="submit" disabled={saving}
                className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50">
                {saving ? 'Guardando...' : 'Crear Solicitud'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
