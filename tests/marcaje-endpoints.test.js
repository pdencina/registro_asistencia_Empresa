// Endpoints de marcación (pin-checkin) de punta a punta sobre PostgreSQL real (PGlite) con la migración v2.
process.env.TIMESTAMP_SECRET = 'test-timestamp-secret';
process.env.SESSION_SECRET = 'test-secret';
delete process.env.RESEND_API_KEY;
delete process.env.FORCE_LEGACY_INTEGRITY;

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestDb, useDb, MIGRATIONS_DIR } = require('./pgHelper');
const { mockRes, mockReq } = require('./helpers');
const { applyMigrations } = require('../api/lib/migrations');

let ctx;
let pinCheckin;
let integrity;

const TENANT = randomUUID();
const EMP = { ana: randomUUID(), beto: randomUUID(), caro: randomUUID(), dani: randomUUID() };
// Referencia de ubicación: Plaza de Armas de Santiago
const REF = { lat: -33.4372, lng: -70.6506 };

async function call(body, ip) {
  const res = mockRes();
  await pinCheckin(mockReq({
    method: 'POST',
    headers: { 'x-tenant-slug': 'acme', 'x-forwarded-for': ip || '10.1.1.1' },
    body,
  }), res);
  return res;
}

const lastRecord = async (employeeId) =>
  (await ctx.sql('SELECT * FROM attendance_records WHERE employee_id = $1 ORDER BY seq DESC NULLS LAST LIMIT 1', [employeeId]))[0];

test('preparación: base con migración aplicada', async () => {
  ctx = await createTestDb();
  useDb(ctx.sql);
  await ctx.sql("INSERT INTO tenants (id, name, slug, admin_email) VALUES ($1, 'Acme', 'acme', 'a@acme.cl')", [TENANT]);
  const emps = [['ana', '11.111.111-1', '1234'], ['beto', '22.222.222-2', '5678'], ['caro', '33.333.333-3', '4321'], ['dani', '44.444.444-4', '8765']];
  for (const [k, rut, pin] of emps) {
    await ctx.sql(
      'INSERT INTO employees (id, tenant_id, rut, first_name, last_name, personal_pin) VALUES ($1, $2, $3, $4, $5, $6)',
      [EMP[k], TENANT, rut, k, 'Test', pin]);
  }
  await ctx.sql('INSERT INTO tenant_settings (tenant_id, geolocation_enabled, geolocation_radius_meters) VALUES ($1, true, 100)', [TENANT]);
  await ctx.sql("INSERT INTO authorized_devices (tenant_id, device_id, name, lat, lng) VALUES ($1, 'totem-principal', 'Tótem', $2, $3)", [TENANT, REF.lat, REF.lng]);
  await applyMigrations(ctx.db, MIGRATIONS_DIR);

  integrity = require('../api/lib/integrity');
  integrity._resetV2Cache();
  pinCheckin = require('../api/attendance/pin-checkin');
});

test('marca por PIN dentro del perímetro: evidencia estructurada completa', async () => {
  const res = await call({ pin: '1234', action: 'entry', source: 'totem', device_id: 'totem-principal', latitude: REF.lat + 0.0002, longitude: REF.lng, accuracy: 9 });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));

  const r = await lastRecord(EMP.ana);
  assert.equal(Number(r.hash_version), 2);
  assert.equal(Number(r.seq), 1);
  assert.equal(r.auth_method, 'PIN');
  assert.equal(r.auth_result, 'SUCCESS');
  assert.equal(r.channel, 'TOTEM');
  assert.equal(r.device_id, 'totem-principal');
  assert.equal(r.geo_status, 'INSIDE');
  assert.ok(r.geo_distance_m > 0 && r.geo_distance_m < 100);
  assert.equal(r.geo_accuracy_m, 9);
  assert.equal(r.is_offline_sync, false);
  assert.ok(r.server_received_at);
  assert.equal(r.method, 'pin');
});

test('fuera del perímetro: NO bloquea, guarda coordenadas y deja la marca como fuera de ubicación', async () => {
  const res = await call({ pin: '1234', action: 'exit', source: 'movil', latitude: -33.5, longitude: -70.7 }, '10.1.1.2');
  assert.equal(res.statusCode, 201, 'la marca debe registrarse igual');

  const r = await lastRecord(EMP.ana);
  assert.equal(r.type, 'exit');
  assert.equal(r.geo_status, 'OUTSIDE');
  assert.ok(r.geo_distance_m > 100);
  assert.equal(r.latitude, -33.5);
  assert.equal(r.channel, 'MOBILE');
  assert.match(r.notes, /FUERA DE PERÍMETRO/);
});

test('sin coordenadas: la marca se registra y queda NOT_PROVIDED', async () => {
  const res = await call({ pin: '5678', action: 'entry', source: 'totem' }, '10.1.1.3');
  assert.equal(res.statusCode, 201);
  assert.equal((await lastRecord(EMP.beto)).geo_status, 'NOT_PROVIDED');
});

test('coordenadas (0,0) son validas y no se descartan como "vacias"', async () => {
  const res = await call({ pin: '4321', action: 'entry', latitude: 0, longitude: 0 }, '10.1.1.4');
  assert.equal(res.statusCode, 201);
  const r = await lastRecord(EMP.caro);
  assert.equal(r.latitude, 0);
  assert.equal(r.longitude, 0);
  assert.equal(r.geo_status, 'OUTSIDE');
});

test('marca solo con RUT (flujo legado): queda etiquetada RUT_ONLY / IDENTIFIED_ONLY para poder detectarla', async () => {
  const res = await call({ rut: '444444444', action: 'entry', source: 'totem' }, '10.1.1.5');
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const r = await lastRecord(EMP.dani);
  assert.equal(r.auth_method, 'RUT_ONLY');
  assert.equal(r.auth_result, 'IDENTIFIED_ONLY');
  assert.equal(r.method, 'rut');
});

test('offline valido: la hora del dispositivo se conserva y se distingue de la hora de recepción', async () => {
  const clientTime = new Date(Date.now() - 3 * 3600e3).toISOString();
  const res = await call({ pin: '8765', action: 'exit', _offline_sync: true, _offline_timestamp: clientTime }, '10.1.1.6');
  // dani ya tiene entrada hoy (marca por RUT) => la salida es válida
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const r = await lastRecord(EMP.dani);
  assert.equal(r.is_offline_sync, true);
  assert.equal(new Date(r.timestamp).toISOString(), clientTime);
  assert.equal(new Date(r.client_timestamp).toISOString(), clientTime);
  assert.ok(new Date(r.server_received_at) > new Date(clientTime));
});

test('offline con fecha futura o demasiado antigua: rechazado y no se escribe nada', async () => {
  const before = (await ctx.sql('SELECT COUNT(*)::int AS n FROM attendance_records'))[0].n;

  const future = await call({ pin: '5678', action: 'exit', _offline_sync: true, _offline_timestamp: new Date(Date.now() + 86400e3).toISOString() }, '10.1.1.7');
  assert.equal(future.statusCode, 422);
  assert.equal(future.body.code, 'OFFLINE_TIMESTAMP_FUTURE');

  const old = await call({ pin: '5678', action: 'exit', _offline_sync: true, _offline_timestamp: '2020-01-01T00:00:00Z' }, '10.1.1.8');
  assert.equal(old.statusCode, 422);
  assert.equal(old.body.code, 'OFFLINE_TOO_OLD');

  const garbage = await call({ pin: '5678', action: 'exit', _offline_sync: true, _offline_timestamp: 'ayer' }, '10.1.1.9');
  assert.equal(garbage.statusCode, 400);

  assert.equal((await ctx.sql('SELECT COUNT(*)::int AS n FROM attendance_records'))[0].n, before);
});

test('un cliente no puede fijar la hora de una marca en línea', async () => {
  const res = await call({ pin: '5678', action: 'exit', timestamp: '2020-01-01T00:00:00Z', server_received_at: '2020-01-01T00:00:00Z' }, '10.1.1.10');
  assert.equal(res.statusCode, 201);
  const r = await lastRecord(EMP.beto);
  assert.ok(Math.abs(new Date(r.timestamp) - Date.now()) < 60e3);
  assert.equal(r.is_offline_sync, false);
});

test('PIN incorrecto: 401 y no se registra nada', async () => {
  const before = (await ctx.sql('SELECT COUNT(*)::int AS n FROM attendance_records'))[0].n;
  const res = await call({ pin: '0000', action: 'entry' }, '10.1.1.11');
  assert.equal(res.statusCode, 401);
  assert.equal((await ctx.sql('SELECT COUNT(*)::int AS n FROM attendance_records'))[0].n, before);
});

test('tras todas las marcaciones la cadena de la empresa verifica sin errores', async () => {
  const res = await integrity.verifyChainIntegrity(TENANT);
  assert.equal(res.integrity_ok, true, JSON.stringify(res.corrupted_records));
  assert.equal(res.v2_records, 7);
  const seqs = (await ctx.sql('SELECT seq FROM attendance_records WHERE tenant_id = $1 ORDER BY seq', [TENANT])).map((r) => Number(r.seq));
  assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6, 7]);
});
