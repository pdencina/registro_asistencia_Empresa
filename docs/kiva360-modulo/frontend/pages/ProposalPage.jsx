import { useState, useEffect } from 'react';

/**
 * Página pública de Propuesta — Kiva360
 * El colegio ve: plan propuesto, precio, features, y puede aceptar.
 * 
 * Ruta: /propuesta/:ref (ej: kiva360.cl/propuesta/KV-20260802-143022)
 */
export default function ProposalPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  // Extraer referencia de la URL
  const ref = window.location.pathname.split('/').pop();

  useEffect(() => {
    if (!ref) { setLoading(false); return; }
    fetch(`/api/proposals?ref=${encodeURIComponent(ref)}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        if (d.status === 'accepted' || d.status === 'contracted') setAccepted(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ref]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const res = await fetch('/api/proposals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.id, action: 'accept' }),
      });
      const result = await res.json();
      if (result.status === 'accepted') setAccepted(true);
    } catch {}
    setAccepting(false);
  };

  if (loading) return <div className="p-8 text-center">Cargando propuesta...</div>;
  if (!data) return <div className="p-8 text-center text-red-600">Propuesta no encontrada</div>;
  if (data.status === 'expired') {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <div className="text-5xl">⏰</div>
        <h1 className="text-2xl font-bold text-gray-700">Propuesta expirada</h1>
        <p className="text-gray-500">Esta propuesta ya no está vigente. Contacta a Kiva360 para una nueva.</p>
      </div>
    );
  }

  const { calculated, plan_config } = data;

  if (accepted) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-6">
        <div className="text-5xl">✅</div>
        <h1 className="text-2xl font-bold text-green-700">Propuesta aceptada</h1>
        <p className="text-gray-600">El siguiente paso es firmar el contrato de servicio.</p>
        <a href={`/contrato?ref=${ref}`}
          className="inline-block bg-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-blue-700">
          Ir a firmar contrato →
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <p className="text-sm text-blue-600 font-semibold">Propuesta Comercial</p>
        <h1 className="text-3xl font-bold text-gray-900">Kiva360 para {data.company_name}</h1>
        <p className="text-gray-500">Ref: {data.reference}</p>
        {data.valid_until && (
          <p className="text-xs text-gray-400">Válida hasta: {new Date(data.valid_until).toLocaleDateString('es-CL')}</p>
        )}
      </div>

      {/* Plan */}
      <div className="bg-white border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold capitalize">Plan {plan_config?.nombre || data.plan}</h2>
          <div className="text-right">
            <p className="text-3xl font-bold text-blue-600">${calculated.total_mensual.toLocaleString('es-CL')}</p>
            <p className="text-xs text-gray-500">mensual · IVA incluido</p>
          </div>
        </div>

        {calculated.descuento > 0 && (
          <div className="bg-green-50 text-green-700 text-sm px-3 py-1 rounded mb-4 inline-block">
            {data.discount_percent}% descuento aplicado
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 text-center border-t pt-4">
          <div><p className="text-xs text-gray-500">Neto</p><p className="font-semibold">${calculated.precio_neto.toLocaleString('es-CL')}</p></div>
          <div><p className="text-xs text-gray-500">IVA</p><p className="font-semibold">${calculated.iva.toLocaleString('es-CL')}</p></div>
          <div><p className="text-xs text-gray-500">Total</p><p className="font-bold text-blue-600">${calculated.total_mensual.toLocaleString('es-CL')}</p></div>
        </div>
      </div>

      {/* Features */}
      {plan_config?.features && (
        <div className="bg-white border rounded-xl p-6">
          <h2 className="font-semibold text-lg mb-4">Incluye</h2>
          <ul className="grid grid-cols-2 gap-2 text-sm text-gray-700">
            {plan_config.features.map((f, i) => <li key={i} className="flex gap-2"><span className="text-green-600">✓</span>{f}</li>)}
          </ul>
        </div>
      )}

      {/* Términos */}
      <div className="bg-gray-50 border rounded-xl p-6 text-sm text-gray-600 space-y-2">
        <p>• Trial: <strong>{data.trial_days} días sin costo</strong></p>
        <p>• Sin contratos de permanencia mínima</p>
        <p>• Cancelación con {data.cancellation_days} días de aviso, sin multas</p>
        <p>• Cobro el día 30 de cada mes · 5 días de gracia</p>
        <p>• Soporte técnico incluido</p>
      </div>

      {/* CTA */}
      <div className="text-center space-y-4">
        <button onClick={handleAccept} disabled={accepting}
          className="bg-blue-600 text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 disabled:opacity-50 shadow-lg">
          {accepting ? 'Procesando...' : 'Aceptar propuesta'}
        </button>
        <p className="text-xs text-gray-400">Al aceptar, se te redirigirá a firmar el contrato de servicio.</p>
      </div>
    </div>
  );
}
