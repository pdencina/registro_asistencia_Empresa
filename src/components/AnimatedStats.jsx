import { useState, useRef, useEffect } from 'react';

/**
 * Componente de estadísticas animadas para la landing.
 * - Contadores que cuentan desde 0 hasta el valor final (countUp con easing)
 * - Barras que crecen desde 0 hasta su valor
 * - Reveal escalonado al entrar en pantalla (IntersectionObserver)
 * - Respeta prefers-reduced-motion
 *
 * Sin dependencias extra (solo React).
 */

// Detecta si el usuario prefiere animaciones reducidas
function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Hook: dispara callback cuando el elemento entra en pantalla
function useInViewOnce(threshold = 0.3) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true);
            io.unobserve(e.target);
          }
        });
      },
      { threshold, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView];
}

// Contador animado
function CountUp({ end, duration = 1800, prefix = '', suffix = '', decimals = 0 }) {
  const [value, setValue] = useState(0);
  const [ref, inView] = useInViewOnce();

  useEffect(() => {
    if (!inView) return;
    if (prefersReducedMotion()) { setValue(end); return; }

    let startTime = null;
    let raf;
    const step = (ts) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(end * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
      else setValue(end);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, end, duration]);

  const formatted = decimals > 0
    ? value.toFixed(decimals)
    : Math.round(value).toLocaleString('es-CL');

  return <span ref={ref}>{prefix}{formatted}{suffix}</span>;
}

// Barra que crece
function GrowBar({ percent, label, value, color = 'bg-blue-500' }) {
  const [ref, inView] = useInViewOnce();
  const reduced = prefersReducedMotion();
  return (
    <div ref={ref}>
      <div className="flex justify-between items-baseline mb-2">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <span className="text-sm font-bold text-slate-900">{value}</span>
      </div>
      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-1000 ease-out`}
          style={{ width: inView || reduced ? `${percent}%` : '0%' }}
        />
      </div>
    </div>
  );
}

export default function AnimatedStats() {
  const stats = [
    { end: 100, suffix: '+', label: 'Empresas confían en Flexio' },
    { end: 92, suffix: '%', label: 'Asistencia promedio' },
    { end: 2, suffix: 'seg', label: 'Por marcaje' },
    { end: 15, suffix: ' días', label: 'Prueba gratis' },
  ];

  const bars = [
    { label: 'Reducción de fraude en marcaje', value: '98%', percent: 98, color: 'bg-emerald-500' },
    { label: 'Ahorro en tiempo administrativo', value: '85%', percent: 85, color: 'bg-blue-500' },
    { label: 'Cumplimiento normativo DT', value: '100%', percent: 100, color: 'bg-violet-500' },
    { label: 'Satisfacción de clientes', value: '96%', percent: 96, color: 'bg-amber-500' },
  ];

  return (
    <section className="py-20 px-6 lg:px-8 bg-slate-50">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">Resultados que hablan</h2>
          <p className="text-lg text-slate-500 mt-3">Empresas de todo Chile ya optimizaron su control de asistencia.</p>
        </div>

        {/* Contadores */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {stats.map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
              <div className="text-4xl font-extrabold text-blue-600">
                <CountUp end={s.end} suffix={s.suffix} />
              </div>
              <p className="text-sm text-slate-500 mt-2">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Barras */}
        <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-3xl mx-auto">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Impacto en tu operación</h3>
          <div className="space-y-5">
            {bars.map((b, i) => (
              <GrowBar key={i} {...b} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
