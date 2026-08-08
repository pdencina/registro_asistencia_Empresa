import { useState, useEffect, useRef } from 'react';
import { MapPin, Shield, Loader, ToggleLeft, ToggleRight, Building2, Upload, Trash2, FileText, ExternalLink, Printer, Bell, CreditCard, Calendar, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { useToast } from '../components/Toast';
import InfoTooltip from '../components/InfoTooltip';

const API_BASE = '/api';

function getTenantSlug() {
  const path = window.location.pathname;
  const match = path.match(/^\/admin\/([^/]+)/);
  return match ? match[1] : null;
}

function tenantHeaders() {
  const slug = getTenantSlug();
  return slug ? { 'x-tenant-slug': slug } : {};
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({ geolocation_enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [contractData, setContractData] = useState(null);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [subscribing, setSubscribing] = useState(false);
  const [showSubscribeForm, setShowSubscribeForm] = useState(false);
  const [subscribeEmail, setSubscribeEmail] = useState('');
  const logoInputRef = useRef(null);
  const toast = useToast();

  function showMessage(text, type = 'success') {
    if (type === 'error') toast.error(text);
    else toast.success(text);
  }

  useEffect(() => {
    loadSettings();
    loadLogo();
    loadContract();
    loadSubscription();
  }, []);

  async function loadSettings() {
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        headers: { ...tenantHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadLogo() {
    try {
      const res = await fetch(`${API_BASE}/settings/logo`, {
        headers: { ...tenantHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.logo_url);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadContract() {
    const slug = getTenantSlug();
    if (!slug) return;
    try {
      const res = await fetch(`${API_BASE}/contracts?tenant=${slug}`);
      if (res.ok) {
        const data = await res.json();
        if (data.contract?.estado === 'firmado' || data.contract?.estado === 'firmado_cliente') {
          setContractData(data.contract);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function loadSubscription() {
    const slug = getTenantSlug();
    if (!slug) return;
    try {
      const res = await fetch(`${API_BASE}/billing/status?tenant_slug=${slug}`, {
        headers: { ...tenantHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        setSubscriptionData(data);
      }
    } catch (err) {
      console.error(err);
    }
    // Cargar historial de pagos
    try {
      const res = await fetch(`${API_BASE}/billing/payments`, { headers: { ...tenantHeaders() } });
      if (res.ok) {
        const data = await res.json();
        setPaymentHistory(data.payments || []);
      }
    } catch (err) {}
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showMessage('Solo se permiten archivos de imagen', 'error');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showMessage('El archivo no debe superar 2 MB', 'error');
      return;
    }

    setUploadingLogo(true);
    setMessage('');

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result;
        const res = await fetch(`${API_BASE}/settings/logo`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...tenantHeaders() },
          body: JSON.stringify({ logo: base64 }),
        });

        if (res.ok) {
          const data = await res.json();
          setLogoUrl(data.logo_url);
          showMessage('Logo actualizado correctamente');
        } else {
          const err = await res.json();
          showMessage(err.error || 'Error al subir logo', 'error');
        }
        setUploadingLogo(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      showMessage('Error de conexión', 'error');
      setUploadingLogo(false);
    }

    // Reset input
    if (logoInputRef.current) logoInputRef.current.value = '';
  }

  async function handleLogoDelete() {
    if (!confirm('¿Eliminar el logo de la empresa?')) return;
    setUploadingLogo(true);
    try {
      const res = await fetch(`${API_BASE}/settings/logo`, { method: 'DELETE', headers: { ...tenantHeaders() } });
      if (res.ok) {
        setLogoUrl(null);
        showMessage('Logo eliminado');
      } else {
        const err = await res.json();
        showMessage(err.error || 'Error al eliminar', 'error');
      }
    } catch (err) {
      showMessage('Error de conexión', 'error');
    } finally {
      setUploadingLogo(false);
    }
  }

  async function toggleGeolocation() {
    setSaving(true);
    setMessage('');
    try {
      const newValue = !settings.geolocation_enabled;
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...tenantHeaders() },
        body: JSON.stringify({ geolocation_enabled: newValue }),
      });
      if (res.ok) {
        setSettings({ ...settings, geolocation_enabled: newValue });
        showMessage(newValue ? 'Geolocalización activada' : 'Geolocalización desactivada');
      } else {
        const err = await res.json();
        showMessage(err.error || 'Error al guardar', 'error');
      }
    } catch (err) {
      showMessage('Error de conexión', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-96">
        <Loader className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-8">Configuración</h2>

      {/* Grid layout for settings cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Logo de empresa */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-primary-50 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary-600" />
            </div>
            <h3 className="font-bold text-gray-900">Logo de la Empresa</h3>
            <InfoTooltip text="El logo se muestra en la pantalla de marcaje de asistencia para que los colaboradores identifiquen su empresa." />
          </div>

          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <Building2 className="w-8 h-8 text-gray-300" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-gray-500 mb-3">Se muestra al registrar asistencia.</p>
              <div className="flex items-center gap-2">
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleLogoUpload} className="hidden" />
                <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}
                  className="flex items-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingLogo ? 'Subiendo...' : logoUrl ? 'Cambiar' : 'Subir Logo'}
                </button>
                {logoUrl && (
                  <button onClick={handleLogoDelete} disabled={uploadingLogo}
                    className="flex items-center gap-1 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-xs font-medium transition">
                    <Trash2 className="w-3.5 h-3.5" /> Eliminar
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-2">PNG, JPG, SVG, WebP · Máx 2 MB</p>
            </div>
          </div>
        </div>

        {/* Seguridad */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-600" />
            </div>
            <h3 className="font-bold text-gray-900">Seguridad</h3>
            <InfoTooltip text="Controles de seguridad para el registro de asistencia. Define restricciones de ubicación para los marcajes." />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <MapPin className={`w-5 h-5 ${settings.geolocation_enabled ? 'text-emerald-600' : 'text-gray-400'}`} />
              <div>
                <p className="font-medium text-gray-900 text-sm">Geolocalización <InfoTooltip text="Si se activa, los colaboradores solo pueden marcar asistencia dentro de un radio de 200 metros de la ubicación configurada de la empresa." /></p>
                <p className="text-xs text-gray-500">
                  {settings.geolocation_enabled ? 'Solo desde ubicación autorizada (200m)' : 'Marcaje desde cualquier lugar'}
                </p>
              </div>
            </div>
            <button onClick={toggleGeolocation} disabled={saving} className="shrink-0">
              {settings.geolocation_enabled ? <ToggleRight className="w-9 h-9 text-emerald-600" /> : <ToggleLeft className="w-9 h-9 text-gray-400" />}
            </button>
          </div>
        </div>

      </div>

      {/* Notificaciones — Full width */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mt-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <h3 className="font-bold text-gray-900">Notificaciones y Alertas</h3>
          <InfoTooltip text="Configura alertas por correo electrónico cuando haya ausencias o atrasos sin justificar." />
        </div>

        {/* Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl mb-5">
          <div className="flex items-center gap-3">
            <Bell className={`w-5 h-5 ${settings.alerts_enabled !== false ? 'text-amber-600' : 'text-gray-400'}`} />
            <div>
              <p className="font-medium text-gray-900 text-sm">Alertas diarias de ausentes <InfoTooltip text="Envía un correo al email configurado cada vez que se detectan colaboradores ausentes sin justificación al inicio de la jornada." /></p>
              <p className="text-xs text-gray-500">
                {settings.alerts_enabled !== false ? 'Correo cuando haya ausencias sin justificar' : 'Desactivadas'}
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              const newValue = !(settings.alerts_enabled !== false);
              const slug = getTenantSlug();
              const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...(slug ? { 'x-tenant-slug': slug } : {}) },
                body: JSON.stringify({ alerts_enabled: newValue }),
              });
              if (res.ok) {
                setSettings({ ...settings, alerts_enabled: newValue });
                toast.success(newValue ? 'Alertas activadas' : 'Alertas desactivadas');
              }
            }}
            className="shrink-0"
          >
            {settings.alerts_enabled !== false ? <ToggleRight className="w-9 h-9 text-amber-600" /> : <ToggleLeft className="w-9 h-9 text-gray-400" />}
          </button>
        </div>

        {/* Email + Tolerance in grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email de alertas <InfoTooltip text="Dirección de correo donde se enviarán las notificaciones de ausencias y atrasos. Puede ser del área de RRHH o del administrador." /></label>
            <div className="flex gap-2">
              <input type="email" value={settings.notification_email || ''}
                onChange={e => setSettings({ ...settings, notification_email: e.target.value })}
                placeholder="admin@empresa.cl"
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              <button onClick={async () => {
                const slug = getTenantSlug();
                const res = await fetch('/api/settings', { method: 'PUT',
                  headers: { 'Content-Type': 'application/json', ...(slug ? { 'x-tenant-slug': slug } : {}) },
                  body: JSON.stringify({ notification_email: settings.notification_email }) });
                if (res.ok) toast.success('Email guardado');
              }} className="px-3 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition">
                Guardar
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Tolerancia de atraso <InfoTooltip text="Minutos que se espera después de la hora de entrada antes de considerar al colaborador como 'ausente' y enviar la alerta. Diferente a la tolerancia del horario." /></label>
            <div className="flex gap-2 items-center">
              <input type="number" min="5" max="60" value={settings.alert_tolerance_minutes || 15}
                onChange={e => setSettings({ ...settings, alert_tolerance_minutes: parseInt(e.target.value) || 15 })}
                className="w-20 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
              <span className="text-xs text-gray-500">min</span>
              <button onClick={async () => {
                const slug = getTenantSlug();
                const res = await fetch('/api/settings', { method: 'PUT',
                  headers: { 'Content-Type': 'application/json', ...(slug ? { 'x-tenant-slug': slug } : {}) },
                  body: JSON.stringify({ alert_tolerance_minutes: settings.alert_tolerance_minutes }) });
                if (res.ok) toast.success('Tolerancia actualizada');
              }} className="px-3 py-2.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition">
                Guardar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Suscripción y Facturación */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mt-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 bg-violet-50 rounded-lg flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-violet-600" />
          </div>
          <h3 className="font-bold text-gray-900">Suscripción y Facturación</h3>
        </div>

        {subscriptionData ? (
          <div className="space-y-4">
            {/* Estado + Plan */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Plan actual</p>
                <p className="text-lg font-bold text-gray-900 capitalize">{subscriptionData.plan || 'Trial'}</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">Estado</p>
                <div className="flex items-center gap-2">
                  {subscriptionData.status === 'active' || subscriptionData.status === 'trial' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : subscriptionData.status === 'past_due' ? (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Clock className="w-4 h-4 text-amber-500" />
                  )}
                  <p className={`text-lg font-bold ${
                    subscriptionData.status === 'active' ? 'text-emerald-600' :
                    subscriptionData.status === 'trial' ? 'text-blue-600' :
                    subscriptionData.status === 'past_due' ? 'text-red-600' : 'text-amber-600'
                  }`}>
                    {subscriptionData.status === 'active' ? 'Activa' :
                     subscriptionData.status === 'trial' ? 'Prueba gratuita' :
                     subscriptionData.status === 'past_due' ? 'Pago pendiente' :
                     subscriptionData.status === 'cancelled' ? 'Cancelada' : subscriptionData.status}
                  </p>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="text-xs text-gray-500 uppercase font-semibold mb-1">
                  {subscriptionData.status === 'trial' ? 'Trial vence' : 'Próximo cobro'}
                </p>
                <p className="text-lg font-bold text-gray-900">
                  {subscriptionData.status === 'trial' && subscriptionData.trial_ends_at
                    ? new Date(subscriptionData.trial_ends_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
                    : subscriptionData.current_period_end
                    ? new Date(subscriptionData.current_period_end).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—'}
                </p>
              </div>
            </div>

            {/* Período actual */}
            {subscriptionData.current_period_start && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <Calendar className="w-4 h-4 text-blue-600" />
                <p className="text-sm text-blue-800">
                  Período actual: <strong>{new Date(subscriptionData.current_period_start).toLocaleDateString('es-CL')}</strong> al <strong>{new Date(subscriptionData.current_period_end).toLocaleDateString('es-CL')}</strong>
                </p>
              </div>
            )}

            {/* Trial warning */}
            {subscriptionData.status === 'trial' && subscriptionData.trial_ends_at && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-amber-900">Período de prueba</p>
                    <p className="text-sm text-amber-700 mt-1">
                      Tu prueba gratuita termina el <strong>{new Date(subscriptionData.trial_ends_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.
                      Después de esa fecha necesitarás activar un plan para seguir usando Flexio.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Datos de pago */}
            <div className="border-t pt-4 mt-4">
              <p className="text-xs text-gray-500 font-semibold uppercase mb-3">Datos para transferencia</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-[11px] text-gray-500">Razón Social</p>
                  <p className="font-medium text-gray-900">Flexio Technologies Spa</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-[11px] text-gray-500">RUT</p>
                  <p className="font-medium text-gray-900">78.479.402-4</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-[11px] text-gray-500">Banco</p>
                  <p className="font-medium text-gray-900">Bci</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-[11px] text-gray-500">Tipo de cuenta</p>
                  <p className="font-medium text-gray-900">Cta. Cte. en pesos</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-[11px] text-gray-500">N° Cuenta</p>
                  <p className="font-medium text-gray-900 font-mono">68569265</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-[11px] text-gray-500">Email</p>
                  <p className="font-medium text-gray-900">pablo@flexio.cl</p>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">Envía tu comprobante a pablo@flexio.cl para activar el pago más rápido.</p>
            </div>

            {/* Cobro automático con tarjeta */}
            <div className="border-t pt-4 mt-4">
              {subscriptionData.mp_subscription_id && subscriptionData.status === 'active' ? (
                <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-medium text-emerald-900 text-sm">Tarjeta inscrita — Cobro automático activo</p>
                    <p className="text-xs text-emerald-700">Se cobra el día 30 de cada mes. Si falla, se reintenta hasta 3 veces en 5 días.</p>
                  </div>
                </div>
              ) : !showSubscribeForm ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Cobro automático con tarjeta</p>
                    <p className="text-xs text-gray-500">Se cobra el día 30 de cada mes. 5 días de gracia si falla.</p>
                  </div>
                  <button onClick={() => { setSubscribeEmail(settings.notification_email || ''); setShowSubscribeForm(true); }}
                    className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium transition">
                    <CreditCard className="w-4 h-4" /> Suscribir tarjeta
                  </button>
                </div>
              ) : (
                <div className="p-5 bg-violet-50 border border-violet-200 rounded-xl space-y-4">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-violet-600" />
                    <p className="font-semibold text-violet-900">Inscribir tarjeta para cobro automático</p>
                  </div>
                  <p className="text-sm text-violet-700">
                    Serás redirigido a MercadoPago para inscribir tu tarjeta de crédito o débito. 
                    El cobro de <strong>$1.590 × colaborador</strong> se realizará automáticamente el día 30 de cada mes.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-violet-700 mb-1.5">Email asociado al pago</label>
                    <input type="email" value={subscribeEmail} onChange={e => setSubscribeEmail(e.target.value)}
                      placeholder="tu@email.cl"
                      className="w-full px-3 py-2.5 border border-violet-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none bg-white" />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={async () => {
                        if (!subscribeEmail) { toast.error('Ingresa un email'); return; }
                        setSubscribing(true);
                        try {
                          const res = await fetch(`${API_BASE}/billing/subscribe`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...tenantHeaders() },
                            body: JSON.stringify({ payer_email: subscribeEmail }),
                          });
                          const data = await res.json();
                          if (data.init_point) {
                            window.location.href = data.init_point;
                          } else {
                            toast.error(data.error || 'Error al crear suscripción');
                          }
                        } catch { toast.error('Error de conexión'); }
                        setSubscribing(false);
                      }}
                      disabled={subscribing || !subscribeEmail}
                      className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
                    >
                      <CreditCard className="w-4 h-4" />
                      {subscribing ? 'Redirigiendo a MercadoPago...' : 'Continuar a MercadoPago'}
                    </button>
                    <button onClick={() => setShowSubscribeForm(false)}
                      className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-medium transition">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Historial de pagos */}
            {paymentHistory.length > 0 && (
              <div className="border-t pt-4 mt-4">
                <p className="text-xs text-gray-500 font-semibold uppercase mb-3">Historial de pagos</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b text-xs">
                        <th className="pb-2 font-medium">Período</th>
                        <th className="pb-2 font-medium">Monto</th>
                        <th className="pb-2 font-medium">Estado</th>
                        <th className="pb-2 font-medium">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.slice(0, 6).map(p => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-2 text-gray-700">{p.periodo}</td>
                          <td className="py-2 font-medium">${p.monto_iva?.toLocaleString('es-CL')}</td>
                          <td className="py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              p.estado === 'pagado' ? 'bg-emerald-100 text-emerald-700' :
                              p.estado === 'pendiente' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>{p.estado_label}</span>
                          </td>
                          <td className="py-2 text-gray-500 text-xs">
                            {p.pagado_at ? new Date(p.pagado_at).toLocaleDateString('es-CL') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 bg-gray-50 rounded-xl text-center">
            <p className="text-sm text-gray-500">Cargando información de suscripción...</p>
          </div>
        )}
      </div>

      {/* Contrato */}
      <div className="card mt-6">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="w-5 h-5 text-primary-600" />
          <h3 className="font-bold text-gray-900">Contrato de Servicio</h3>
        </div>

        {contractData ? (
          <div>
            <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl mb-4">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-emerald-900">Contrato firmado</p>
                <p className="text-sm text-emerald-700">
                  Firmado por {contractData.firmante_nombre} el {new Date(contractData.firmado_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={`/contrato/${getTenantSlug()}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                Ver contrato completo
              </a>
              <button
                onClick={() => {
                  const win = window.open(`/contrato/${getTenantSlug()}`, '_blank');
                  setTimeout(() => win?.print(), 1500);
                }}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-all"
              >
                <Printer className="w-4 h-4" />
                Exportar PDF
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-gray-50 rounded-xl text-center">
            <p className="text-sm text-gray-500 mb-2">No hay contrato firmado aún.</p>
            <p className="text-xs text-gray-400">El contrato será proporcionado por Flexio para su firma digital.</p>
          </div>
        )}
      </div>
      {/* Export & Backup */}
      <div className="card mt-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-primary-600" />
          <h3 className="font-bold text-gray-900">Datos y Portabilidad</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">Descarga toda la información de tu empresa (empleados, registros, horarios, justificativos). Conforme a la Ley 21.719 de Protección de Datos Personales.</p>
        <button
          onClick={async () => {
            const slug = getTenantSlug();
            const res = await fetch('/api/export', { headers: slug ? { 'x-tenant-slug': slug } : {} });
            if (res.ok) {
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `flexio-export-${slug}-${new Date().toISOString().split('T')[0]}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success('Backup descargado');
            } else {
              toast.error('Error al exportar');
            }
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 text-white rounded-xl text-sm font-medium hover:bg-gray-900 transition"
        >
          <FileText className="w-4 h-4" /> Descargar backup completo (JSON)
        </button>
      </div>

    </div>
  );
}
