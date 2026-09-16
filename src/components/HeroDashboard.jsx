import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * Mockup de dashboard animado para el hero de la landing.
 * Simula un dashboard "en vivo": KPIs que cuentan, marcajes que entran,
 * contador de colaboradores que sube. Da sensación de sistema activo.
 */

// Contador que cuenta desde 0 al valor final
function useCountUp(end, duration = 1500, start = false, decimals = 0) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    let raf, t0;
    const step = (t) => {
      if (!t0) t0 = t;
      const p = Math.min((t - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(end * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else setVal(end);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [start, end, duration]);
  return decimals > 0 ? val.toFixed(decimals) : Math.round(val);
}

// Marcajes simulados que van entrando "en vivo"
const NUEVOS_MARCAJES = [
  { nombre: 'M. González', accion: 'Entrada', hora: '08:02', color: 'emerald' },
  { nombre: 'P. Silva', accion: 'Entrada', hora: '08:05', color: 'emerald' },
  { nombre: 'L. Rojas', accion: 'Salida', hora: '17:31', color: 'orange' },
  { nombre: 'C. Vega', accion: 'Entrada', hora: '08:08', color: 'emerald' },
  { nombre: 'A. Muñoz', accion: 'Entrada', hora: '08:11', color: 'emerald' },
];

export default function HeroDashboard() {
  const [started, setStarted] = useState(false);
  const [colaboradores, setColaboradores] = useState(69);
  const [marcajeIdx, setMarcajeIdx] = useState(0);
  const [feed, setFeed] = useState([]);
  const ref = useRef(null);

  const asistencia = useCountUp(92, 1600, started);
  const horas = useCountUp(47, 1600, started);
  const cumple = useCountUp(100, 1600, started);
  const ahorro = useCountUp(1.2, 1600, started, 1);

  // Iniciar animaciones al montar
  useEffect(() => {
    const t = setTimeout(() => setStarted(true), 400);
    return () => clearTimeout(t);
  }, []);

  // Feed de marcajes "en vivo" cada 2.8s
  useEffect(() => {
    if (!started) return;
    const interval = setInterval(() => {
      const m = NUEVOS_MARCAJES[marcajeIdx % NUEVOS_MARCAJES.length];
      setFeed((prev) => [{ ...m, id: Date.now() }, ...prev].slice(0, 3));
      setMarcajeIdx((i) => i + 1);
      if (marcajeIdx % 2 === 0) setColaboradores((c) => c + 1);
    }, 2800);
    return () => clearInterval(interval);
  }, [started, marcajeIdx]);

  const colorMap = {
    emerald: 'bg-emerald-100 text-emerald-700',
    orange: 'bg-orange-100 text-orange-700',
  };

  return (
    <div ref={ref}>
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        {/* Browser bar */}
        <div className="bg-gray-50 border-b border-gray-100 px-4 py-2 flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400"></div>
          <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
          <span className="ml-3 text-[10px] text-gray-400">flexio.cl/admin/tu-empresa</span>
          <span className="ml-auto flex items-center gap-1">
            <motion.span className="w-1.5 h-1.5 rounded-full bg-emerald-500"
              animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
            <span className="text-[9px] text-emerald-600 font-medium">En vivo</span>
          </span>
        </div>

        <div className="p-4 space-y-3">
          {/* KPIs con contadores */}
          <div className="grid grid-cols-4 gap-2">
            <motion.div className="bg-emerald-50 rounded-lg p-2.5 text-center"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <p className="text-lg font-bold text-emerald-700">{asistencia}%</p>
              <p className="text-[9px] text-emerald-600">Asistencia</p>
            </motion.div>
            <motion.div className="bg-red-50 rounded-lg p-2.5 text-center"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <p className="text-lg font-bold text-red-600">{horas}h</p>
              <p className="text-[9px] text-red-500">Improductivas</p>
            </motion.div>
            <motion.div className="bg-primary-50 rounded-lg p-2.5 text-center"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <p className="text-lg font-bold text-primary-700">{cumple}%</p>
              <p className="text-[9px] text-primary-600">Registros OK</p>
            </motion.div>
            <motion.div className="bg-emerald-50 rounded-lg p-2.5 text-center"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <p className="text-lg font-bold text-emerald-700">${ahorro}M</p>
              <p className="text-[9px] text-emerald-600">Ahorro</p>
            </motion.div>
          </div>

          {/* Feed en vivo de marcajes */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-gray-700">Marcajes en tiempo real</p>
              <span className="flex items-center gap-1">
                <motion.span className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                  animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }} />
                <span className="text-[9px] text-gray-400">{colaboradores} presentes</span>
              </span>
            </div>
            <div className="space-y-1.5 min-h-[76px]">
              <AnimatePresence mode="popLayout">
                {feed.map((m) => (
                  <motion.div key={m.id}
                    layout
                    initial={{ opacity: 0, x: -20, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.35 }}
                    className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-1.5 border border-gray-100">
                    <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-500">
                      {m.nombre.charAt(0)}
                    </div>
                    <span className="text-[10px] text-gray-700 flex-1">{m.nombre}</span>
                    <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded-full ${colorMap[m.color]}`}>{m.accion}</span>
                    <span className="text-[9px] text-gray-400">{m.hora}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
              {feed.length === 0 && (
                <p className="text-[10px] text-gray-300 text-center py-6">Esperando marcajes...</p>
              )}
            </div>
          </div>

          {/* Chart animado */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-gray-700">Tendencia 12 meses</p>
              <p className="text-[10px] text-emerald-600 font-medium">↑ +16%</p>
            </div>
            <div className="flex items-end gap-[3px] h-12">
              {[62, 68, 72, 78, 74, 82, 85, 80, 88, 85, 92, 96].map((v, i) => (
                <motion.div key={i}
                  className={`flex-1 rounded-t-sm origin-bottom ${v >= 85 ? 'bg-emerald-400' : v >= 70 ? 'bg-amber-300' : 'bg-red-300'}`}
                  initial={{ height: 0 }}
                  animate={{ height: `${v}%` }}
                  transition={{ delay: 0.8 + i * 0.05, duration: 0.5, ease: 'easeOut' }}
                />
              ))}
            </div>
          </div>

          {/* Sugerencias */}
          <div className="space-y-1.5">
            <motion.div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
              <span className="text-[11px]">💰</span>
              <p className="text-[10px] text-emerald-800"><strong>28 colaboradores</strong> merecen bono — mejora retención</p>
            </motion.div>
            <motion.div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.7 }}>
              <span className="text-[11px]">📋</span>
              <p className="text-[10px] text-blue-800">Libro de asistencia — <strong>siempre al día</strong></p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
