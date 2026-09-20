const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveEventTime, parseCoordinates, normalizeChannel, sanitizeDeviceId } = require('../api/lib/attendanceEvents');

const NOW = new Date('2026-09-19T15:00:00.000Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600e3).toISOString();

test('marcacion en linea: la hora es la del servidor, el cliente no la puede fijar', () => {
  const r = resolveEventTime({ timestamp: '2020-01-01T00:00:00Z' }, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.timestamp, NOW.toISOString());
  assert.equal(r.serverReceivedAt, NOW.toISOString());
  assert.equal(r.isOfflineSync, false);
  assert.equal(r.clientTimestamp, null);
});

test('sincronizacion offline valida: usa la hora del dispositivo y deja constancia', () => {
  const r = resolveEventTime({ _offline_sync: true, _offline_timestamp: hoursAgo(5) }, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.timestamp, hoursAgo(5));
  assert.equal(r.clientTimestamp, hoursAgo(5));
  assert.equal(r.serverReceivedAt, NOW.toISOString());
  assert.equal(r.isOfflineSync, true);
});

test('offline: _offline_timestamp sin bandera tambien se trata como offline (no se ignora)', () => {
  const r = resolveEventTime({ _offline_timestamp: hoursAgo(1) }, { now: NOW });
  assert.equal(r.isOfflineSync, true);
});

test('offline: rechaza fechas invalidas, futuras y demasiado antiguas', () => {
  assert.equal(resolveEventTime({ _offline_sync: true }, { now: NOW }).code, 'OFFLINE_TIMESTAMP_INVALID');
  assert.equal(resolveEventTime({ _offline_sync: true, _offline_timestamp: 'no-es-fecha' }, { now: NOW }).code, 'OFFLINE_TIMESTAMP_INVALID');

  const future = resolveEventTime({ _offline_sync: true, _offline_timestamp: new Date(NOW.getTime() + 3600e3).toISOString() }, { now: NOW });
  assert.equal(future.ok, false);
  assert.equal(future.code, 'OFFLINE_TIMESTAMP_FUTURE');

  const old = resolveEventTime({ _offline_sync: true, _offline_timestamp: hoursAgo(24 * 8) }, { now: NOW });
  assert.equal(old.ok, false);
  assert.equal(old.code, 'OFFLINE_TOO_OLD');
  assert.equal(old.status, 422);
});

test('offline: tolera pequeno desfase de reloj hacia el futuro y respeta el limite configurable', () => {
  const skew = resolveEventTime({ _offline_sync: true, _offline_timestamp: new Date(NOW.getTime() + 60e3).toISOString() }, { now: NOW });
  assert.equal(skew.ok, true);

  assert.equal(resolveEventTime({ _offline_sync: true, _offline_timestamp: hoursAgo(30) }, { now: NOW, maxAgeHours: 24 }).ok, false);
  assert.equal(resolveEventTime({ _offline_sync: true, _offline_timestamp: hoursAgo(30) }, { now: NOW, maxAgeHours: 48 }).ok, true);
});

test('coordenadas: acepta 0, numeros como texto y el formato legado de notes', () => {
  assert.deepEqual(parseCoordinates({ latitude: 0, longitude: 0 }), { latitude: 0, longitude: 0, accuracy: null });
  assert.deepEqual(parseCoordinates({ latitude: '-33.45', longitude: '-70.66', accuracy: '12.5' }), { latitude: -33.45, longitude: -70.66, accuracy: 12.5 });
  const legacy = parseCoordinates({ notes: 'Marca | GPS: -33.4489, -70.6693' });
  assert.equal(legacy.latitude, -33.4489);
  assert.equal(legacy.longitude, -70.6693);
});

test('coordenadas: descarta valores invalidos o fuera de rango', () => {
  for (const body of [{}, { latitude: 'x', longitude: 'y' }, { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 }, { latitude: NaN, longitude: 1 }, { latitude: 1 }]) {
    assert.deepEqual(parseCoordinates(body), { latitude: null, longitude: null, accuracy: null }, JSON.stringify(body));
  }
});

test('canal y dispositivo declarados', () => {
  assert.equal(normalizeChannel('totem'), 'TOTEM');
  assert.equal(normalizeChannel('movil'), 'MOBILE');
  assert.equal(normalizeChannel(undefined), 'UNSPECIFIED');
  assert.equal(sanitizeDeviceId('totem-principal'), 'totem-principal');
  assert.equal(sanitizeDeviceId("x'; DROP TABLE"), null);
  assert.equal(sanitizeDeviceId('a'.repeat(101)), null);
  assert.equal(sanitizeDeviceId(42), null);
});
