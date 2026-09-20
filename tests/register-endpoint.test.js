// attendance/register (verificación facial hecha en el navegador) sobre PostgreSQL real, con Vercel Blob simulado.
process.env.TIMESTAMP_SECRET = 'test-timestamp-secret';
delete process.env.RESEND_API_KEY;

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { createTestDb, useDb, MIGRATIONS_DIR } = require('./pgHelper');
const { mockRes, mockReq } = require('./helpers');
const { applyMigrations } = require('../api/lib/migrations');

// Simula @vercel/blob: guarda lo subido para poder comparar su huella
const uploads = [];
const blobPath = require.resolve('@vercel/blob');
require.cache[blobPath] = {
  id: blobPath, filename: blobPath, loaded: true,
  exports: { put: async (name, buffer) => { uploads.push({ name, buffer }); return { url: `https://blob.test/${name}` }; } },
};

let ctx;
let register;
let integrity;
const TENANT = randomUUID();
const EMP = randomUUID();

const call = async (body) => {
  const res = mockRes();
  await register(mockReq({ method: 'POST', headers: { 'x-tenant-slug': 'acme' }, body }), res);
  return res;
};

test('preparación', async () => {
  ctx = await createTestDb();
  useDb(ctx.sql);
  await ctx.sql("INSERT INTO tenants (id, name, slug) VALUES ($1, 'Acme', 'acme')", [TENANT]);
  await ctx.sql("INSERT INTO employees (id, tenant_id, rut, first_name, last_name) VALUES ($1, $2, '1-9', 'Ana', 'Perez')", [EMP, TENANT]);
  await applyMigrations(ctx.db, MIGRATIONS_DIR);
  integrity = require('../api/lib/integrity');
  integrity._resetV2Cache();
  register = require('../api/attendance/register');
});

test('marca con foto: la huella de la imagen queda dentro del registro sellado', async () => {
  const jpeg = Buffer.from('imagen-de-prueba-jpeg');
  const res = await call({
    employee_id: EMP, type: 'entry', source: 'movil', latitude: -33.45, longitude: -70.66,
    photo_snapshot: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
  });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));

  const [r] = await ctx.sql('SELECT * FROM attendance_records WHERE employee_id = $1', [EMP]);
  assert.equal(r.auth_method, 'FACIAL');
  assert.equal(r.auth_result, 'CLIENT_REPORTED'); // el servidor no pudo comprobar el rostro
  assert.equal(r.channel, 'MOBILE');
  assert.equal(r.evidence_sha256, createHash('sha256').update(jpeg).digest('hex'));
  assert.equal(uploads.length, 1);
  assert.equal(r.photo_snapshot_url, `https://blob.test/${uploads[0].name}`);
  assert.equal(Number(r.hash_version), 2);
  assert.equal(r.geo_status, 'NO_REFERENCE'); // hay coordenadas pero la empresa aún no tiene ubicación de referencia

  assert.equal((await integrity.verifyChainIntegrity(TENANT)).integrity_ok, true);
});

test('si la foto se altera después, la verificación lo detecta', async () => {
  const [r] = await ctx.sql('SELECT id FROM attendance_records WHERE employee_id = $1', [EMP]);
  await ctx.sql("UPDATE attendance_records SET evidence_sha256 = $2 WHERE id = $1", [r.id, createHash('sha256').update('otra-imagen').digest('hex')]);
  const res = await integrity.verifyChainIntegrity(TENANT);
  assert.equal(res.integrity_ok, false);
});

test('register rechaza offline con fecha inválida y no escribe nada', async () => {
  const before = (await ctx.sql('SELECT COUNT(*)::int AS n FROM attendance_records'))[0].n;
  const res = await call({ employee_id: EMP, type: 'exit', _offline_sync: true, _offline_timestamp: '2020-01-01T00:00:00Z' });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 'OFFLINE_TOO_OLD');
  assert.equal((await ctx.sql('SELECT COUNT(*)::int AS n FROM attendance_records'))[0].n, before);
});

test('register rechaza empleados de otra empresa', async () => {
  const other = randomUUID();
  await ctx.sql("INSERT INTO tenants (id, name, slug) VALUES ($1, 'Otra', 'otra')", [other]);
  const otherEmp = randomUUID();
  await ctx.sql("INSERT INTO employees (id, tenant_id, rut, first_name, last_name) VALUES ($1, $2, '2-7', 'Beto', 'X')", [otherEmp, other]);
  const res = await call({ employee_id: otherEmp, type: 'entry' });
  assert.equal(res.statusCode, 404);
});

