import { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, Loader, History } from 'lucide-react';

/**
 * Política de marcación de la empresa (versionada). Solo administradores.
 * Los límites que impone el texto de la Res. Ex. N.º 38 se validan en el servidor y se muestran con su artículo.
 */

const METHODS = [
  { id: 'FACIAL', label: 'Reconocimiento facial' },
  { id: 'PIN', label: 'RUT + PIN (no biométrico)' },
];

const PRESETS = [
  { id: 'FACIAL_PIN', label: 'Facial + PIN de respaldo', primary: ['FACIAL'], fallback: ['PIN'] },
  { id: 'PIN_FACIAL', label: 'PIN + facial de respaldo', primary: ['PIN'], fallback: ['FACIAL'] },
  { id: 'FACIAL_ONLY', label: 'Solo facial', primary: ['FACIAL'], fallback: [] },
];

function toForm(p) {
  return {
    status: p.status,
    legacy_marking: p.legacy_marking,
    primary_methods: p.primary_methods,
    fallback_methods: p.fallback_methods,
    facial_threshold: p.facial_threshold,
    pin_min_length: p.pin_min_length,
    pin_max_attempts: p.pin_max_attempts,
    pin_lockout_minutes: p.pin_lockout_minutes,
    evidence_photo: p.evidence_photo,
    evidence_retention_days: p.evidence_retention_days ?? '',
    template_destroy_after_termination_days: p.template_destroy_after_termination_days,
    marks_retention_years: p.marks_retention_years,
    geo_mode: p.geo_mode,
    offline_allowed: !!(p.offline_policy && p.offline_policy.allowed),
    offline_max_age_hours: (p.offline_policy && p.offline_policy.max_age_hours) || 168,
    offline_justification: (p.offline_policy && p.offline_policy.justification) || '',
  };
}

function toChanges(f) {
  return {
    status: f.status,
    legacy_marking: f.legacy_marking,
    primary_methods: f.primary_methods,
    fallback_methods: f.fallback_methods,
    facial_threshold: Number(f.facial_threshold),
    pin_min_length: Number(f.pin_min_length),
    pin_max_attempts: Number(f.pin_max_attempts),
    pin_lockout_minutes: Number(f.pin_lockout_minutes),
    evidence_photo: f.evidence_photo,
    evidence_retention_days: f.evidence_retention_days === '' ? null : Number(f.evidence_retention_days),
    template_destroy_after_termination_days: Number(f.template_destroy_after_termination_days),
    marks_retention_years: Number(f.marks_retention_years),
    geo_mode: f.geo_mode,
    offline_policy: {
      allowed: f.offline_allowed,
      max_age_hours: Number(f.offline_max_age_hours),
      justification: f.offline_justification.trim() || null,
    },
  };
}

function MethodChecks({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-4">
      {METHODS.map((m) => (
        <label key={m.id} className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox" checked={value.includes(m.id)}
            onChange={(e) => onChange(e.target.checked ? [...new Set([...value, m.id])] : value.filter((x) => x !== m.id))}
          />
          {m.label}
        </label>
      ))}
    </div>
  );
}

const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    {children}
    {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
  </div>
);

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none';

export default function AttendancePolicyPage() {
  const [policy, setPolicy] = useState(null);
  const [form, setForm] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [pendingAck, setPendingAck] = useState([]);
  const [ack, setAck] = useState({});
  const [errors, setErrors] = useState([]);
  const [reason, setReason] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [cur, hist] = await Promise.all([fetch('/api/policy'), fetch('/api/policy?history=1')]);
      const data = await cur.json();
      if (cur.ok) { setPolicy(data.policy); setForm(toForm(data.policy)); setWarnings(data.warnings || []); }
      if (hist.ok) setHistory((await hist.json()).versions || []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setSaving(true); setMessage(''); setErrors([]);
    try {
      const res = await fetch('/api/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: toChanges(form), acknowledge: Object.keys(ack).filter((k) => ack[k]), reason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessage(`Política guardada (versión ${data.policy.version}).`);
        setPendingAck([]); setAck({}); setReason('');
        await load();
      } else if (data.code === 'ACK_REQUIRED') {
        setPendingAck(data.warnings || []);
        setMessage('Hay advertencias que debes confirmar para guardar.');
      } else if (data.code === 'VALIDATION_FAILED') {
        setErrors(data.errors || []);
      } else {
        setMessage(data.error || 'No se pudo guardar.');
      }
    } catch {
      setMessage('Error de conexión.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !form) {
    return <div className="flex justify-center py-20"><Loader className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-blue-600" /> Política de marcación</h1>
        <p className="text-sm text-gray-500 mt-1">
          Versión vigente: <strong>{policy.version === 0 ? 'sin configurar (flujo actual)' : policy.version}</strong>. Cada cambio crea una versión nueva y cada marcación guarda la versión con que se aceptó.
          Esto es preparación técnica; no constituye certificación.
        </p>
      </div>

      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
          {warnings.map((w) => (
            <p key={w.code} className="text-sm text-amber-900 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{w.article ? `${w.article}: ` : ''}{w.message}</p>
          ))}
        </div>
      )}

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="font-semibold text-gray-900">Métodos de identificación</h2>
        <p className="text-xs text-gray-500">El texto exige contemplar siempre al menos dos alternativas y que una no sea biométrica (Art. 7 g). Define cuál es la principal y cuál el respaldo.</p>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => set({ primary_methods: p.primary, fallback_methods: p.fallback })}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded-full hover:bg-gray-50">{p.label}</button>
          ))}
        </div>

        <Field label="Método principal"><MethodChecks value={form.primary_methods} onChange={(v) => set({ primary_methods: v })} /></Field>
        <Field label="Método de respaldo (contingencia)"><MethodChecks value={form.fallback_methods} onChange={(v) => set({ fallback_methods: v })} /></Field>

        <Field label="Estado">
          <select className={inputClass} value={form.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="ACTIVE">Activa</option>
            <option value="UNCONFIGURED">Sin configurar (no permite marcar por el flujo nuevo)</option>
          </select>
        </Field>

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-1" checked={form.legacy_marking} onChange={(e) => set({ legacy_marking: e.target.checked })} />
          <span>Mantener el flujo actual (permite marcar solo con RUT o solo con PIN). Desactívalo cuando los trabajadores estén enrolados; el servidor no lo permitirá hasta que el nuevo flujo esté habilitado.</span>
        </label>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-6 grid sm:grid-cols-2 gap-5">
        <h2 className="font-semibold text-gray-900 sm:col-span-2">PIN y verificación</h2>
        <Field label="Umbral facial (0,30 – 0,70)" hint="Distancia máxima aceptada; más bajo = más estricto."><input className={inputClass} type="number" step="0.01" min="0.3" max="0.7" value={form.facial_threshold} onChange={(e) => set({ facial_threshold: e.target.value })} /></Field>
        <Field label="Largo mínimo del PIN (4 – 8)"><input className={inputClass} type="number" min="4" max="8" value={form.pin_min_length} onChange={(e) => set({ pin_min_length: e.target.value })} /></Field>
        <Field label="Intentos antes de bloquear (3 – 10)"><input className={inputClass} type="number" min="3" max="10" value={form.pin_max_attempts} onChange={(e) => set({ pin_max_attempts: e.target.value })} /></Field>
        <Field label="Bloqueo inicial (minutos)" hint="Se duplica en cada reincidencia, con tope de 24 h."><input className={inputClass} type="number" min="1" max="1440" value={form.pin_lockout_minutes} onChange={(e) => set({ pin_lockout_minutes: e.target.value })} /></Field>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-6 grid sm:grid-cols-2 gap-5">
        <h2 className="font-semibold text-gray-900 sm:col-span-2">Evidencia, ubicación y conservación</h2>
        <Field label="Foto de evidencia" hint="Art. 56: el control debe ser proporcional. Se recomienda solo en fallo.">
          <select className={inputClass} value={form.evidence_photo} onChange={(e) => set({ evidence_photo: e.target.value })}>
            <option value="NEVER">Nunca</option>
            <option value="ON_FAILURE">Solo si falla la verificación</option>
            <option value="ALWAYS">Siempre</option>
          </select>
        </Field>
        <Field label="Retención de fotos (días)" hint="El texto no fija plazo para las fotos; 90 es un valor propio."><input className={inputClass} type="number" min="1" max="3650" value={form.evidence_retention_days} onChange={(e) => set({ evidence_retention_days: e.target.value })} /></Field>
        <Field label="Destrucción de datos personales tras el término (días)" hint="Art. 57.4: entre 90 y 120 días."><input className={inputClass} type="number" min="90" max="120" value={form.template_destroy_after_termination_days} onChange={(e) => set({ template_destroy_after_termination_days: e.target.value })} /></Field>
        <Field label="Conservación de marcaciones y posiciones (años)" hint="Art. 53 f) y 58 l): mínimo 5."><input className={inputClass} type="number" min="5" value={form.marks_retention_years} onChange={(e) => set({ marks_retention_years: e.target.value })} /></Field>
        <Field label="Geolocalización" hint="Solo evidencia: nunca bloquea una marcación (Art. 53 c).">
          <select className={inputClass} value={form.geo_mode} onChange={(e) => set({ geo_mode: e.target.value })}>
            <option value="EVIDENCE">Registrar como evidencia</option>
            <option value="OFF">Desactivada</option>
          </select>
        </Field>
      </section>

      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Marcación sin conexión</h2>
        <p className="text-xs text-gray-500">Art. 10: es una excepción para casos particulares debidamente justificados.</p>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.offline_allowed} onChange={(e) => set({ offline_allowed: e.target.checked })} /> Permitir marcar sin conexión y sincronizar después
        </label>
        {form.offline_allowed && (
          <>
            <Field label="Antigüedad máxima aceptada al sincronizar (horas)" hint="Valor propio: el texto no fija un máximo."><input className={inputClass} type="number" min="1" max="720" value={form.offline_max_age_hours} onChange={(e) => set({ offline_max_age_hours: e.target.value })} /></Field>
            <Field label="Justificación"><textarea className={inputClass} rows={2} maxLength={500} value={form.offline_justification} onChange={(e) => set({ offline_justification: e.target.value })} placeholder="Ej.: faena sin cobertura de datos móviles" /></Field>
          </>
        )}
      </section>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1" role="alert">
          {errors.map((e, i) => <p key={i} className="text-sm text-red-800">{e.article ? `${e.article}: ` : ''}{e.message}</p>)}
        </div>
      )}

      {pendingAck.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
          {pendingAck.map((w) => (
            <label key={w.code} className="flex items-start gap-2 text-sm text-amber-900">
              <input type="checkbox" className="mt-1" checked={!!ack[w.code]} onChange={(e) => setAck({ ...ack, [w.code]: e.target.checked })} />
              <span><strong>{w.article}</strong> {w.message} Confirmo que entiendo y asumo esta configuración.</span>
            </label>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <Field label="Motivo del cambio (queda registrado)"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: se enroló a todo el personal" /></Field>
        <div className="flex items-center gap-4">
          <button onClick={save} disabled={saving} className="px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Guardar como nueva versión'}
          </button>
          {message && <p className="text-sm text-gray-700">{message}</p>}
        </div>
      </div>

      {history.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3"><History className="w-4 h-4" /> Historial</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {history.map((v) => (
              <li key={v.version} className="py-2 flex flex-wrap gap-x-4">
                <strong>v{v.version}</strong>
                <span className="text-gray-600">{new Date(v.created_at).toLocaleString('es-CL')}</span>
                <span className="text-gray-600">{v.created_by || '—'}</span>
                <span className="text-gray-500">{v.change_reason || ''}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
