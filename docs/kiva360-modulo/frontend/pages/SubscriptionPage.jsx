import { useState, useEffect } from 'react';
import PaymentInfo from '../components/PaymentInfo';

/**
 * Portal de Suscripción del Cliente — Kiva360
 * 
 * Muestra: estado de suscripción, próximo cobro, historial de pagos,
 * opción de registrar tarjeta para cobro automático.
 * 
 * Ruta: /mi-suscripcion?rut=XX.XXX.XXX-X
 */
export default function SubscriptionPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Obtener RUT del parámetro o del contexto de sesión
  const params = new URLSearchParams(window.location.search);
  const rut = params.get('rut');

  useEffect(() => {
    if (!rut) { setError('RUT no proporcionado'); setLoading(false); return; }
    fetch(`/api/subscriptions?company_rut=${encodeURIComponent(rut)}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError('Error al cargar'))
      .finally(() => setLoading(false));
  }, [rut]);

  if (loading) return <div className="p-8 text-center">Cargando...</div>;
  if (error) return <div className="p-8 text-center text-red-600">{error}</div>;
  if (!data) return null;

  const { subscription: sub, payments, payment_info } = data;

  const statusColors = {
    active: 'bg-green-100 text-green-800',
    grace_period: 'bg-yellow-100 text-yellow-800',
    past_due: 'bg-red-100 text-red-800',
    suspended: 'bg-red-200 text-red-900',
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi Suscripción</h1>
          <p className="text-gray-500">{sub.company_name}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColors[sub.status] || 'bg-gray-100'}`}>
          {sub.status_label}
        </span>
      </div>

      {/* Resumen */}
      <div className="bg-white border rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500 uppercase">Plan</p>
            <p className="text-lg font-bold text-blue-600 capitalize">{sub.plan}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Mensualidad</p>
            <p className="text-lg font-bold">${sub.price_monthly_total.toLocaleString('es-CL')}</p>
            <p className="text-[10px] text-gray-400">IVA incl.</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Próximo cobro</p>
            <p className="text-lg font-bold">{sub.next_billing_date}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Plazo de gracia</p>
            <p className="text-lg font-bold">{sub.grace_until}</p>
          </div>
        </div>

        {/* Período actual */}
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
          Período actual: <strong>{sub.current_period.start}</strong> al <strong>{sub.current_period.end}</strong>
        </div>
      </div>

      {/* Tarjeta registrada */}
      <div className="bg-white border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Medio de pago</h2>
        {sub.card.registered ? (
          <div className="flex items-center gap-4">
            <div className="w-12 h-8 bg-gray-200 rounded flex items-center justify-center text-xs font-bold uppercase">
              {sub.card.brand}
            </div>
            <div>
              <p className="font-medium">•••• •••• •••• {sub.card.last_four}</p>
              <p className="text-sm text-green-600">Cobro automático activo — día {sub.billing_day} de cada mes</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-gray-600 text-sm">No tienes tarjeta registrada. El cobro se hace por transferencia.</p>
            <button
              onClick={() => {/* TODO: integrar SDK del procesador */}}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Registrar tarjeta para cobro automático
            </button>
          </div>
        )}
      </div>

      {/* Datos para transferencia */}
      <PaymentInfo data={payment_info} />

      {/* Historial de pagos */}
      <div className="bg-white border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Historial de pagos</h2>
        {payments.length === 0 ? (
          <p className="text-gray-500 text-sm">Aún no hay pagos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2">Período</th>
                  <th className="pb-2">Total</th>
                  <th className="pb-2">Estado</th>
                  <th className="pb-2">Método</th>
                  <th className="pb-2">Fecha pago</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="py-2">{p.period}</td>
                    <td className="py-2 font-medium">${p.total.toLocaleString('es-CL')}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        p.status === 'paid' ? 'bg-green-100 text-green-700' :
                        p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>{p.status_label}</span>
                    </td>
                    <td className="py-2 text-gray-500">{p.method || '—'}</td>
                    <td className="py-2 text-gray-500">{p.paid_at ? new Date(p.paid_at).toLocaleDateString('es-CL') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
