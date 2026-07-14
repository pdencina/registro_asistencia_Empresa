import { useState, useEffect, useRef } from 'react';
import { FileText, Plus, Trash2, Download, X, Calendar, User } from 'lucide-react';
import { medicalLeavesApi, employeesApi } from '../api';

export default function MedicalLeavesPage() {
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [form, setForm] = useState({
    employee_id: '', start_date: '', end_date: '', diagnosis: '',
    doctor_name: '', institution: '', notes: '', file_data: '', file_name: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => { loadData(); }, [filterEmployee]);

  async function loadData() {
    try {
      const [leavesData, empsData] = await Promise.all([
        medicalLeavesApi.getAll(filterEmployee ? { employee_id: filterEmployee } : {}),
        employeesApi.getAll({ active: '1' }),
      ]);
      setLeaves(leavesData);
      setEmployees(empsData);
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
      await medicalLeavesApi.create(form);
      setShowForm(false);
      setForm({ employee_id: '', start_date: '', end_date: '', diagnosis: '', doctor_name: '', institution: '', notes: '', file_data: '', file_name: '' });
      loadData();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id) {
    if (!confirm('¿Eliminar esta licencia médica?')) return;
    try {
      await medicalLeavesApi.delete(id);
      loadData();
    } catch (err) { console.error(err); }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo no debe superar 5 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm({ ...form, file_data: reader.result, file_name: file.name });
    };
    reader.readAsDataURL(file);
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
          <h2 className="text-2xl font-bold text-gray-900">Licencias Médicas</h2>
          <p className="text-sm text-gray-500 mt-1">Adjunta y gestiona licencias de tus colaboradores</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-all"
        >
          <Plus className="w-4 h-4" /> Nueva Licencia
        </button>
      </div>

      {/* Filter */}
      <div className="mb-6">
        <select
          value={filterEmployee}
          onChange={e => setFilterEmployee(e.target.value)}
          className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="">Todos los colaboradores</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} — {emp.rut}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {leaves.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay licencias médicas registradas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaves.map(leave => (
            <div key={leave.id} className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{leave.first_name} {leave.last_name}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  <span className="text-sm text-gray-500 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {leave.start_date} al {leave.end_date} ({leave.days} días)
                  </span>
                  {leave.diagnosis && (
                    <span className="text-sm text-gray-500">{leave.diagnosis}</span>
                  )}
                  {leave.doctor_name && (
                    <span className="text-xs text-gray-400">Dr. {leave.doctor_name}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {leave.file_url && (
                  <a
                    href={leave.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary-50 text-primary-600 rounded-lg text-xs font-medium hover:bg-primary-100 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {leave.file_name || 'Ver archivo'}
                  </a>
                )}
                <button
                  onClick={() => handleDelete(leave.id)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: New medical leave */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-gray-900">Nueva Licencia Médica</h3>
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
                <select
                  value={form.employee_id}
                  onChange={e => setForm({ ...form, employee_id: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Seleccionar...</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} — {emp.rut}</option>
                  ))}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Diagnóstico</label>
                <input type="text" value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })}
                  placeholder="Ej: Gripe, Esguince, Reposo..." className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Médico</label>
                  <input type="text" value={form.doctor_name} onChange={e => setForm({ ...form, doctor_name: e.target.value })}
                    placeholder="Nombre del doctor" className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Institución</label>
                  <input type="text" value={form.institution} onChange={e => setForm({ ...form, institution: e.target.value })}
                    placeholder="Clínica, Hospital..." className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  placeholder="Observaciones adicionales..." rows={2} className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
              </div>

              {/* File upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Archivo adjunto (PDF o imagen)</label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center">
                  {form.file_name ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 truncate">{form.file_name}</span>
                      <button type="button" onClick={() => setForm({ ...form, file_data: '', file_name: '' })} className="text-xs text-red-600 hover:text-red-700">Quitar</button>
                    </div>
                  ) : (
                    <>
                      <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileChange} className="hidden" />
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                        Seleccionar archivo
                      </button>
                      <p className="text-xs text-gray-400 mt-1">PDF, PNG o JPG. Máximo 5 MB.</p>
                    </>
                  )}
                </div>
              </div>

              <button type="submit" disabled={saving}
                className="w-full py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all disabled:opacity-50">
                {saving ? 'Guardando...' : 'Registrar Licencia'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
