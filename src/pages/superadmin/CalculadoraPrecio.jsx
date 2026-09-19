import { useState, useMemo } from 'react';
import { Calculator, Minus, Plus, ArrowLeft } from 'lucide-react';

/**
 * Calculadora de presupuesto interna para el super-admin.
 * Modelo vigente (estudio de mercado):
 *  - Planes fijos: Básico ≤30 $39.990, Profesional ≤100 $99.990, Enterprise ≤300 $249.990
 *  - Corporativo (+300): tarifa por trabajador 301-750=$700, 751-1500=$600, 1501-3000=$500
 */

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-CL');
}

function calcularPlan(n) {
  if (n <= 30) return { plan: 'Básico', neto: 39990, detalle: 'hasta 30 colaboradores', porTrabajador: false };
  if (n <= 100) return { plan: 'Profesional', neto: 99990, detalle: 'hasta 100 colaboradores', porTrabajador: false };
  if (n <= 300) return { plan: 'Enterprise', neto: 249990, detalle: 'hasta 300 colaboradores', porTrabajador: false };
  let unit;
  if (n <= 750) unit = 700;
  else if (n <= 1500) unit = 600;
  else if (n <= 3000) unit = 500;
  else return { plan: 'Corporativo', neto: null, detalle: 'más de 3.000 — a convenir', porTrabajador: true, unit: null };
  return { plan: 'Corporativo', neto: n * unit, detalle: `${n} × ${fmt(unit)} c/u`, porTrabajador: true, unit };
}

const PRESETS = [10, 50, 150, 500, 1200, 1500];

export default function CalculadoraPrecio({ onBack }) {
  const [qty, setQty] = useState(50);
  const [descuento, setDescuento] = useState(0);

  const calc = useMemo(() => {
    const plan = calcularPlan(qty);
    if (!plan.neto) return { plan, neto: null };
    const conDesc = descuento > 0 ? Math.round(plan.neto * (1 - descuento / 100)) : plan.neto;
    return {
      plan,
      neto: conDesc,
      iva: Math.round(conDesc * 0.19),
      total: Math.round(conDesc * 1.19),
      promedio: qty > 0 ? conDesc / qty : 0,
    };
  }, [qty, descuento]);

  function setQtySafe(v) {
    setQty(Math.max(1, Math.min(10000, parseInt(v) || 0)));
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></button>
        <Calculator className="w-5 h-5 text-primary-400" />
        <h2 className="text-xl font-bold">Calculadora de Presupuesto</h2>
      </div>

      <div className="max-w-lg">
        <div className="bg-gray-800 rounded-2xl border border-gray-700 p-6">
          {/* Input */}
          <label className="block text-sm font-semibold text-gray-400 mb-3">Número de colaboradores</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setQtySafe(qty - 10)}
              className="w-11 h-11 rounded-xl border border-gray-700 bg-gray-900 flex items-center justify-center hover:bg-gray-700 transition">
              <Minus className="w-5 h-5 text-gray-400" />
            </button>
            <input type="number" value={qty} onChange={e => setQtySafe(e.target.value)}
              className="flex-1 py-3 bg-gray-900 border-2 border-gray-700 rounded-xl text-center text-3xl font-bold text-white focus:border-primary-500 outline-none" />
            <button onClick={() => setQtySafe(qty + 10)}
              className="w-11 h-11 rounded-xl border border-gray-700 bg-gray-900 flex items-center justify-center hover:bg-gray-700 transition">
              <Plus className="w-5 h-5 text-gray-400" />
            </button>
          </div>
          <input type="range" min="1" max="3000" value={Math.min(qty, 3000)}
            onChange={e => setQtySafe(e.target.value)} className="w-full mt-4 accent-primary-500" />
          <div className="flex gap-2 mt-3 flex-wrap">
            {PRESETS.map(p => (
              <button key={p} onClick={() => setQtySafe(p)}
                className="flex-1 min-w-[56px] py-2 rounded-lg border border-gray-700 bg-gray-900 text-xs font-semibold text-gray-400 hover:bg-gray-700 transition">
                {p.toLocaleString('es-CL')}
              </button>
            ))}
          </div>

          {/* Descuento */}
          <div className="mt-5">
            <label className="block text-sm font-semibold text-gray-400 mb-2">Descuento especial (%)</label>
            <input type="number" min="0" max="50" value={descuento}
              onChange={e => setDescuento(Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
              className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-primary-500 outline-none" />
          </div>

          {/* Tramos */}
          <div className="mt-5 grid grid-cols-2 gap-2 text-[11px]">
            <div className={`px-2 py-1.5 rounded-lg text-center ${qty <= 30 ? 'bg-primary-600/20 text-primary-300 border border-primary-500/40' : 'bg-gray-900 text-gray-500'}`}>Básico ≤30 · $39.990</div>
            <div className={`px-2 py-1.5 rounded-lg text-center ${qty > 30 && qty <= 100 ? 'bg-primary-600/20 text-primary-300 border border-primary-500/40' : 'bg-gray-900 text-gray-500'}`}>Profesional ≤100 · $99.990</div>
            <div className={`px-2 py-1.5 rounded-lg text-center ${qty > 100 && qty <= 300 ? 'bg-primary-600/20 text-primary-300 border border-primary-500/40' : 'bg-gray-900 text-gray-500'}`}>Enterprise ≤300 · $249.990</div>
            <div className={`px-2 py-1.5 rounded-lg text-center ${qty > 300 ? 'bg-primary-600/20 text-primary-300 border border-primary-500/40' : 'bg-gray-900 text-gray-500'}`}>Corporativo +300 · $700/$600/$500</div>
          </div>

          {/* Resultado */}
          <div className="mt-6 p-5 bg-gray-900 border border-gray-700 rounded-xl text-center">
            {calc.neto ? (
              <>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Plan {calc.plan.plan}</p>
                <p className="text-4xl font-extrabold text-emerald-400 my-2">{fmt(calc.total)}</p>
                <p className="text-xs text-gray-500">/mes · IVA incluido</p>
                <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-gray-400 space-y-1">
                  <p>Neto: {fmt(calc.neto)} + IVA {fmt(calc.iva)}</p>
                  <p>{calc.plan.detalle}</p>
                  <p>Promedio: <span className="text-emerald-400 font-semibold">{fmt(calc.promedio)}</span>/colaborador</p>
                  {descuento > 0 && <p className="text-amber-400">Descuento aplicado: -{descuento}%</p>}
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Plan Corporativo</p>
                <p className="text-2xl font-bold text-amber-400 my-2">Valor a convenir</p>
                <p className="text-xs text-gray-500">Más de 3.000 colaboradores</p>
              </>
            )}
          </div>

          <p className="text-[11px] text-gray-500 mt-4 text-center">
            Valores netos + IVA. Contrato mínimo 6 meses. Implementación asistida incluida.
          </p>
        </div>
      </div>
    </div>
  );
}
