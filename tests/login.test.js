const test = require('node:test');
const assert = require('node:assert/strict');
const { stubDb, mockRes, mockReq } = require('./helpers');

process.env.SESSION_SECRET = 'test-secret';

const { hashPin, isHashed } = require('../api/lib/hash');
const { verify } = require('../api/lib/session');

const state = {
  tenant: { id: 't1', slug: 'acme', name: 'Acme', plan: 'basico', active: true, admin_email: 'admin@acme.cl', admin_password: 'clave-plana-123', must_change_password: false },
  users: [{ id: 'u1', tenant_id: 't1', email: 'sup@acme.cl', password: hashPin('otra-clave'), role: 'supervisor', name: 'Sup', department: 'Bodega', active: true }],
};

const calls = stubDb((q, p) => {
  if (q.includes('FROM tenants')) return [state.tenant];
  if (q.includes('FROM tenant_users')) return state.users.filter(u => u.email === p[1]);
  if (q.startsWith('UPDATE tenants SET admin_password')) { state.tenant.admin_password = p[0]; return []; }
  return [];
});

const login = require('../api/auth/login');
const post = (body, ip = '10.0.0.1') => mockReq({ method: 'POST', headers: { 'x-tenant-slug': 'acme', 'x-forwarded-for': ip }, body });

test('login del admin: entrega token firmado con tenant y rol', async () => {
  const res = mockRes();
  await login(post({ email: 'admin@acme.cl', password: 'clave-plana-123' }), res);
  assert.equal(res.statusCode, 200);
  const p = verify(res.body.token);
  assert.equal(p.typ, 'admin');
  assert.equal(p.tid, 't1');
  assert.equal(p.role, 'admin');
});

test('login migra la contrasena en texto plano a hash', async () => {
  assert.equal(isHashed(state.tenant.admin_password), true, 'debio quedar hasheada tras el login anterior');
  const res = mockRes();
  await login(post({ email: 'admin@acme.cl', password: 'clave-plana-123' }, '10.0.0.2'), res);
  assert.equal(res.statusCode, 200); // sigue entrando con el hash
});

test('login de usuario secundario: el token lleva su rol, no admin', async () => {
  const res = mockRes();
  await login(post({ email: 'sup@acme.cl', password: 'otra-clave' }, '10.0.0.3'), res);
  assert.equal(res.statusCode, 200);
  assert.equal(verify(res.body.token).role, 'supervisor');
});

test('login con contrasena incorrecta: 401 y sin token', async () => {
  const res = mockRes();
  await login(post({ email: 'admin@acme.cl', password: 'mala' }, '10.0.0.4'), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.token, undefined);
});

test('login: rate limit tras 10 intentos por IP', async () => {
  let last;
  for (let i = 0; i < 12; i++) {
    last = mockRes();
    await login(post({ email: 'admin@acme.cl', password: 'mala' }, '10.9.9.9'), last);
  }
  assert.equal(last.statusCode, 429);
  assert.ok(calls.length > 0);
});
