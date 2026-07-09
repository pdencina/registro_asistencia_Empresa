import { useState, useEffect } from 'react';
import { CreditCard, CheckCircle, AlertCircle, Loader, ExternalLink } from 'lucide-react';

export default function BillingPage({ tenantId }) {
  const [plans, setPlans] = useState([]);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadBillingInfo(); }, []);

  async function loadBillingInfo() {
    try {
      const plansRes = await fetch('/api/billing/plans');
      if (plansRes.ok) {
        const plansData = await plansRes.json();
        setPlans(plansData);
      }

      // Cargar estado actual de suscripción del tenant
      if (tenantId) {
        const statusRes = await fetch(`/api/billing/status?tenant_id=${tenantId}`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setCurrentPlan(statusData.plan);
          setSubscriptionStatus(statusData.status);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubscribe(planId) {
    setSubscribing(true);
    setError('');

    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          plan: planId,
          payer_email: '', // Se pedirá en el checkout de MP
        }),
      });

      const data = await res.json();

      if (res.ok && data.init_point) {
        // Redirigir a MercadoPago para que ingrese su tarjeta
        window.location.href = data.init_point;
      } else {
        setError(data.error || 'Error al crear suscripción');
      }
    } catch (err) {
      setError('Error de conexión');
    } finally {
      setSubscribing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Suscripción y Pagos</h2>
        <p className="text-gray-500 mt-1">Gestiona tu plan y método de pago</p>
      </div>

      {/* Estado actual */}
      {subscriptionStatus && (
        <div className={`rounded-xl p-5 mb-8 border ${
          subscriptionStatus === 'active' ? 'bg-emerald-50 border-emerald-200' :
          subscriptionStatus === 'trial' ? 'bg-blue-50 border-blue-200' :
          'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-center gap-3">
            {subscriptionStatus === 'active' ? (
              <CheckCircle className="w-6 h-6 text-emerald-500" />
            ) : (
              <AlertCircle className="w-6 h-6 text-yellow-500" />
            )}
            <div>
              <p className="font-semibold text-gray-900">
                {subscriptionStatus === 'active' && `Plan ${currentPlan} activo`}
                {subscriptionStatus === 'trial' && 'Período de prueba'}
                {subscriptionStatus === 'pending' && 'Pago pendiente'}
                {subscriptionStatus === 'cancelled' && 'Suscripción cancelada'}
              </p>
              <p className="text-sm text-gray-500">
                {subscriptionStatus === 'trial' && 'Tu prueba gratuita de 30 días está activa. Suscríbete para continuar después.'}
                {subscriptionStatus === 'active' && 'Tu tarjeta se cobra automáticamente cada mes.'}
                {subscriptionStatus === 'pending' && 'Completa el pago para activar tu cuenta.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl mb-6">
          {error}
        </div>
      )}

      {/* Planes */}
      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-2xl p-6 border-2 transition-all ${
              currentPlan === plan.id
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-200 hover:border-primary-200'
            }`}
          >
            <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
            <div className="mt-2 mb-4">
              <span className="text-3xl font-bold text-gray-900">${plan.price.toLocaleString('es-CL')}</span>
              <span className="text-gray-500">/mes</span>
            </div>
            <ul className="space-y-2 mb-6">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <CheckCircle className="w-4 h-4 text-primary-500 mt-0.5 flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>
            {currentPlan === plan.id ? (
              <div className="w-full py-3 bg-primary-100 text-primary-700 text-center rounded-xl font-medium text-sm">
                Plan actual
              </div>
            ) : (
              <button
                onClick={() => handleSubscribe(plan.id)}
                disabled={subscribing}
                className="w-full py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {subscribing ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    Suscribirse
                  </>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-sm text-gray-400 mt-6">
        Pagos procesados de forma segura por MercadoPago. Puedes cancelar en cualquier momento.
      </p>
    </div>
  );
}
