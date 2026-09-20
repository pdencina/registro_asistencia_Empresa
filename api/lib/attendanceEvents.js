/**
 * Utilidades compartidas por los endpoints de marcación.
 * Centralizan reglas que estaban duplicadas (y con errores) en register.js y pin-checkin.js.
 */

const DEFAULT_OFFLINE_MAX_AGE_HOURS = 168; // 7 días; configurable con OFFLINE_MAX_AGE_HOURS
const FUTURE_SKEW_MS = 5 * 60 * 1000;      // tolerancia de reloj del dispositivo

/**
 * Determina el instante del evento y la hora en que el servidor lo recibió.
 *
 *  - Marcación en línea: el instante es la hora del SERVIDOR (el cliente no puede fijarla).
 *  - Sincronización offline (_offline_sync / _offline_timestamp): se acepta la hora del dispositivo
 *    solo si es válida, no es futura y no supera la antigüedad máxima. En ese caso se deja constancia
 *    (is_offline_sync + client_timestamp) y server_received_at conserva la hora real de recepción.
 *
 * @returns {{ok: true, timestamp, serverReceivedAt, clientTimestamp, isOfflineSync} | {ok: false, status, code, error}}
 */
function resolveEventTime(body = {}, { now = new Date(), maxAgeHours } = {}) {
  const serverReceivedAt = now.toISOString();
  const raw = body._offline_timestamp;
  const claimsOffline = body._offline_sync === true || raw != null;

  if (!claimsOffline) {
    return { ok: true, timestamp: serverReceivedAt, serverReceivedAt, clientTimestamp: null, isOfflineSync: false };
  }

  const clientDate = new Date(raw);
  if (raw == null || Number.isNaN(clientDate.getTime())) {
    return { ok: false, status: 400, code: 'OFFLINE_TIMESTAMP_INVALID', error: 'Fecha de marcación offline inválida' };
  }

  if (clientDate.getTime() > now.getTime() + FUTURE_SKEW_MS) {
    return { ok: false, status: 422, code: 'OFFLINE_TIMESTAMP_FUTURE', error: 'La fecha de la marcación no puede ser futura' };
  }

  const limitHours = maxAgeHours ?? (Number(process.env.OFFLINE_MAX_AGE_HOURS) || DEFAULT_OFFLINE_MAX_AGE_HOURS);
  if (now.getTime() - clientDate.getTime() > limitHours * 3600 * 1000) {
    return {
      ok: false, status: 422, code: 'OFFLINE_TOO_OLD',
      error: `La marcación offline supera la antigüedad máxima permitida (${limitHours} h). Requiere revisión administrativa.`,
    };
  }

  return {
    ok: true,
    timestamp: clientDate.toISOString(),
    serverReceivedAt,
    clientTimestamp: clientDate.toISOString(),
    isOfflineSync: true,
  };
}

/**
 * Lee y valida coordenadas del cuerpo de la request (o del formato legado "GPS: lat, lng" en notes).
 * Acepta 0 como valor válido (el código anterior lo descartaba) y rechaza NaN o valores fuera de rango.
 */
function parseCoordinates(body = {}) {
  let lat = body.latitude;
  let lng = body.longitude;

  if ((lat == null || lat === '') && typeof body.notes === 'string') {
    const m = body.notes.match(/GPS:\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
    if (m) { lat = m[1]; lng = m[2]; }
  }

  if (lat == null || lat === '' || lng == null || lng === '') {
    return { latitude: null, longitude: null, accuracy: null };
  }

  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { latitude: null, longitude: null, accuracy: null };
  }

  const acc = body.accuracy != null ? Number(body.accuracy) : null;
  return { latitude, longitude, accuracy: Number.isFinite(acc) && acc >= 0 ? acc : null };
}

/** Canal de marcación a partir del campo `source` que envía el cliente. */
function normalizeChannel(source) {
  if (source === 'totem') return 'TOTEM';
  if (source === 'movil') return 'MOBILE';
  return 'UNSPECIFIED';
}

/** Identificador de dispositivo declarado por el cliente (aún no autenticado; ver plan, etapa 8). */
function sanitizeDeviceId(value) {
  if (typeof value !== 'string') return null;
  return /^[\w.:-]{1,100}$/.test(value) ? value : null;
}

module.exports = { resolveEventTime, parseCoordinates, normalizeChannel, sanitizeDeviceId, DEFAULT_OFFLINE_MAX_AGE_HOURS };
