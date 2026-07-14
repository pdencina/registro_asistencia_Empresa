import { useState } from 'react';
import { CheckCircle, Users, Smartphone, Rocket, ArrowRight, X } from 'lucide-react';

const STEPS = [
  {
    id: 'welcome',
    title: 'Bienvenido a Flexio',
    description: 'Tu sistema de control de asistencia está listo. Te guiaremos en los primeros pasos para que comiences a operar en minutos.',
    icon: Rocket,
    color: 'primary',
  },
  {
    id: 'employees',
    title: 'Crea tu primer colaborador',
    description: 'Ve a la sección "Equipo" y agrega al menos un colaborador con su nombre, RUT y foto. Le llegará un correo para autorizar el uso del reconocimiento facial.',
    icon: Users,
    color: 'blue',
    action: { label: 'Ir a Equipo', path: 'employees' },
  },
  {
    id: 'device',
    title: 'Activa tu dispositivo de registro',
    description: 'Abre la URL de registro (flexio.cl/app/tu-empresa) en la tablet o computador que usarán para marcar. Ingresa el PIN de administrador que recibiste por email para activarlo.',
    icon: Smartphone,
    color: 'emerald',
    action: { label: 'Ir a Registrar', path: 'register' },
  },
  {
    id: 'done',
    title: '¡Todo listo!',
    description: 'Tu sistema está operativo. Los colaboradores ya pueden marcar asistencia y tú verás todo en el Dashboard en tiempo real.',
    icon: CheckCircle,
    color: 'emerald',
  },
];

export default function OnboardingWizard({ onComplete, basePath }) {
  const [currentStep, setCurrentStep] = useState(0);

  function handleNext() {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  }

  function handleComplete() {
    sessionStorage.setItem('onboarding_done', 'true');
    onComplete();
  }

  function handleNavigate(path) {
    sessionStorage.setItem('onboarding_done', 'true');
    window.location.href = `${basePath}/${path}`;
  }

  const step = STEPS[currentStep];
  const Icon = step.icon;
  const colors = {
    primary: 'bg-primary-100 text-primary-600',
    blue: 'bg-blue-100 text-blue-600',
    emerald: 'bg-emerald-100 text-emerald-600',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Progress */}
        <div className="flex gap-1 px-6 pt-5">
          {STEPS.map((_, i) => (
            <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i <= currentStep ? 'bg-primary-600' : 'bg-gray-200'}`} />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 py-8 text-center">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${colors[step.color]}`}>
            <Icon className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-6">{step.description}</p>

          {/* Step indicator */}
          <p className="text-xs text-gray-400 mb-6">Paso {currentStep + 1} de {STEPS.length}</p>

          {/* Actions */}
          <div className="space-y-3">
            {step.action && (
              <button
                onClick={() => handleNavigate(step.action.path)}
                className="w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {step.action.label}
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <button
              onClick={handleNext}
              className={`w-full py-3 font-medium rounded-xl transition-all flex items-center justify-center gap-2 ${
                step.action
                  ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  : 'bg-primary-600 hover:bg-primary-700 text-white'
              }`}
            >
              {currentStep === STEPS.length - 1 ? 'Comenzar a usar Flexio' : 'Siguiente'}
              {currentStep < STEPS.length - 1 && <ArrowRight className="w-4 h-4" />}
            </button>

            {currentStep > 0 && currentStep < STEPS.length - 1 && (
              <button
                onClick={handleComplete}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Saltar tutorial
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
