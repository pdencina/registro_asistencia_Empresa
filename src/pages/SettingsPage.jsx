import { useState, useEffect } from 'react';
import { MapPin, Shield, Loader, ToggleLeft, ToggleRight, Bell, Send } from 'lucide-react';

const API_BASE = '/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState({ geolocation_enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [testingWebhook, setTestingWebhook] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await fetch(`${API_BASE}/settings`);
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

  async function toggleGeolocation() {
    setSaving(true);
    setMessage('');
    try {
      const newValue = !settings.geolocation_enabled;
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geolocation_enabled: newValue }),
      });
      if (res.ok) {
        setSettings({ ...settings, geolocation_enabled: newValue });
        setMessage(newValue ? 'Geolocalización activada' : 'Geolocalización desactivada');
      } else {
        const err = await res.json();
        setMessage(err.error || 'Error al guardar');
      }
    } catch (err) {
      setMessage('Error de conexión');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  }

  async function testWebhook() {
    setTestingWebhook(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/notifications/check-absent`);
      const data = await res.json();
      if (res.ok) {
        if (data.webhook_status) {
          setMessage(`Notificación enviada (${data.absent_count} ausentes)`);
        } else {
          setMessage(`Reporte: ${data.absent_count} ausentes — ${data.message}`);
        }
      } else {
        setMessage(data.error || 'Error al enviar');
      }
    } catch (err) {
      setMessage('Error de conexión');
    } finally {
      setTestingWebhook(false);
      setTimeout(() => setMessage(''), 5000);
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
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Configuración</h2>

      {message && (
        <div className={`mb-6 p-3 rounded-xl text-sm font-medium ${
          message.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
        }`}>
          {message}
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-5 h-5 text-primary-600" />
          <h3 className="font-bold text-gray-900">Seguridad del Tótem</h3>
        </div>

        {/* Geolocation toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl mb-3">
          <div className="flex items-center gap-3">
            <MapPin className={`w-5 h-5 ${settings.geolocation_enabled ? 'text-emerald-600' : 'text-gray-400'}`} />
            <div>
              <p className="font-medium text-gray-900">Verificación por Geolocalización</p>
              <p className="text-sm text-gray-500">
                {settings.geolocation_enabled
                  ? 'El tótem solo funciona desde la ubicación autorizada (200m)'
                  : 'El tótem funciona desde cualquier ubicación'
                }
              </p>
            </div>
          </div>
          <button
            onClick={toggleGeolocation}
            disabled={saving}
            className="shrink-0"
          >
            {settings.geolocation_enabled ? (
              <ToggleRight className="w-10 h-10 text-emerald-600" />
            ) : (
              <ToggleLeft className="w-10 h-10 text-gray-400" />
            )}
          </button>
        </div>

        {/* Liveness info */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center gap-3">
            <Shield className={`w-5 h-5 text-gray-400`} />
            <div>
              <p className="font-medium text-gray-900">Detección Anti-Suplantación (Parpadeo)</p>
              <p className="text-sm text-gray-500">
                Desactivado temporalmente. Requiere buenas condiciones de luz y cámara de alta resolución.
              </p>
            </div>
          </div>
          <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">Próximamente</span>
        </div>
      </div>

      {/* Notifications */}
      <div className="card mt-6">
        <div className="flex items-center gap-3 mb-6">
          <Bell className="w-5 h-5 text-primary-600" />
          <h3 className="font-bold text-gray-900">Notificaciones</h3>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="font-medium text-gray-900 mb-1">Webhook de Ausencias</p>
            <p className="text-sm text-gray-500 mb-3">
              Envía una notificación con los colaboradores ausentes del día. Compatible con Slack, Teams, o cualquier webhook.
            </p>
            <p className="text-xs text-gray-400 mb-3">
              Configura la variable <code className="bg-gray-200 px-1 rounded">WEBHOOK_URL</code> en Vercel con la URL de tu webhook (ej: Slack Incoming Webhook).
            </p>
            <button
              onClick={testWebhook}
              disabled={testingWebhook}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {testingWebhook ? 'Enviando...' : 'Enviar Reporte Ahora'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
