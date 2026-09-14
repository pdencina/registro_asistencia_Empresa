import { useState, useMemo } from 'react';
import { Calculator, Check, Phone, Minus, Plus } from 'lucide-react';

/**
 * Cotizador público interactivo — flexio.cl/propuesta
 * Calculadora de precio por tramos de volumen (agrícola / general).
 * El usuario ingresa cantidad de trabajadores y ve el precio recalculado en vivo.
 */

const TIERS = [
  { from: 1, to: 100, price: 1590 },
  { from: 101, to: 500, price: 990 },
  { from: 501, to: 1000, price: 690 },
  { from: 1001, to: Infinity, price: 490 },
];

const PRESETS = [50, 150, 500, 1200, 1500];

function fmt(n) {
  return '$' + Math.round(n).toLocaleString('es-CL');
}

export default function CotizadorPage() {
  const [qty, setQty] = useState(100);

  const calc = useMemo(() => {
    const n = Math.max(0, qty);
    let neto = 0;
    const rows = [];
    for (const t of TIERS) {
      if (n < t.from) break;
      const upper = Math.min(n, t.to);
      const count = upper - t.from + 1;
      if (count > 0) {
        const subtotal = count * t.price;
        neto += subtotal;
        rows.push({
          range: t.to === Infinity ? `${t.from}+` : `${t.from} - ${t.to}`,
          count,
          price: t.price,
          subtotal,
        });
      }
    }
    const iva = neto * 0.19;
    return { neto, iva, total: neto + iva, avg: n > 0 ? neto / n : 0, rows };
  }, [qty]);

  function setQtySafe(v) {
    setQty(Math.max(1, Math.min(5000, parseInt(v) || 0)));
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="text-2xl font-extrabold text-slate-900">flex<span className="text-blue-600">io</span></span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Cotizador de Control de Asistencia</h1>
          <p className="text-sm text-slate-500 mt-1">Precio por trabajador según volumen. Solo pagas por trabajadores activos.</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
          {/* Input */}
          <div className="p-6 border-b border-slate-100">
            <label className="block text-sm font-semibold text-slate-600 mb-3">Número de trabajadores</label>
            <div className="flex items-center gap-3">
              <button onClick={() => setQtySafe(qty - 50)}
                className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center hover:bg-blue-50 transition">
                <Minus className="w-5 h-5 text-slate-500" />
              </button>
              <input type="number" value={qty} onChange={e => setQtySafe(e.target.value)}
                className="flex-1 py-3 border-2 border-slate-200 rounded-xl text-center text-3xl font-bold text-slate-900 focus:border-blue-500 outline-none" />
              <button onClick={() => setQtySafe(qty + 50)}
                className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center hover:bg-blue-50 transition">
                <Plus className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <input type="range" min="1" max="3000" value={Math.min(qty, 3000)}
              onChange={e => setQtySafe(e.target.value)}
              className="w-full mt-4 accent-blue-600" />
            <div className="flex gap-2 mt-3 flex-wrap">
              {PRESETS.map(p => (
                <button key={p} onClick={() => setQtySafe(p)}
                  className="flex-1 min-w-[64px] py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 hover:bg-blue-50 hover:border-blue-200 transition">
                  {p.toLocaleString('es-CL')}
                </button>
              ))}
            </div>
          </div>

          {/* Tramos */}
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
            <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2 font-semibold">Tramos de precio (por persona/mes)</p>
            {TIERS.map((t, i) => {
              const active = calc.rows.some(r => r.range === (t.to === Infinity ? `${t.from}+` : `${t.from} - ${t.to}`));
              return (
                <div key={i} className={`flex justify-between text-sm py-1 ${active ? 'text-blue-600 font-bold' : 'text-slate-500'}`}>
                  <span>{t.to === Infinity ? `${t.from} en adelante` : `${t.from} - ${t.to}`}</span>
                  <span>{fmt(t.price)}</span>
                </div>
              );
            })}
          </div>

          {/* Desglose */}
          <div className="px-6 py-4 border-b border-slate-100">
            {calc.rows.map((r, i) => (
              <div key={i} className="flex justify-between text-sm py-1.5">
                <span className="text-slate-500">{r.range} · {r.count} pers. × {fmt(r.price)}</span>
                <span className="font-semibold text-slate-900">{fmt(r.subtotal)}</span>
              </div>
            ))}
          </div>

          {/* Resultado */}
          <div className="p-6 bg-blue-50">
            <div className="text-center">
              <p className="text-sm text-slate-600">Neto: <strong className="text-slate-900">{fmt(calc.neto)}</strong> + IVA {fmt(calc.iva)}</p>
              <div className="text-4xl font-extrabold text-blue-600 my-2">{fmt(calc.total)}</div>
              <p className="text-sm text-slate-500">total mensual con IVA</p>
              <div className="mt-3 pt-3 border-t border-blue-200 text-sm text-slate-600">
                Promedio por trabajador: <strong className="text-blue-600">{fmt(calc.avg)}</strong>/mes
              </div>
            </div>
          </div>
        </div>

        {/* Incluye */}
        <div className="bg-white rounded-2xl shadow-sm mt-4 p-5">
          <p className="font-semibold text-slate-900 text-sm mb-3">Todo incluido</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
            {['Marcaje por RUT o PIN','Modo offline + sync','Geolocalización','Registros inalterables (Res. 38)','Libro de Asistencia DT','Reportes de nómina + HHEE','Carga masiva Excel','Dispositivos ilimitados','Sin permanencia mínima','15 días de prueba gratis'].map((f, i) => (
              <div key={i} className="flex gap-1.5"><Check className="w-3.5 h-3.5 text-green-600 shrink-0 mt-0.5" />{f}</div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-6">
          <a href="https://wa.me/56949616038?text=Hola,%20me%20interesa%20cotizar%20Flexio"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-2xl font-semibold transition">
            <Phone className="w-5 h-5" /> Solicitar demo sin costo
          </a>
          <p className="text-xs text-slate-400 mt-4">Flexio Technologies SpA · pablo@flexio.cl · +56 9 4961 6038</p>
        </div>
      </div>
    </div>
  );
}
