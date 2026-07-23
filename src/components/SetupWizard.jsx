import { useState } from 'react';
import { Upload, Users, Clock, Check, ArrowRight, ArrowLeft, X, Building2, Image } from 'lucide-react';
import { employeesApi, schedulesApi } from '../api';

const STEPS = [
  { id: 'welcome', title: 'Bienvenido', icon: Building2 },
  { id: 'logo', title: 'Logo', icon: Image },
  { id: 'schedule', title: 'Horario', icon: Clock },
  { id: 'employees', title: 'Colaboradores', icon: Users },
  { id: 'done', title: 'Listo', icon: Check },
];

export default function SetupWizard({ tenantName, onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoBase64, setLogoBase64] = useState(null);
  const [schedule, setSchedule] = useState({
    name: 'Jornada Completa',
    entry_time: '08:30',
    exit_time: '17:30',
    tolerance_minutes: 10,
    lunch_break_minutes: 60,
  });
  const [employees, setEmployees] = useState([{ first_name: '', last_name: '', rut: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const currentStep = STEPS[step];

  function handleLogoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('El logo no puede exceder 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(reader.result);
      setLogoBase64(reader.result);
      setError('');
    };
    reader.readAsDataURL(file);
  }

  async function saveLogo() {
    if (!logoBase64) return;
    try {
      await fetch('/api/settings/logo', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': getTenantSlugFromUrl(),
        },
        body: JSON.stringify({ logo: logoBase64 }),
      });
    } catch (e) {
      // Non-blocking, continue anyway
      console.warn('Logo upload failed:', e);
    }
  }

  async function saveSchedule() {
    try {
      await schedulesApi.create(schedule);
    } catch (e) {
      console.warn('Schedule creation failed:', e);
    }
  }

  async function saveEmployees() {
    const validEmployees = employees.filter(e => e.first_name.trim());
    for (const emp of validEmployees) {
      try {
        await employeesApi.create({
          first_name: emp.first_name.trim(),
          last_name: emp.last_name.trim(),
          rut: emp.rut.trim() || undefined,
        });
      } catch (e) {
        console.warn('Employee creation failed:', emp.first_name, e);
      }
    }
  }

  async function handleNext() {
    setError('');
    setSaving(true);

    try {
      if (currentStep.id === 'logo' && logoBase64) {
        await saveLogo();
      } else if (currentStep.id === 'schedule') {
        await saveSchedule();
      } else if (currentStep.id === 'employees') {
        await saveEmployees();
      }

      if (step < STEPS.length - 1) {
        setStep(step + 1);
      }
    } catch (e) {
      setError(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (step > 0) setStep(step - 1);
  }

  function addEmployee() {
    setEmployees([...employees, { first_name: '', last_name: '', rut: '' }]);
  }

  function updateEmployee(index, field, value) {
    const updated = [...employees];
    updated[index][field] = value;
    setEmployees(updated);
  }

  function removeEmployee(index) {
    if (employees.length === 1) return;
    setEmployees(employees.filter((_, i) => i !== index));
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Configuración Inicial</h2>
            <button onClick={onSkip} className="text-gray-400 hover:text-gray-600" title="Saltar">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress */}
          <div className="flex gap-1">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`h-1.5 flex-1 rounded-full transition ${i <= step ? 'bg-emerald-500' : 'bg-gray-200'}`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Step: Welcome */}
          {currentStep.id === 'welcome' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">¡Bienvenido a Flexio!</h3>
              <p className="text-gray-500 max-w-sm mx-auto">
                Configuremos <strong>{tenantName}</strong> en 3 pasos simples. 
                Toma menos de 5 minutos.
              </p>
            </div>
          )}

          {/* Step: Logo */}
          {currentStep.id === 'logo' && (
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Logo de tu empresa</h3>
              <p className="text-gray-500 text-sm mb-6">Aparecerá en el marcaje y reportes. Puedes cambiarlo después.</p>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-emerald-400 transition">
                {logoPreview ? (
                  <div className="flex flex-col items-center">
                    <img src={logoPreview} alt="Logo" className="w-32 h-32 object-contain mb-4" />
                    <button
                      onClick={() => { setLogoPreview(null); setLogoBase64(null); }}
                      className="text-sm text-red-500 hover:underline"
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center">
                    <Upload className="w-10 h-10 text-gray-400 mb-3" />
                    <span className="text-sm font-medium text-gray-700">Click para subir logo</span>
                    <span className="text-xs text-gray-400 mt-1">PNG, JPG o SVG · Máx 2 MB</span>
                    <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Step: Schedule */}
          {currentStep.id === 'schedule' && (
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Horario principal</h3>
              <p className="text-gray-500 text-sm mb-6">Define la jornada habitual. Podrás crear más horarios después.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del horario</label>
                  <input
                    type="text"
                    value={schedule.name}
                    onChange={e => setSchedule({ ...schedule, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Entrada</label>
                    <input
                      type="time"
                      value={schedule.entry_time}
                      onChange={e => setSchedule({ ...schedule, entry_time: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salida</label>
                    <input
                      type="time"
                      value={schedule.exit_time}
                      onChange={e => setSchedule({ ...schedule, exit_time: e.target.value })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tolerancia atraso (min)</label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={schedule.tolerance_minutes}
                      onChange={e => setSchedule({ ...schedule, tolerance_minutes: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pausa almuerzo (min)</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={schedule.lunch_break_minutes}
                      onChange={e => setSchedule({ ...schedule, lunch_break_minutes: parseInt(e.target.value) || 0 })}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step: Employees */}
          {currentStep.id === 'employees' && (
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Agrega colaboradores</h3>
              <p className="text-gray-500 text-sm mb-6">Mínimo 1 para comenzar. Podrás agregar más desde el panel.</p>

              <div className="space-y-3 max-h-60 overflow-y-auto">
                {employees.map((emp, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Nombre"
                        value={emp.first_name}
                        onChange={e => updateEmployee(i, 'first_name', e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                      <input
                        type="text"
                        placeholder="Apellido"
                        value={emp.last_name}
                        onChange={e => updateEmployee(i, 'last_name', e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                      <input
                        type="text"
                        placeholder="RUT (opcional)"
                        value={emp.rut}
                        onChange={e => updateEmployee(i, 'rut', e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </div>
                    {employees.length > 1 && (
                      <button onClick={() => removeEmployee(i)} className="text-red-400 hover:text-red-600 mt-2">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={addEmployee}
                className="mt-3 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                + Agregar otro colaborador
              </button>
            </div>
          )}

          {/* Step: Done */}
          {currentStep.id === 'done' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">¡Todo listo!</h3>
              <p className="text-gray-500 max-w-sm mx-auto">
                {tenantName} está configurado. Ya puedes comenzar a registrar asistencia.
              </p>
              <div className="mt-6 space-y-2 text-sm text-gray-600 text-left max-w-xs mx-auto">
                <p className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> Horario creado</p>
                <p className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> Colaboradores agregados</p>
                <p className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-500" /> Listo para marcar asistencia</p>
              </div>
            </div>
          )}

          {error && <p className="text-red-500 text-sm mt-4">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <div>
            {step > 0 && currentStep.id !== 'done' && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="w-4 h-4" /> Atrás
              </button>
            )}
          </div>

          <div className="flex gap-3">
            {currentStep.id === 'logo' && !logoBase64 && (
              <button
                onClick={() => setStep(step + 1)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Omitir
              </button>
            )}

            {currentStep.id === 'done' ? (
              <button
                onClick={onComplete}
                className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-emerald-700 transition"
              >
                Ir al Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={saving}
                className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-emerald-700 transition disabled:opacity-50"
              >
                {saving ? 'Guardando...' : currentStep.id === 'employees' ? 'Finalizar' : 'Siguiente'}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getTenantSlugFromUrl() {
  const path = window.location.pathname;
  const match = path.match(/\/admin\/([^/]+)/);
  return match ? match[1] : null;
}
