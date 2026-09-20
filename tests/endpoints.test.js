const test = require('node:test');
const assert = require('node:assert/strict');
const { stubDb, mockRes, mockReq } = require('./helpers');

process.env.SESSION_SECRET = 'test-secret';
process.env.GLOBAL_ADMIN_SECRET = 'super-secret';

const TENANT = { id: 't1', slug: 'acme', name: 'Acme', active: true, admin_email: 'a@acme.cl', max_employees: 30 };
const EMPLOYEE = {
  id: 'e1', tenant_id: 't1', rut: '12.345.678-5', first_name: 'Ana', last_name: 'Perez', active: true,
  department: 'Ventas', position: 'Vendedora', photo_url: 'https://x/y.jpg', consent_status: 'approved',
  personal_pin: '4821', email: 'ana@x.cl', phone: '+56911111111',
};

stubDb((q) => {
  if (q.includes('FROM tenants')) return [TENANT];
  if (q.includes('FROM employees')) return [EMPLOYEE];
  return [];
});

const employees = require('../api/employees/index');
const tenantsList = require('../api/tenants/index');
const { signAdminSession } = require('../api/lib/session');

const adminToken = () => signAdminSession({ tenantId: 't1', slug: 'acme', role: 'admin', email: 'a@acme.cl' });

test('GET /employees sin sesion y sin RUT completo: 401, no lista nada', async () => {
  const res = mockRes();
  await employees(mockReq({ headers: { 'x-tenant-slug': 'acme' }, query: {} }), res);
  assert.equal(res.statusCode, 401);

  const res2 = mockRes();
  await employees(mockReq({ headers: { 'x-tenant-slug': 'acme' }, query: { search: 'an' } }), res2);
  assert.equal(res2.statusCode, 401);
});

test('GET /employees sin sesion con RUT: campos minimos y personal_pin solo como booleano', async () => {
  const res = mockRes();
  await employees(mockReq({ headers: { 'x-tenant-slug': 'acme' }, query: { search: '12345678-5' } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
  const e = res.body[0];
  assert.equal(e.personal_pin, true); // nunca el valor del PIN
  assert.equal(e.email, undefined);
  assert.equal(e.phone, undefined);
  assert.equal(JSON.stringify(res.body).includes('4821'), false);
});

test('GET /employees con sesion de admin: listado completo del tenant del token', async () => {
  const res = mockRes();
  await employees(mockReq({ headers: { authorization: `Bearer ${adminToken()}` } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].email, 'ana@x.cl');
});

test('GET /employees con token invalido: 401 (no cae al modo publico)', async () => {
  const res = mockRes();
  await employees(mockReq({ headers: { authorization: 'Bearer basura', 'x-tenant-slug': 'acme' } }), res);
  assert.equal(res.statusCode, 401);
});

test('/api/tenants exige superadmin (antes era publico y filtraba hashes)', async () => {
  const anon = mockRes();
  await tenantsList(mockReq({ headers: { 'x-tenant-slug': 'acme' } }), anon);
  assert.equal(anon.statusCode, 401);

  const asAdmin = mockRes();
  await tenantsList(mockReq({ headers: { authorization: `Bearer ${adminToken()}` } }), asAdmin);
  assert.equal(asAdmin.statusCode, 401);
});
