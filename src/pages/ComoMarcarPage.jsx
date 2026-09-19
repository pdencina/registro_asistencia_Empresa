import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Monitor, Smartphone, Copy, Check, QrCode, MapPin, Loader2, LocateFixed } from 'lucide-react';
import { devicesApi } from '../api';

/**
 * Página "Cómo marcar" del panel admin.
 * Muestra con claridad las 2 URLs oficiales de marcaje + QR + instrucciones.
 * Da al cliente total claridad de cómo operar el sistema el día 1.
 */

// Genera un QR usando la API pública de qrserver (imagen)
function QrImage({ url, size = 150 }) {
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&margin=0`}
      alt="Código QR"
      width={size}
      height={size}
      className="rounded-lg border border-gray-200 bg-white p-1"
    />
  );
}

function LinkCard({ icon: Icon, color, title, subtitle, url, description, tips }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mb-3">{subtitle}</p>

          {/* URL + copiar */}
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <code className="flex-1 text-sm text-gray-800 truncate">{url}</code>
            <button onClick={copy}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition shrink-0 ${copied ? 'bg-emerald-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'}`}>
              {copied ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
            </button>
          </div>

          <p className="text-sm text-gray-600 mt-3">{description}</p>

          {tips && (
            <ul className="mt-3 space-y-1">
              {tips.map((t, i) => (
                <li key={i} className="flex gap-2 text-xs text-gray-500">
                  <span className="text-primary-600 shrink-0">•</span>{t}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* QR */}
        <div className="hidden sm:flex flex-col items-center gap-1 shrink-0">
          <QrImage url={url} size={110} />
          <span className="text-[10px] text-gray-400">Escanea para abrir</span>
        </div>
      </div>
    </div>
  );
}

// Tarjeta para configurar la ubicación fija del tótem sin correr scripts.
// Esta ubicación se usa como evidencia en las marcas hechas desde la URL del tótem.
function TotemLocationCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [name, setName] = useState('');
  const [configured, setConfigured] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok'|'error', text }

  useEffect(() => {
    let alive = true;
    devicesApi.getTotemLocation()
      .then((d) => {
        if (!alive) return;
        setConfigured(d.configured);
        if (d.lat != null) setLat(String(d.lat));
        if (d.lng != null) setLng(String(d.lng));
        if (d.name) setName(d.name);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setMsg({ type: 'error', text: 'Tu navegador no permite obtener la ubicación.' });
      return;
    }
    setLocating(true);
    setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
        setMsg({ type: 'ok', text: 'Ubicación tomada de tu dispositivo. Revísala y guarda.' });
      },
      (err) => {
        setLocating(false);
        setMsg({ type: 'error', text: 'No se pudo obtener la ubicación: ' + err.message });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function save() {
    const nLat = Number(lat), nLng = Number(lng);
    if (Number.isNaN(nLat) || Number.isNaN(nLng) || !lat || !lng) {
      setMsg({ type: 'error', text: 'Ingresa una latitud y longitud válidas.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await devicesApi.setTotemLocation(nLat, nLng, name || 'Tótem principal');
      setConfigured(true);
      setMsg({ type: 'ok', text: 'Ubicación del tótem guardada correctamente.' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'No se pudo guardar.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-gray-900">
          <MapPin className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900">Ubicación del tótem fijo</h3>
          <p className="text-sm text-gray-500 mb-3">
            El tótem es un punto fijo, así que reporta siempre esta ubicación (no la del navegador). Configúrala una vez.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Latitud</label>
                  <input
                    type="text" inputMode="decimal" value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="-33.4489"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Longitud</label>
                  <input
                    type="text" inputMode="decimal" value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="-70.6693"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre (opcional)</label>
                <input
                  type="text" value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Entrada principal"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4">
                <button
                  onClick={useMyLocation} disabled={locating}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition disabled:opacity-60"
                >
                  {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
                  Usar mi ubicación actual
                </button>
                <button
                  onClick={save} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 transition disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Guardar ubicación
                </button>
              </div>

              {msg && (
                <p className={`text-sm mt-3 ${msg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {msg.text}
                </p>
              )}
              {!msg && configured && (
                <p className="text-xs text-gray-400 mt-3">Ubicación configurada. Puedes actualizarla cuando quieras.</p>
              )}

              <p className="text-xs text-gray-400 mt-3">
                Tip: párate junto al tótem y usa "Usar mi ubicación actual" para tomar las coordenadas exactas.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComoMarcarPage() {
  const { tenant } = useParams();
  const base = 'https://www.flexio.cl';

  const totemUrl = `${base}/marcaje/${tenant}`;
  const movilUrl = `${base}/movil/${tenant}`;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Cómo marcar asistencia</h2>
        <p className="text-gray-500 mt-1">Estas son las dos formas en que tu equipo puede registrar su asistencia. Elige la que mejor se adapte a tu operación.</p>
      </div>

      <div className="space-y-5">
        {/* Tótem fijo */}
        <LinkCard
          icon={Monitor}
          color="bg-primary-600"
          title="Tótem fijo (tablet en la entrada)"
          subtitle="La forma más común. Una tablet o computador en la entrada."
          url={totemUrl}
          description="Monta una tablet en la entrada del recinto. Cada colaborador marca su entrada y salida con su RUT o PIN personal. Ideal para oficinas, plantas, packing y campos con un punto de acceso."
          tips={[
            'Abre esta URL en la tablet y déjala en pantalla completa',
            'Puedes usar varias tablets con la misma URL para alto volumen',
            'Funciona sin internet: guarda las marcas y las sincroniza al reconectar',
          ]}
        />

        {/* Ubicación del tótem */}
        <TotemLocationCard />

        {/* Móvil */}
        <LinkCard
          icon={Smartphone}
          color="bg-emerald-600"
          title="Marcaje móvil (celular del trabajador)"
          subtitle="Para gente en terreno, cuadrillas o trabajo distribuido."
          url={movilUrl}
          description="El colaborador marca desde su propio celular. Se registra la ubicación GPS de cada marca. Ideal para vendedores, técnicos en terreno, cuadrillas agrícolas o equipos que no pasan por un punto fijo."
          tips={[
            'Comparte esta URL o el QR con tu equipo por WhatsApp',
            'Cada marca queda con su ubicación GPS y dirección',
            'Si la marca ocurre fuera del perímetro, queda registrada la evidencia',
          ]}
        />

        {/* Nota */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
          <QrCode className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">Tip para implementar</p>
            <p className="text-sm text-blue-700 mt-1">
              Imprime el QR del tótem y pégalo en la entrada, o guárdalo como acceso directo en la tablet.
              Para el móvil, envía el link a tu equipo el primer día. Ambos métodos registran con el mismo nivel de integridad (hash + sello de tiempo).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
