import { useState } from 'react';
import { CheckCircle, Users, Clock, Rocket, ArrowRight, ArrowLeft, Plus, Trash2, UserPlus, AlertCircle } from 'lucide-react';
import { employeesApi, schedulesApi } from '../api';

const TOTAL_STEPS = 3;

export default function OnboardingWizard({ onComplete, basePath }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [employees, setEmployees] = useState([{ first_name: '', last_name: '', rut: '' }]);
  const [schedule, setSchedule] = useState({ name: 'Jornada Completa', entry_time: '08:30', exit_time: '18:00', tolerance_minutes: 10 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedEmployees, setSavedEmployees] = useState(0);
  const [scheduleCreated, setScheduleCreated] = useState(false);

  function handleComplete() {
    sessionStorage.setItem('onboarding_done', 'true');
    onComplete();
  }

  function addEmployee() {
    setEmployees([...employees, { first_name: '', last_name: '', rut: '' }]);
  }

  function removeEmployee(index) {
    if (employees.length <= 1) return;
    setEmployees(employees.filter((_, i) => i !== index));
  }

  function updateEmployee(index, field, value) {
    const updated = [...employees];
    updated[index] = { ...updated[index], [field]: value };
    setEmployees(updated);
  }

  async function saveEmployees() {
    setError('');
    const valid = employees.filter(e => e.first_name.trim() && e.last_name.trim());
    if (valid.length === 0) {
      setError('Agrega al menos un colaborador con nombre y apellido');
      return false;
    }

    setSaving(true);
    let count = 0;
    for (const emp of valid) {
      try {
        await employeesApi.create({
          first_name: emp.first_name.trim(),
          last_name: emp.last_name.trim(),
          rut: emp.rut.trim() || 'SIN-DOC',
          doc_type: 'OTHER',
        });
        count++;
      } catch (err) {
        console.error('Error creating employee:', err);
      }
    }
    setSavedEmployees(count);
    setSaving(false);
    return count > 0;
  }

  async function saveSchedule() {
    setError('');
    if (!schedule.entry_time || !schedule.exit_time) {
      setError('Define la hora de entrada y salida');
      return false;
    }

    setSaving(true);
    try {
      await schedulesApi.create({
        ...schedule,
        is_default: true,
        shift_type: 'fixed',
        lunch_break_minutes: 30,
      });
      setScheduleCreated(true);
      setSaving(false);
      return true;
    } catch (err) {
      // If schedule already exists, that's fine
      if (err.message?.includes('already') || err.message?.includes('existe')) {
        setScheduleCreated(true);
        setSaving(false);
        return true;
      }
      setError('Error al crear horario: ' + (err.message || 'intente de nuevo'));
      setSaving(false);
      return false;
    }
  }

  async function handleNext() {
    setError('');

    // Step 0: Save employees
    if (currentStep === 0) {
      const success = await saveEmployees();
      if (!success) return;
    }

    // Step 1: Save schedule
    if (currentStep === 1) {
      const success = await saveSchedule();
      if (!success) return;
    }

    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setError('');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        {/* Progress bar */}
        <div className="flex gap-1 px-6 pt-5 shrink-0">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i <= currentStep ? 'bg-primary-600' : 'bg-gray-200'}`} />
          ))}
        </div>

        {/* Step indicator */}
        <p className="text-xs text-gray-400 text-center mt-3 shrink-0">Paso {currentStep + 1} de {TOTAL_STEPS}</p>

        {/* Content — scrollable */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-xl mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* ─── STEP 0: Agregar equipo ─── */}
          {currentStep === 0 && (
            <div>
              <div className="text-center mb-5">
                <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Users className="w-7 h-7 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Agrega tu equipo</h2>
                <p className="text-sm text-gray-500 mt-1">Ingresa los colaboradores que marcan asistencia. Puedes agregar mas despues.</p>
              </div>

              <div className="space-y-3">
                {employees.map((emp, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input
                        value={emp.first_name}
                        onChange={e => updateEmployee(i, 'first_name', e.target.value)}
                        placeholder="Nombre"
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                      />
                      <input
                        value={emp.last_name}
                        onChange={e => updateEmployee(i, 'last_name', e.target.value)}
                        placeholder="Apellido"
                        className="px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                      />
                    </div>
                    <input
                      value={emp.rut}
                      onChange={e => updateEmployee(i, 'rut', e.target.value)}
                      placeholder="RUT (opcional)"
                      className="w-32 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    {employees.length > 1 && (
                      <button onClick={() => removeEmployee(i)} className="p-2 text-gray-400 hover:text-red-500 shrink-0">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button onClick={addEmployee} className="mt-3 flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium">
                <Plus className="w-4 h-4" /> Agregar otro colaborador
              </button>

              {savedEmployees > 0 && (
                <div className="mt-3 flex items-center gap-2 text-emerald-600 text-sm bg-emerald-50 p-3 rounded-xl">
                  <CheckCircle className="w-4 h-4" />
                  {savedEmployees} colaborador{savedEmployees > 1 ? 'es' : ''} guardado{savedEmployees > 1 ? 's' : ''}
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 1: Configurar horario ─── */}
          {currentStep === 1 && (
            <div>
              <div className="text-center mb-5">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Clock className="w-7 h-7 text-emerald-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Define el horario</h2>
                <p className="text-sm text-gray-500 mt-1">Configura la jornada laboral principal. Se aplicara a todo tu equipo por defecto.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del horario</label>
                  <input
                    value={schedule.name}
                    onChange={e => setSchedule({ ...schedule, name: e.target.value })}
                    placeholder="Ej: Jornada Completa"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora entrada</label>
                    <input
                      type="time"
                      value={schedule.entry_time}
                      onChange={e => setSchedule({ ...schedule, entry_time: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hora salida</label>
                    <input
                      type="time"
                      value={schedule.exit_time}
                      onChange={e => setSchedule({ ...schedule, exit_time: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tolerancia de atraso</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0"
                      max="30"
                      step="5"
                      value={schedule.tolerance_minutes}
                      onChange={e => setSchedule({ ...schedule, tolerance_minutes: parseInt(e.target.value) })}
                      className="flex-1 accent-primary-600"
                    />
                    <span className="text-sm font-semibold text-gray-700 w-16 text-right">{schedule.tolerance_minutes} min</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Minutos de gracia antes de marcar como atraso</p>
                </div>
              </div>

              {scheduleCreated && (
                <div className="mt-4 flex items-center gap-2 text-emerald-600 text-sm bg-emerald-50 p-3 rounded-xl">
                  <CheckCircle className="w-4 h-4" />
                  Horario creado correctamente
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 2: Listo ─── */}
          {currentStep === 2 && (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Rocket className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Todo listo para operar</h2>
              <p className="text-sm text-gray-600 leading-relaxed mb-4">
                Tu equipo y horario estan configurados. Solo falta activar el dispositivo de marcaje.
              </p>

              <div className="bg-gray-50 rounded-xl p-4 text-left space-y-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{savedEmployees} colaborador{savedEmployees !== 1 ? 'es' : ''} agregado{savedEmployees !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Horario: {schedule.entry_time} — {schedule.exit_time}</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left">
                <p className="text-sm font-medium text-blue-900 mb-1">Siguiente paso recomendado:</p>
                <p className="text-xs text-blue-700">
                  Abre <span className="font-mono font-semibold">flexio.cl/app/tu-empresa</span> en la tablet o PC donde marcaran asistencia. Usa el PIN que recibiste por email.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-6 pt-2 border-t border-gray-100 shrink-0">
          <div className="flex gap-3">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-all text-sm"
              >
                <ArrowLeft className="w-4 h-4" /> Atras
              </button>
            )}

            <button
              onClick={handleNext}
              disabled={saving}
              className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : currentStep === TOTAL_STEPS - 1 ? 'Comenzar a usar Flexio' : 'Guardar y continuar'}
              {!saving && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>

          {currentStep < TOTAL_STEPS - 1 && (
            <button onClick={handleComplete} className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 transition-colors">
              Omitir configuracion y hacerlo despues
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
