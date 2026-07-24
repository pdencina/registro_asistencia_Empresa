import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  ScanFace, Smartphone, WifiOff, MapPin, Bell, FileText, Shield, Zap,
  Check, X, Clock, Users, Loader, ArrowRight, Phone, ChevronDown
} from 'lucide-react';

const ICON_MAP = {
  'scan-face': ScanFace,
  'smartphone': Smartphone,
  'wifi-off': WifiOff,
  'map-pin': MapPin,
  'bell': Bell,
  'file-text': FileText,
  'shield': Shield,
  'zap': Zap,
};

function formatCLP(amount) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
}

export default function ProposalPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAnnual, setShowAnnual] = useState(false);

  useEffect(() => {
    fetch(`/api/proposals/${slug}`)
      .then(res => {
        if (!res.ok) throw new Error('Empresa no encontrada');
        return res.json();
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 text-lg">{error}</p>
          <a href="/" className="text-emerald-600 underline mt-4 inline-block">Volver a flexio.cl</a>
        </div>
      </div>
    );
  }

  const { company, pricing, features, comparison, trial, implementation, contract } = data;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-7 h-7" />
            <span className="text-2xl font-bold tracking-tight">flex<span className="text-emerald-200">io</span></span>
          </div>
          <span className="text-sm text-emerald-100">Propuesta Comercial</span>
        </div>

        <div className="max-w-5xl mx-auto px-6 pb-16 pt-8">
          <p className="text-emerald-200 text-sm uppercase tracking-wide mb-2">Propuesta personalizada para</p>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{company}</h1>
          <p className="text-xl text-emerald-100 max-w-2xl">
            Control de asistencia inteligente con reconocimiento facial. 
            Sin hardware, sin contratos eternos, operando el mismo día.
          </p>
        </div>
      </header>

      {/* Pricing Section */}
      <section className="max-w-5xl mx-auto px-6 -mt-8">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-gray-500 text-sm mb-1">Plan recomendado para {pricing.employeeCount} colaboradores</p>
              <h2 className="text-2xl font-bold text-gray-900">Plan {pricing.plan}</h2>
            </div>

            {/* Toggle mensual/anual */}
            <div className="flex items-center gap-3 bg-gray-100 rounded-full p-1">
              <button
                onClick={() => setShowAnnual(false)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${!showAnnual ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
              >
                Mensual
              </button>
              <button
                onClick={() => setShowAnnual(true)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition ${showAnnual ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
              >
                Anual (-20%)
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-col md:flex-row md:items-end gap-6">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-emerald-600">
                  {showAnnual ? formatCLP(pricing.annualIva) : formatCLP(pricing.monthlyIva)}
                </span>
                <span className="text-gray-500">
                  {showAnnual ? '/año IVA incl.' : '/mes IVA incl.'}
                </span>
              </div>
              {pricing.employeeCount > 0 && (
                <p className="text-sm text-gray-500 mt-1">
                  {pricing.pricePerUser ? `${formatCLP(pricing.pricePerUser)}/usuario × ${pricing.employeeCount} colaboradores` : `≈ ${formatCLP(pricing.perEmployee)}/colaborador al mes`}
                  {pricing.minimumApplied && <span className="text-amber-600 ml-1">(mínimo {formatCLP(pricing.minimum)})</span>}
                </p>
              )}
              {pricing.discount > 0 && (
                <p className="text-sm text-emerald-600 font-medium mt-1">
                  Descuento especial: -{pricing.discount}%
                </p>
              )}
              {showAnnual && (
                <p className="text-sm text-emerald-600 font-medium mt-1">
                  Ahorra {formatCLP(pricing.monthlyIva * 12 - pricing.annualIva)} al año
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 md:ml-auto">
              <a
                href={contract.link}
                className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-emerald-700 transition"
              >
                Aceptar y firmar contrato
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="https://wa.me/56949616038?text=Hola%20Pablo%2C%20quiero%20agendar%20una%20demo%20de%20Flexio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-medium hover:bg-gray-50 transition"
              >
                <Phone className="w-4 h-4" />
                Agendar demo
              </a>
            </div>
          </div>

          {/* Trial badge */}
          <div className="mt-6 flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <Shield className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-800">
              <strong>{trial.days} días de prueba sin costo ni compromiso.</strong> Sin tarjeta de crédito. 
              Cancela con {contract.cancellation}, sin carta certificada.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">¿Qué incluye?</h2>
        <p className="text-gray-500 mb-8">Todo lo que necesita {company} para controlar asistencia de forma moderna.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f, i) => {
            const Icon = ICON_MAP[f.icon] || Zap;
            return (
              <div key={i} className="bg-gray-50 rounded-xl p-5 hover:shadow-md transition">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center mb-3">
                  <Icon className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-sm text-gray-500">{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Comparison Table */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Flexio vs Competencia</h2>
          <p className="text-gray-500 mb-8">Comparación directa con los proveedores más comunes en Chile.</p>

          <div className="overflow-x-auto">
            <table className="w-full bg-white rounded-xl shadow-sm border border-gray-200">
              <thead>
                <tr className="border-b border-gray-200">
                  {comparison.headers.map((h, i) => (
                    <th key={i} className={`px-4 py-3 text-left text-sm font-semibold ${i === 1 ? 'text-emerald-600 bg-emerald-50' : 'text-gray-700'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className={`px-4 py-3 text-sm ${j === 1 ? 'bg-emerald-50 font-medium' : ''} ${cell === '✅' ? 'text-emerald-600' : cell === '❌' ? 'text-red-400' : 'text-gray-700'}`}>
                        {cell === '✅' ? <Check className="w-5 h-5 text-emerald-600" /> : cell === '❌' ? <X className="w-5 h-5 text-red-400" /> : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Implementation Timeline */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Implementación: {implementation.time}</h2>
        <p className="text-gray-500 mb-8">Sin semanas de espera. Operando al 100% el primer día.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {implementation.steps.map((s, i) => (
            <div key={i} className="relative bg-white border border-gray-200 rounded-xl p-5">
              <div className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-bold mb-3">
                {i + 1}
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-1">{s.step}</h3>
              <p className="text-xs text-gray-500">{s.time}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contract Terms */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Condiciones Comerciales</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-3">Sin Permanencia</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Sin contrato mínimo</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Cancela con 15 días de aviso</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Sin carta certificada</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Sin cobro de salida</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-3">Sin Costos Ocultos</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Sin cobro de activación</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Sin hardware adicional</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Sin cobro de implementación</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Sin capacitación pagada</li>
              </ul>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-3">Todo Incluido</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Soporte vía WhatsApp</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Actualizaciones incluidas</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> Contrato digital integrado</li>
                <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> SLA 99% disponibilidad</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="max-w-5xl mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">¿Listo para comenzar?</h2>
        <p className="text-gray-500 mb-8 max-w-xl mx-auto">
          Activa tu prueba de {trial.days} días sin costo. Si no te convence, te sales sin pagar nada.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={contract.link}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-emerald-700 transition shadow-lg shadow-emerald-200"
          >
            Comenzar prueba gratis
            <ArrowRight className="w-5 h-5" />
          </a>
          <a
            href="https://wa.me/56949616038?text=Hola%20Pablo%2C%20tengo%20preguntas%20sobre%20la%20propuesta%20de%20Flexio"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 border-2 border-gray-300 text-gray-700 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-50 transition"
          >
            <Phone className="w-5 h-5" />
            Hablar con Pablo
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-400">
            <Clock className="w-5 h-5" />
            <span className="font-semibold">flexio</span>
          </div>
          <p className="text-sm text-gray-400">
            Pablo David Encina Acevedo · flexio.cl · +56 9 4961 6038
          </p>
        </div>
      </footer>
    </div>
  );
}
