import { useState, useEffect } from 'react';
import { Clock, Plus, Trash2, X, Users, Star } from 'lucide-react';
import { schedulesApi, employeesApi, authorizersApi } from '../api';

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [authorizers, setAuthorizers] = useState([]);
  const [activeTab, setActiveTab] = useState('schedules'); // schedules | assign | authorizers
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', entry_time: '08:30', exit_time: '18:00', tolerance_minutes: 10, is_default: false, block2_entry_time: '', block2_exit_time: '', shift_type: 'fixed', rotation_days_on: '', rotation_days_off: '', rotation_start_date: '', weekly_hours: '' });
  const [showBlock2, setShowBlock2] = useState(false);
  const [newAuthorizer, setNewAuthorizer] = useState({ name: '', position: '' });
  const [assignData, setAssignData] = useState({ employee_id: '', schedule_id: '', custom_entry_time: '', custom_exit_time: '' });
  const [message, setMessage] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [sch, emp, auth] = await Promise.all([
        schedulesApi.getAll(),
        employeesApi.getAll({ active: '1' }),
        authorizersApi.getAll(),
      ]);
      setSchedules(sch);
      setEmployees(emp);
      setAuthorizers(auth);
    } catch (err) { console.error(err); }
  }

  async function handleCreateSchedule(e) {
    e.preventDefault();
    try {
      const payload = { ...formData };
      if (!showBlock2) {
        payload.block2_entry_time = null;
        payload.block2_exit_time = null;
      }
      if (payload.shift_type !== 'rotating') {
        payload.rotation_days_on = null;
        payload.rotation_days_off = null;
        payload.rotation_start_date = null;
      }
      if (payload.shift_type !== 'flexible') {
        payload.weekly_hours = null;
      }
      if (payload.shift_type === 'flexible') {
        payload.weekly_hours = parseInt(payload.weekly_hours) || null;
      }
      await schedulesApi.create(payload);
      setShowForm(false);
      setShowBlock2(false);
      setFormData({ name: '', entry_time: '08:30', exit_time: '18:00', tolerance_minutes: 10, is_default: false, block2_entry_time: '', block2_exit_time: '', shift_type: 'fixed', rotation_days_on: '', rotation_days_off: '', rotation_start_date: '', weekly_hours: '' });
      loadData();
      showMsg('Horario creado');
    } catch (err) { showMsg(err.message); }
  }

  async function handleDeleteSchedule(id) {
    try {
      await schedulesApi.delete(id);
      loadData();
      showMsg('Horario eliminado');
    } catch (err) { showMsg(err.message); }
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (!assignData.employee_id) return;
    try {
      await schedulesApi.assignSchedule(assignData);
      setAssignData({ employee_id: '', schedule_id: '', custom_entry_time: '', custom_exit_time: '' });
      showMsg('Horario asignado correctamente');
    } catch (err) { showMsg(err.message); }
  }

  async function handleCreateAuthorizer(e) {
    e.preventDefault();
    if (!newAuthorizer.name) return;
    try {
      await authorizersApi.create(newAuthorizer);
      setNewAuthorizer({ name: '', position: '' });
      loadData();
      showMsg('Autorizador agregado');
    } catch (err) { showMsg(err.message); }
  }

  async function handleDeleteAuthorizer(id) {
    try {
      await authorizersApi.delete(id);
      loadData();
      showMsg('Autorizador eliminado');
    } catch (err) { showMsg(err.message); }
  }

  function showMsg(text) {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Horarios y Autorizadores</h2>

      {message && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl text-sm font-medium flex items-center gap-2 animate-bounce pointer-events-auto">
            <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            {message}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: 'schedules', label: 'Horarios', icon: <Clock className="w-4 h-4" /> },
          { key: 'assign', label: 'Asignar', icon: <Users className="w-4 h-4" /> },
          { key: 'authorizers', label: 'Autorizadores', icon: <Star className="w-4 h-4" /> },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
              activeTab === tab.key ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ─── TAB: Horarios ─── */}
      {activeTab === 'schedules' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">Horarios Laborales</h3>
            <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:bg-primary-700">
              <Plus className="w-4 h-4" /> Nuevo
            </button>
          </div>

          <div className="space-y-3">
            {schedules.map(sch => (
              <div key={sch.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900">{sch.name}</p>
                    {sch.is_default && <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">Por defecto</span>}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {sch.shift_type === 'flexible' ? (
                      <span className="text-indigo-600 font-medium">Flexible · {sch.weekly_hours}h/semana · Sin horario fijo</span>
                    ) : (
                      <>
                        {sch.entry_time?.slice(0,5)} — {sch.exit_time?.slice(0,5)} · {sch.tolerance_minutes} min tolerancia
                        {sch.block2_entry_time && sch.block2_exit_time && (
                          <span className="ml-2 text-primary-600 font-medium">+ Bloque 2: {sch.block2_entry_time?.slice(0,5)} — {sch.block2_exit_time?.slice(0,5)}</span>
                        )}
                        {sch.shift_type === 'rotating' && (
                          <span className="ml-2 text-purple-600 font-medium">· Rotativo {sch.rotation_days_on}x{sch.rotation_days_off}</span>
                        )}
                      </>
                    )}
                  </p>
                </div>
                <button onClick={() => handleDeleteSchedule(sch.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {schedules.length === 0 && <p className="text-gray-400 text-center py-4">No hay horarios configurados</p>}
          </div>

          {/* Form modal */}
          {showForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold">Nuevo Horario</h3>
                  <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <form onSubmit={handleCreateSchedule} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                    <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                      required placeholder="Ej: Jornada Completa, Media Jornada"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Entrada</label>
                      <input type="time" value={formData.entry_time} onChange={e => setFormData({...formData, entry_time: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Salida</label>
                      <input type="time" value={formData.exit_time} onChange={e => setFormData({...formData, exit_time: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tolerancia (minutos)</label>
                    <input type="number" value={formData.tolerance_minutes} onChange={e => setFormData({...formData, tolerance_minutes: parseInt(e.target.value) || 0})}
                      min="0" max="60"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none" />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.is_default} onChange={e => setFormData({...formData, is_default: e.target.checked})}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600" />
                    <span className="text-sm text-gray-700">Horario por defecto</span>
                  </label>

                  {/* Block 2 (Split shift) */}
                  <div className="border-t border-gray-200 pt-4">
                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                      <input type="checkbox" checked={showBlock2} onChange={e => setShowBlock2(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600" />
                      <span className="text-sm text-gray-700 font-medium">Jornada partida (2 bloques)</span>
                    </label>
                    {showBlock2 && (
                      <div className="grid grid-cols-2 gap-3 bg-blue-50 p-3 rounded-xl">
                        <div>
                          <label className="block text-xs font-medium text-blue-700 mb-1">Bloque 2 — Entrada</label>
                          <input type="time" value={formData.block2_entry_time} onChange={e => setFormData({...formData, block2_entry_time: e.target.value})}
                            className="w-full px-3 py-2 border border-blue-200 rounded-lg outline-none text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-blue-700 mb-1">Bloque 2 — Salida</label>
                          <input type="time" value={formData.block2_exit_time} onChange={e => setFormData({...formData, block2_exit_time: e.target.value})}
                            className="w-full px-3 py-2 border border-blue-200 rounded-lg outline-none text-sm" />
                        </div>
                        <p className="col-span-2 text-xs text-blue-600">Ej: Bloque 1 (08:00-13:00), Bloque 2 (15:00-18:00)</p>
                      </div>
                    )}
                  </div>

                  {/* Rotating shifts */}
                  <div className="border-t border-gray-200 pt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de turno</label>
                    <select value={formData.shift_type} onChange={e => setFormData({...formData, shift_type: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none mb-3">
                      <option value="fixed">Fijo (Lunes a Viernes)</option>
                      <option value="rotating">Rotativo (por ciclo)</option>
                      <option value="flexible">Flexible (horas semanales)</option>
                    </select>

                    {formData.shift_type === 'flexible' && (
                      <div className="bg-indigo-50 p-3 rounded-xl space-y-3 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-indigo-700 mb-1">Horas contratadas por semana</label>
                          <input type="number" value={formData.weekly_hours || ''} onChange={e => setFormData({...formData, weekly_hours: e.target.value})}
                            min="1" max="60" placeholder="Ej: 30"
                            className="w-full px-3 py-2 border border-indigo-200 rounded-lg outline-none text-sm" />
                        </div>
                        <p className="text-xs text-indigo-600">Sin hora de entrada/salida fija. Solo se controla el total semanal. No genera atrasos.</p>
                      </div>
                    )}

                    {formData.shift_type === 'rotating' && (
                      <div className="bg-purple-50 p-3 rounded-xl space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-purple-700 mb-1">Días de trabajo</label>
                            <input type="number" value={formData.rotation_days_on} onChange={e => setFormData({...formData, rotation_days_on: e.target.value})}
                              min="1" max="30" placeholder="Ej: 4"
                              className="w-full px-3 py-2 border border-purple-200 rounded-lg outline-none text-sm" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-purple-700 mb-1">Días de descanso</label>
                            <input type="number" value={formData.rotation_days_off} onChange={e => setFormData({...formData, rotation_days_off: e.target.value})}
                              min="1" max="30" placeholder="Ej: 4"
                              className="w-full px-3 py-2 border border-purple-200 rounded-lg outline-none text-sm" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-purple-700 mb-1">Fecha inicio del ciclo</label>
                          <input type="date" value={formData.rotation_start_date} onChange={e => setFormData({...formData, rotation_start_date: e.target.value})}
                            className="w-full px-3 py-2 border border-purple-200 rounded-lg outline-none text-sm" />
                        </div>
                        <p className="text-xs text-purple-600">Ej: 4x4 = 4 días trabajando, 4 días libres. 7x7 = una semana sí, una no.</p>
                      </div>
                    )}
                  </div>

                  <button type="submit" className="btn-primary w-full">Crear Horario</button>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB: Asignar ─── */}
      {activeTab === 'assign' && (
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-4">Asignar Horario a Colaborador</h3>
          <form onSubmit={handleAssign} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador</label>
              <select value={assignData.employee_id} onChange={e => setAssignData({...assignData, employee_id: e.target.value})}
                required className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none">
                <option value="">Seleccionar colaborador...</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} — {emp.rut}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Horario predefinido</label>
              <select value={assignData.schedule_id} onChange={e => setAssignData({...assignData, schedule_id: e.target.value})}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none">
                <option value="">Usar horario personalizado</option>
                {schedules.map(sch => (
                  <option key={sch.id} value={sch.id}>{sch.name} ({sch.entry_time?.slice(0,5)} - {sch.exit_time?.slice(0,5)})</option>
                ))}
              </select>
            </div>
            {!assignData.schedule_id && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Entrada personalizada</label>
                  <input type="time" value={assignData.custom_entry_time} onChange={e => setAssignData({...assignData, custom_entry_time: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Salida personalizada</label>
                  <input type="time" value={assignData.custom_exit_time} onChange={e => setAssignData({...assignData, custom_exit_time: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none" />
                </div>
              </div>
            )}
            <button type="submit" className="btn-primary w-full">Asignar Horario</button>
          </form>
        </div>
      )}

      {/* ─── TAB: Autorizadores ─── */}
      {activeTab === 'authorizers' && (
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-4">Autorizadores de Salida Anticipada</h3>
          <p className="text-sm text-gray-500 mb-4">
            Personas que pueden autorizar la salida anticipada de un colaborador.
          </p>

          {/* List */}
          <div className="space-y-2 mb-6">
            {authorizers.map(auth => (
              <div key={auth.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-medium text-gray-900">{auth.name}</p>
                  {auth.position && <p className="text-xs text-gray-500">{auth.position}</p>}
                </div>
                <button onClick={() => handleDeleteAuthorizer(auth.id)} className="p-2 text-gray-400 hover:text-red-600 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {authorizers.length === 0 && <p className="text-gray-400 text-sm text-center py-4">No hay autorizadores</p>}
          </div>

          {/* Add form */}
          <form onSubmit={handleCreateAuthorizer} className="flex gap-3">
            <input value={newAuthorizer.name} onChange={e => setNewAuthorizer({...newAuthorizer, name: e.target.value})}
              required placeholder="Nombre completo"
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500" />
            <input value={newAuthorizer.position} onChange={e => setNewAuthorizer({...newAuthorizer, position: e.target.value})}
              placeholder="Cargo (opcional)"
              className="flex-1 px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-500" />
            <button type="submit" className="px-4 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700">
              <Plus className="w-5 h-5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
