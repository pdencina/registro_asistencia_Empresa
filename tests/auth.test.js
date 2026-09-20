const test = require('node:test');
const assert = require('node:assert/strict');
const { stubDb, mockRes, mockReq } = require('./helpers');

process.env.SESSION_SECRET = 'test-secret';
process.env.GLOBAL_ADMIN_SECRET = 'super-secret';
delete process.env.CRON_SECRET;

const TENANT = { id: 't1', slug: 'acme', name: 'Acme', active: true, admin_email: 'a@acme.cl' };
stubDb((q, p) => (q.includes('FROM tenants WHERE id') && p[0] === 't1' ? [TENANT] : []));

const { requireAuth, isSuperAdmin, isCronCaller, requireJobAccess } = require('../api/lib/auth');
const { signAdminSession, signSuperAdminSession } = require('../api/lib/session');

const adminToken = (role = 'admin', tid = 't1') => signAdminSession({ tenantId: tid, slug: 'acme', role, email: 'a@acme.cl' });
const bearer = (t) => ({ authorization: `Bearer ${t}` });

test('requireAuth: sin token responde 401 y marca sesión expirada', async () => {
  const res = mockRes();
  assert.equal(await requireAuth(mockReq(), res), null);
  assert.equal(res.statusCode, 401);
  assert.equal(res.headers['X-Session-Expired'], '1');
});

test('requireAuth: header x-tenant-slug NO sustituye a la sesión', async () => {
  const res = mockRes();
  assert.equal(await requireAuth(mockReq({ headers: { 'x-tenant-slug': 'acme' } }), res), null);
  assert.equal(res.statusCode, 401);
});

test('requireAuth: token válido devuelve el tenant y deja la sesión en req', async () => {
  const req = mockReq({ headers: bearer(adminToken()) });
  const tenant = await requireAuth(req, mockRes());
  assert.equal(tenant.id, 't1');
  assert.equal(req.session.role, 'admin');
});

test('requireAuth: el tenant sale del token, no de headers del cliente', async () => {
  const req = mockReq({ headers: { ...bearer(adminToken()), 'x-tenant-slug': 'otra', 'x-tenant-id': 'otro-id' } });
  const tenant = await requireAuth(req, mockRes());
  assert.equal(tenant.id, 't1');
});

test('requireAuth: rol insuficiente responde 403', async () => {
  const res = mockRes();
  const out = await requireAuth(mockReq({ headers: bearer(adminToken('supervisor')) }), res, { roles: ['admin'] });
  assert.equal(out, null);
  assert.equal(res.statusCode, 403);
});

test('requireAuth: un token de superadmin no sirve como admin de empresa', async () => {
  const res = mockRes();
  assert.equal(await requireAuth(mockReq({ headers: bearer(signSuperAdminSession()) }), res), null);
  assert.equal(res.statusCode, 401);
});

test('requireAuth: empresa inactiva o inexistente responde 401', async () => {
  const res = mockRes();
  assert.equal(await requireAuth(mockReq({ headers: bearer(adminToken('admin', 'no-existe')) }), res), null);
  assert.equal(res.statusCode, 401);
});

test('isSuperAdmin: token firmado y x-admin-secret válidos; el resto no', () => {
  assert.equal(isSuperAdmin(mockReq({ headers: bearer(signSuperAdminSession()) })), true);
  assert.equal(isSuperAdmin(mockReq({ headers: { 'x-admin-secret': 'super-secret' } })), true);
  assert.equal(isSuperAdmin(mockReq({ headers: { 'x-admin-secret': 'incorrecto' } })), false);
  assert.equal(isSuperAdmin(mockReq({ headers: bearer(adminToken()) })), false);
  // Formato antiguo: base64(SECRET:timestamp) ya no se acepta
  const legacy = Buffer.from(`super-secret:${Date.now()}`).toString('base64');
  assert.equal(isSuperAdmin(mockReq({ headers: bearer(legacy) })), false);
  assert.equal(isSuperAdmin(mockReq({ headers: bearer('super-secret') })), false);
});

test('isCronCaller: exige CRON_SECRET cuando está definido', () => {
  process.env.CRON_SECRET = 'cron-secret';
  assert.equal(isCronCaller(mockReq({ headers: bearer('cron-secret') })), true);
  assert.equal(isCronCaller(mockReq({ headers: bearer('otro') })), false);
  assert.equal(isCronCaller(mockReq({ headers: { 'user-agent': 'vercel-cron/1.0' } })), false);
  delete process.env.CRON_SECRET;
  assert.equal(isCronCaller(mockReq({ headers: { 'user-agent': 'vercel-cron/1.0' } })), true);
  assert.equal(isCronCaller(mockReq({ headers: { 'user-agent': 'curl/8' } })), false);
});

test('requireJobAccess: cron = plataforma, admin = su empresa, anónimo = 401', async () => {
  const cron = await requireJobAccess(mockReq({ headers: { 'user-agent': 'vercel-cron/1.0' } }), mockRes());
  assert.equal(cron.scope, 'platform');
  const admin = await requireJobAccess(mockReq({ headers: bearer(adminToken()) }), mockRes());
  assert.equal(admin.scope, 'tenant');
  const res = mockRes();
  assert.equal(await requireJobAccess(mockReq(), res), null);
  assert.equal(res.statusCode, 401);
});
