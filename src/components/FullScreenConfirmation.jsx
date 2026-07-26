import { CheckCircle, Clock } from 'lucide-react';

const ENTRY_MESSAGES = [
  '¡Que tengas un excelente día!',
  '¡Buen día! A dar lo mejor hoy.',
  '¡Tu jornada ha comenzado con éxito!',
  '¡Adelante! Hoy será un gran día.',
];

const EXIT_MESSAGES = [
  '¡Buen regreso a casa! Descansa bien.',
  '¡Jornada completa! Disfruta tu descanso.',
  '¡Hasta mañana! Que tengas una buena tarde.',
  '¡Listo! Mereces un buen descanso.',
];

function getRandomMessage(type) {
  const messages = type === 'entry' ? ENTRY_MESSAGES : EXIT_MESSAGES;
  return messages[Math.floor(Math.random() * messages.length)];
}

/**
 * Full-screen confirmation shown after a successful check-in/out.
 * Green for entry, orange for exit. Same across all modalities.
 * 
 * Props:
 * - type: 'entry' | 'exit'
 * - employeeName: string
 * - time: string (formatted time)
 * - tenantLogo?: string (optional logo URL)
 * - onClose?: function (optional, called after timeout or tap)
 */
export default function FullScreenConfirmation({ type, employeeName, time, tenantLogo, onClose }) {
  const isEntry = type === 'entry';
  const message = getRandomMessage(type);

  return (
    <div
      onClick={onClose}
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 transition-all ${
        isEntry
          ? 'bg-gradient-to-b from-emerald-500 to-emerald-700'
          : 'bg-gradient-to-b from-orange-500 to-orange-700'
      }`}
    >
      {/* Logo */}
      {tenantLogo && (
        <img src={tenantLogo} alt="" className="h-10 object-contain mb-6 opacity-80" />
      )}

      {/* Check animation */}
      <div className="w-28 h-28 rounded-full bg-white/20 flex items-center justify-center mb-8 animate-bounce">
        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-lg">
          <CheckCircle className={`w-12 h-12 ${isEntry ? 'text-emerald-600' : 'text-orange-600'}`} />
        </div>
      </div>

      {/* Type label */}
      <p className="text-white/80 text-sm uppercase tracking-wider font-medium mb-2">
        {isEntry ? 'Entrada registrada' : 'Salida registrada'}
      </p>

      {/* Time */}
      <p className="text-white text-5xl font-bold mb-4 tabular-nums">{time}</p>

      {/* Employee name */}
      <div className="bg-white/10 backdrop-blur-sm rounded-2xl px-8 py-4 mb-8">
        <p className="text-white text-xl font-semibold text-center">{employeeName}</p>
      </div>

      {/* Motivational message */}
      <p className="text-white/90 text-lg text-center max-w-xs font-medium">
        {message}
      </p>

      {/* Subtle indicator */}
      <p className="absolute bottom-8 text-white/30 text-xs">
        Volviendo al inicio...
      </p>
    </div>
  );
}
