import { useState, useEffect, useRef } from 'react';
import { MapPin, Shield, Loader, ToggleLeft, ToggleRight, Building2, Upload, Trash2 } from 'lucide-react';

const API_BASE = '/api';

export default function SettingsPage() {
  const [settings, setSettings] = useState({ geolocation_enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

  useEffect(() => {
    loadSettings();
    loadLogo();
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

  async function loadLogo() {
    try {
      const res = await fetch(`${API_BASE}/settings/logo`);
      if (res.ok) {
        const data = await res.json();
        setLogoUrl(data.logo_url);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setMessage('Error: Solo se permiten archivos de imagen');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setMessage('Error: El archivo no debe superar 2 MB');
      setTimeout(() => setMessage(''), 3000);
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logo: base64 }),
        });

        if (res.ok) {
          const data = await res.json();
          setLogoUrl(data.logo_url);
          setMessage('Logo actualizado correctamente');
        } else {
          const err = await res.json();
          setMessage(err.error || 'Error al subir logo');
        }
        setUploadingLogo(false);
        setTimeout(() => setMessage(''), 3000);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setMessage('Error de conexión');
      setUploadingLogo(false);
      setTimeout(() => setMessage(''), 3000);
    }

    // Reset input
    if (logoInputRef.current) logoInputRef.current.value = '';
  }

  async function handleLogoDelete() {
    if (!confirm('¿Eliminar el logo de la empresa?')) return;
    setUploadingLogo(true);
    try {
      const res = await fetch(`${API_BASE}/settings/logo`, { method: 'DELETE' });
      if (res.ok) {
        setLogoUrl(null);
        setMessage('Logo eliminado');
      }
    } catch (err) {
      setMessage('Error de conexión');
    } finally {
      setUploadingLogo(false);
      setTimeout(() => setMessage(''), 3000);
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

      {/* Logo de empresa */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-6">
          <Building2 className="w-5 h-5 text-primary-600" />
          <h3 className="font-bold text-gray-900">Logo de la Empresa</h3>
        </div>

        <div className="flex items-center gap-6">
          {/* Preview */}
          <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50 shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo empresa" className="w-full h-full object-contain p-2" />
            ) : (
              <Building2 className="w-10 h-10 text-gray-300" />
            )}
          </div>

          {/* Actions */}
          <div className="flex-1">
            <p className="text-sm text-gray-500 mb-3">
              Este logo se mostrará a tus colaboradores cuando registren su asistencia.
            </p>
            <div className="flex items-center gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {uploadingLogo ? 'Subiendo...' : logoUrl ? 'Cambiar Logo' : 'Subir Logo'}
              </button>
              {logoUrl && (
                <button
                  onClick={handleLogoDelete}
                  disabled={uploadingLogo}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">PNG, JPG, SVG o WebP. Máximo 2 MB.</p>
          </div>
        </div>
      </div>

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
      </div>
    </div>
  );
}
