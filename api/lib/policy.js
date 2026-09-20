/**
 * Política de marcación por empresa (versionada, inmutable).
 *
 * Nada de esto se hardcodea en los endpoints: métodos aceptados, umbrales, retención, geolocalización y
 * modo offline salen de la política vigente de la empresa. Cada cambio inserta una versión nueva; la vigente
 * es la de mayor versión, y cada marcación guarda la versión con que se aceptó (policy_version).
 *
 * Las reglas de validación citan el artículo de la Res. Ex. N.º 38 (ver docs/marcaje-res38/decisiones-segun-el-texto.md).
 * Lo que el texto no define queda marcado como "parámetro propio" y es configurable.
 */

const METHODS = ['FACIAL', 'PIN'];
const NON_BIOMETRIC = ['PIN'];
const CHANNELS = ['TOTEM', 'MOBILE'];
const EVIDENCE_PHOTO = ['NEVER', 'ON_FAILURE', 'ALWAYS'];
const GEO_MODES = ['OFF', 'EVIDENCE'];

/** Política aplicada a empresas que aún no tienen ninguna: reproduce el comportamiento actual (flujo legado). */
function defaultPolicy() {
  return {
    version: 0,
    source: 'DEFAULT',
    status: 'ACTIVE',
    legacy_marking: true,
    primary_methods: ['FACIAL'],
    fallback_methods: ['PIN'],
    channel_overrides: {},
    event_selection: 'WORKER_CHOICE',
    facial_threshold: 0.5,
    pin_min_length: 4,
    pin_max_attempts: 5,
    pin_lockout_minutes: 15,
    evidence_photo: 'ON_FAILURE',
    evidence_retention_days: 90, // parámetro propio: el texto no fija plazo para fotos
    template_destroy_after_termination_days: 90,
    marks_retention_years: 5,
    geo_mode: 'EVIDENCE',
    offline_policy: { allowed: true, max_age_hours: 168, justification: null },
    regulatory_profile: {},
    acknowledged_warnings: [],
  };
}

const PRESETS = {
  // Empresa B: facial con PIN como contingencia (conforme al Art. 7 g)
  FACIAL_PIN: { primary_methods: ['FACIAL'], fallback_methods: ['PIN'] },
  // Empresa A: facial obligatorio. Contradice el Art. 7 g); exige confirmación explícita
  FACIAL_ONLY: { primary_methods: ['FACIAL'], fallback_methods: [] },
  // PIN como método principal y facial de respaldo
  PIN_FACIAL: { primary_methods: ['PIN'], fallback_methods: ['FACIAL'] },
  // Empresa C: método por definir. No permite marcar por el flujo nuevo hasta configurarla
  UNCONFIGURED: { status: 'UNCONFIGURED', primary_methods: [], fallback_methods: [] },
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);

function normalizeMethods(list) {
  return Array.isArray(list) ? [...new Set(list.map((m) => String(m).toUpperCase()))] : null;
}

/** Métodos efectivos para un canal (los overrides sustituyen a la base, campo por campo). */
function effectiveMethods(policy, channel) {
  const override = channel && policy.channel_overrides ? policy.channel_overrides[channel] : null;
  return {
    primary: (override && override.primary_methods) || policy.primary_methods,
    fallback: (override && override.fallback_methods) || policy.fallback_methods,
  };
}

function allowsMethod(policy, method, channel) {
  const { primary, fallback } = effectiveMethods(policy, channel);
  return primary.includes(method) || fallback.includes(method);
}

/**
 * Art. 7 g): "a lo menos, dos alternativas diferentes de reconocimiento", y "a lo menos una … no deberá utilizar
 * parámetros biométricos ni datos personales" (claves, tarjetas…). Devuelve los canales que no lo cumplen.
 */
function art7gViolations(policy) {
  const bad = [];
  for (const scope of [null, ...CHANNELS]) {
    if (scope && !(policy.channel_overrides && policy.channel_overrides[scope])) continue;
    const { primary, fallback } = effectiveMethods(policy, scope);
    const union = [...new Set([...primary, ...fallback])];
    const ok = union.length >= 2 && union.some((m) => NON_BIOMETRIC.includes(m));
    if (!ok) bad.push(scope || 'TODOS');
  }
  return bad;
}

/**
 * Valida una política completa (ya fusionada con la vigente).
 * @returns {{ errors: {field, message, article?}[], warnings: {code, message, article?, requires_ack: boolean}[] }}
 */
function validatePolicy(p) {
  const errors = [];
  const warnings = [];
  const err = (field, message, article) => errors.push({ field, message, ...(article ? { article } : {}) });

  if (!['ACTIVE', 'UNCONFIGURED'].includes(p.status)) err('status', 'status debe ser ACTIVE o UNCONFIGURED');

  for (const field of ['primary_methods', 'fallback_methods']) {
    if (!Array.isArray(p[field])) { err(field, `${field} debe ser una lista`); continue; }
    const unknown = p[field].filter((m) => !METHODS.includes(m));
    if (unknown.length) err(field, `Método no soportado: ${unknown.join(', ')}. Soportados: ${METHODS.join(', ')}`);
  }

  if (p.status === 'ACTIVE' && !p.legacy_marking && Array.isArray(p.primary_methods) && p.primary_methods.length === 0) {
    err('primary_methods', 'Una política ACTIVE necesita al menos un método principal (use UNCONFIGURED si aún no está definido)');
  }

  if (p.channel_overrides !== undefined) {
    if (!isPlainObject(p.channel_overrides)) err('channel_overrides', 'channel_overrides debe ser un objeto');
    else {
      for (const [ch, ov] of Object.entries(p.channel_overrides)) {
        if (!CHANNELS.includes(ch)) { err('channel_overrides', `Canal desconocido: ${ch}`); continue; }
        if (!isPlainObject(ov)) { err('channel_overrides', `El override de ${ch} debe ser un objeto`); continue; }
        for (const f of ['primary_methods', 'fallback_methods']) {
          if (ov[f] === undefined) continue;
          if (!Array.isArray(ov[f]) || ov[f].some((m) => !METHODS.includes(m))) err('channel_overrides', `${ch}.${f} inválido`);
        }
      }
    }
  }

  if (p.event_selection !== 'WORKER_CHOICE') {
    err('event_selection', 'La entrada/salida la elige el trabajador; no se puede automatizar el inicio y fin de jornada', 'Art. 35-36 y 41 d)');
  }

  const num = (field, v, min, max, article) => {
    if (typeof v !== 'number' || Number.isNaN(v) || v < min || v > max) err(field, `${field} debe estar entre ${min} y ${max}`, article);
  };
  num('facial_threshold', p.facial_threshold, 0.3, 0.7);
  for (const [field, min, max] of [['pin_min_length', 4, 8], ['pin_max_attempts', 3, 10], ['pin_lockout_minutes', 1, 1440]]) {
    if (!isInt(p[field]) || p[field] < min || p[field] > max) err(field, `${field} debe ser un entero entre ${min} y ${max}`);
  }

  if (!EVIDENCE_PHOTO.includes(p.evidence_photo)) err('evidence_photo', `evidence_photo debe ser ${EVIDENCE_PHOTO.join(' | ')}`);
  if (p.evidence_retention_days !== null && (!isInt(p.evidence_retention_days) || p.evidence_retention_days < 1 || p.evidence_retention_days > 3650)) {
    err('evidence_retention_days', 'evidence_retention_days debe ser null o un entero entre 1 y 3650');
  }

  if (!isInt(p.template_destroy_after_termination_days) || p.template_destroy_after_termination_days < 90 || p.template_destroy_after_termination_days > 120) {
    err('template_destroy_after_termination_days', 'La destrucción de datos personales debe ocurrir entre 90 y 120 días después del término de la relación laboral', 'Art. 57.4 a)');
  }
  if (!isInt(p.marks_retention_years) || p.marks_retention_years < 5) {
    err('marks_retention_years', 'Las marcaciones y registros de posicionamiento deben conservarse al menos 5 años', 'Art. 53 f) y 58 l)');
  }

  if (p.geo_mode === 'BLOCK') {
    err('geo_mode', 'La geolocalización no puede bloquear una marcación', 'Art. 53 c)');
  } else if (!GEO_MODES.includes(p.geo_mode)) {
    err('geo_mode', `geo_mode debe ser ${GEO_MODES.join(' | ')}`);
  }

  const off = p.offline_policy;
  if (!isPlainObject(off) || typeof off.allowed !== 'boolean') err('offline_policy', 'offline_policy.allowed debe ser booleano');
  else {
    if (!isInt(off.max_age_hours) || off.max_age_hours < 1 || off.max_age_hours > 720) err('offline_policy', 'offline_policy.max_age_hours debe ser un entero entre 1 y 720');
    if (off.justification != null && (typeof off.justification !== 'string' || off.justification.length > 500)) err('offline_policy', 'offline_policy.justification debe ser texto de hasta 500 caracteres');
  }
  if (!isPlainObject(p.regulatory_profile)) err('regulatory_profile', 'regulatory_profile debe ser un objeto');

  // ---- advertencias ----
  if (errors.length === 0) {
    const violations = p.status === 'ACTIVE' ? art7gViolations(p) : [];
    if (violations.length) {
      warnings.push({
        code: 'ART_7G_TWO_ALTERNATIVES',
        article: 'Art. 7 g)',
        requires_ack: true,
        message: `El texto exige contemplar siempre al menos dos alternativas de reconocimiento y que una sea no biométrica (p. ej. clave). No se cumple en: ${violations.join(', ')}.`,
      });
    }
    if (p.legacy_marking) {
      warnings.push({
        code: 'LEGACY_MARKING_ACTIVE',
        requires_ack: false,
        message: 'El flujo legado sigue activo: permite marcar solo con RUT o solo con PIN. Se retira cuando la empresa esté enrolada.',
      });
    }
    if (off.allowed && !(off.justification && off.justification.trim())) {
      warnings.push({
        code: 'OFFLINE_WITHOUT_JUSTIFICATION',
        article: 'Art. 10',
        requires_ack: false,
        message: 'El modo sin conexión es una excepción que debe estar debidamente justificada; registre la justificación.',
      });
    }
    if (p.evidence_photo === 'ALWAYS') {
      warnings.push({
        code: 'EVIDENCE_PHOTO_ALWAYS',
        article: 'Art. 56',
        requires_ack: false,
        message: 'Guardar foto en todas las marcaciones puede exceder la proporcionalidad del control; el valor recomendado es ON_FAILURE.',
      });
    }
  }

  return { errors, warnings };
}

function toDbShape(row) {
  return {
    ...row,
    source: 'DB',
    facial_threshold: Number(row.facial_threshold),
    version: Number(row.version),
  };
}

// ----- acceso a datos -----

const cache = new Map(); // tenantId -> { at, policy }
const CACHE_MS = 30 * 1000;

function invalidatePolicyCache(tenantId) {
  if (tenantId) cache.delete(tenantId); else cache.clear();
}

/** Política vigente (mayor versión) o la política por defecto si la empresa no tiene ninguna / no existe la tabla. */
async function getActivePolicy(sql, tenantId, { useCache = true } = {}) {
  const hit = cache.get(tenantId);
  if (useCache && hit && Date.now() - hit.at < CACHE_MS) return hit.policy;

  let policy;
  try {
    const [row] = await sql('SELECT * FROM tenant_attendance_policy WHERE tenant_id = $1 ORDER BY version DESC LIMIT 1', [tenantId]);
    policy = row ? toDbShape(row) : defaultPolicy();
  } catch (e) {
    if (e && (e.code === '42P01' || e.code === '42703')) policy = defaultPolicy(); // migración 002 sin aplicar
    else throw e;
  }
  cache.set(tenantId, { at: Date.now(), policy });
  return policy;
}

class PolicyError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const EDITABLE = [
  'status', 'legacy_marking', 'primary_methods', 'fallback_methods', 'channel_overrides', 'event_selection',
  'facial_threshold', 'pin_min_length', 'pin_max_attempts', 'pin_lockout_minutes', 'evidence_photo',
  'evidence_retention_days', 'template_destroy_after_termination_days', 'marks_retention_years', 'geo_mode',
  'offline_policy', 'regulatory_profile',
];

/** Fusiona los cambios pedidos (o un preset) sobre la política vigente. */
function mergePolicy(current, changes = {}, preset) {
  const merged = { ...current };
  const source = { ...(preset ? PRESETS[preset] : {}), ...changes };
  for (const key of EDITABLE) {
    if (source[key] === undefined) continue;
    // offline_policy se fusiona campo a campo para poder cambiar solo, p. ej., la justificación
    merged[key] = key === 'offline_policy' && isPlainObject(source[key]) ? { ...current.offline_policy, ...source[key] } : source[key];
  }
  merged.primary_methods = normalizeMethods(merged.primary_methods) ?? merged.primary_methods;
  merged.fallback_methods = normalizeMethods(merged.fallback_methods) ?? merged.fallback_methods;
  if (merged.evidence_retention_days === undefined) merged.evidence_retention_days = null;
  return merged;
}

/**
 * Crea una versión nueva de la política.
 * @param {object} opts { changes, preset, acknowledge: string[], reason, actor }
 * @throws {PolicyError} 422 VALIDATION_FAILED | 409 ACK_REQUIRED | 409 ENFORCEMENT_NOT_AVAILABLE
 */
async function savePolicy(sql, tenantId, { changes = {}, preset, acknowledge = [], reason, actor } = {}) {
  if (preset && !PRESETS[preset]) throw new PolicyError(422, 'UNKNOWN_PRESET', `Preset desconocido: ${preset}`);

  const current = await getActivePolicy(sql, tenantId, { useCache: false });
  const merged = mergePolicy(current, changes, preset);
  const { errors, warnings } = validatePolicy(merged);
  if (errors.length) throw new PolicyError(422, 'VALIDATION_FAILED', 'La política no es válida', { errors });

  // El flujo nuevo del tótem/móvil (identificar → autenticar) se habilita cuando esté completo (etapa 6).
  if (merged.legacy_marking === false && process.env.ENABLE_ENFORCED_MARKING !== 'true') {
    throw new PolicyError(409, 'ENFORCEMENT_NOT_AVAILABLE',
      'Aún no se puede desactivar el flujo legado: el nuevo flujo de marcación del tótem está en desarrollo (etapa 6 del plan).');
  }

  const pending = warnings.filter((w) => w.requires_ack && !acknowledge.includes(w.code));
  if (pending.length) {
    throw new PolicyError(409, 'ACK_REQUIRED', 'Hay advertencias regulatorias que requieren confirmación explícita', { warnings: pending });
  }

  const ackedCodes = warnings.filter((w) => w.requires_ack).map((w) => w.code);
  const params = [
    tenantId, merged.status, merged.legacy_marking, JSON.stringify(merged.primary_methods), JSON.stringify(merged.fallback_methods),
    JSON.stringify(merged.channel_overrides || {}), merged.event_selection, merged.facial_threshold, merged.pin_min_length,
    merged.pin_max_attempts, merged.pin_lockout_minutes, merged.evidence_photo, merged.evidence_retention_days,
    merged.template_destroy_after_termination_days, merged.marks_retention_years, merged.geo_mode,
    JSON.stringify(merged.offline_policy), JSON.stringify(merged.regulatory_profile || {}), JSON.stringify(ackedCodes),
    reason || null, actor || null,
  ];

  for (let attempt = 1; ; attempt++) {
    try {
      const [saved] = await sql(`
        INSERT INTO tenant_attendance_policy
          (tenant_id, version, status, legacy_marking, primary_methods, fallback_methods, channel_overrides, event_selection,
           facial_threshold, pin_min_length, pin_max_attempts, pin_lockout_minutes, evidence_photo, evidence_retention_days,
           template_destroy_after_termination_days, marks_retention_years, geo_mode, offline_policy, regulatory_profile,
           acknowledged_warnings, change_reason, created_by)
        SELECT $1::uuid, COALESCE(MAX(version), 0) + 1, $2::text, $3::boolean, $4::jsonb, $5::jsonb, $6::jsonb, $7::text,
               $8::numeric, $9::smallint, $10::smallint, $11::smallint, $12::text, $13::int,
               $14::smallint, $15::smallint, $16::text, $17::jsonb, $18::jsonb, $19::jsonb, $20::text, $21::text
          FROM tenant_attendance_policy WHERE tenant_id = $1::uuid
        RETURNING *`, params);
      invalidatePolicyCache(tenantId);
      return { policy: toDbShape(saved), warnings, previous: current };
    } catch (e) {
      if (e && e.code === '23505' && attempt < 3) continue; // otra versión se insertó en paralelo
      throw e;
    }
  }
}

/** Versión de política a registrar en una marcación (0 = sin política configurada). */
async function policyVersionFor(sql, tenantId) {
  try {
    return (await getActivePolicy(sql, tenantId)).version;
  } catch {
    return 0;
  }
}

module.exports = {
  METHODS, CHANNELS, PRESETS,
  defaultPolicy, validatePolicy, mergePolicy, effectiveMethods, allowsMethod, art7gViolations,
  getActivePolicy, savePolicy, invalidatePolicyCache, policyVersionFor, PolicyError,
};
