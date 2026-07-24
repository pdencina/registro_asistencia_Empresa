import { useState, useEffect } from 'react';
import { FileCheck, Plus, Trash2, Filter, Users } from 'lucide-react';
import { employeesApi } from '../api';

const TYPES = [
  { value: 'medical_leave', label: 'Licencia médica', icon: '🏥' },
  { value: 'authorized_leave', label: 'Permiso autorizado', icon: '✅' },
  { value: 'personal_errand', label: 'Trámite personal', icon: '📋' },
  { value: 'training', label: 'Capacitación', icon: '📚' },
  { value: 'bereavement', label: 'Duelo', icon: '🕯️' },
  { value: 'legal', label: 'Citación judicial/legal', icon: '⚖️' },
  { value: 'union', label: 'Actividad sindical', icon: '🤝' },
  { value: 'weather', label: 'Evento climático', icon: '🌧️' },
  { value: 'late_justified', label: 'Atraso justificado', icon: '⏰' },
  { value: 'other', label: 'Otro motivo', icon: '📝' },
];

function getTenantSlug() {
  const match = window.location.pathname.match(/\/admin\/([^/]+)/);
  return match ? match[1] : null;
}

async function apiRequest(url, options = {}) {
  const slug = getTenantSlug();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(slug ? { 'x-tenant-slug': slug } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status}`);
  }
  return res.json();
}

export default function JustificationsPage() {
  const [justifications, setJustifications] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [form, setForm] = useState({ employee_id: '', date: '', type: '', reason: '', covers: 'full_day' });

  useEffect(() => { loadData(); }, [filterEmployee]);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterEmployee) params.set('employee_id', filterEmployee);
      const data = await apiRequest(`/api/justifications?${params.toString()}`);
      setJustifications(data.justifications || []);

      if (employees.length === 0) {
        const emps = await employeesApi.getAll({ active: '1' });
        setEmployees(emps);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/api/justifications', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({ employee_id: '', date: '', type: '', reason: '', covers: 'full_day' });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar este justificativo?')) return;
    await apiRequest('/api/justifications', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    });
    loadData();
  }

  function getTypeLabel(value) {
    const t = TYPES.find(t => t.value === value);
    return t ? `${t.icon} ${t.label}` : value;
  }

  function getTypeColor(value) {
    const colors = {
      medical_leave: 'bg-red-50 text-red-700 border-red-200',
      authorized_leave: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      personal_errand: 'bg-blue-50 text-blue-700 border-blue-200',
      training: 'bg-purple-50 text-purple-700 border-purple-200',
      late_justified: 'bg-amber-50 text-amber-700 border-amber-200',
    };
    return colors[value] || 'bg-gray-50 text-gray-700 border-gray-200';
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Justificativos</h2>
          <p className="text-sm text-gray-500 mt-1">Ausencias y atrasos justificados (no cuentan en reportes)</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700 transition"
        >
          <Plus className="w-4 h-4" /> Agregar justificativo
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-6 bg-gray-50 p-3 rounded-xl">
        <Filter className="w-4 h-4 text-gray-400" />
        <select
          value={filterEmployee}
          onChange={e => setFilterEmployee(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="">Todos los colaboradores</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{justifications.length} registro(s)</span>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-center py-12 text-gray-400">Cargando...</p>
      ) : justifications.length === 0 ? (
        <div className="text-center py-16">
          <FileCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Sin justificativos registrados</p>
          <p className="text-gray-400 text-sm mt-1">Agrega uno para que no cuente como ausencia en los reportes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {justifications.map(j => (
            <div key={j.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="text-center shrink-0">
                    <p className="text-xs text-gray-400">{new Date(j.date).toLocaleDateString('es-CL', { weekday: 'short' })}</p>
                    <p className="text-lg font-bold text-gray-900">{new Date(j.date).getDate()}</p>
                    <p className="text-xs text-gray-400">{new Date(j.date).toLocaleDateString('es-CL', { month: 'short' })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-900 text-sm">{j.first_name} {j.last_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getTypeColor(j.type)}`}>
                        {getTypeLabel(j.type)}
                      </span>
                      {j.covers === 'tardiness' && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Solo atraso</span>
                      )}
                    </div>
                    {j.reason && <p className="text-xs text-gray-500 mt-1 truncate">{j.reason}</p>}
                  </div>
                </div>
                <button onClick={() => handleDelete(j.id)} className="p-2 text-gray-400 hover:text-red-500 transition shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Agregar Justificativo</h3>
              <p className="text-sm text-gray-500 mt-1">El día justificado no contará como ausencia ni atraso</p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador *</label>
                <select
                  value={form.employee_id}
                  onChange={e => setForm({ ...form, employee_id: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  <option value="">Seleccionar...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} — {emp.rut}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm({ ...form, date: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                <div className="grid grid-cols-2 gap-2">
                  {TYPES.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm({ ...form, type: t.value })}
                      className={`p-2.5 rounded-xl text-left text-sm transition border-2 ${
                        form.type === t.value
                          ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium'
                          : 'border-gray-100 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <span className="mr-1.5">{t.icon}</span>{t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cubre</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="covers" value="full_day" checked={form.covers === 'full_day'}
                      onChange={e => setForm({ ...form, covers: e.target.value })} className="text-primary-600" />
                    Día completo (ausencia)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="covers" value="tardiness" checked={form.covers === 'tardiness'}
                      onChange={e => setForm({ ...form, covers: e.target.value })} className="text-primary-600" />
                    Solo atraso
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo / Notas (opcional)</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  placeholder="Ej: Licencia médica 3 días, Control dentista, etc."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition">
                  Guardar justificativo
                </button>
                <button type="button" onClick={() => { setShowForm(false); setError(''); }}
                  className="px-5 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
