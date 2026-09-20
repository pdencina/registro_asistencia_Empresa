const test = require('node:test');
const assert = require('node:assert/strict');
const { haversineDistance, validateGeofence } = require('../api/lib/geofence');

test('haversineDistance: mismo punto es 0', () => {
  assert.equal(haversineDistance(-33.45, -70.66, -33.45, -70.66), 0);
});

test('haversineDistance: 1 grado de latitud ≈ 111 km', () => {
  const d = haversineDistance(0, 0, 1, 0);
  assert.ok(Math.abs(d - 111195) < 200, `distancia ${d}`);
});

test('validateGeofence: sin coordenadas y no obligatoria es válida', () => {
  const r = validateGeofence({ latitude: null, longitude: null, device: { lat: 1, lng: 1 } });
  assert.equal(r.valid, true);
  assert.equal(r.distance, null);
});

test('validateGeofence: sin coordenadas y obligatoria es inválida', () => {
  const r = validateGeofence({ latitude: null, longitude: null, device: { lat: 1, lng: 1 }, geolocationRequired: true });
  assert.equal(r.valid, false);
});
