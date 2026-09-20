const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = 'test-secret';
const { sign, verify, signAdminSession, signSuperAdminSession } = require('../api/lib/session');

test('token firmado se verifica y conserva el payload', () => {
  const t = signAdminSession({ tenantId: 't1', slug: 'acme', role: 'admin', email: 'a@b.cl' });
  const p = verify(t);
  assert.equal(p.typ, 'admin');
  assert.equal(p.tid, 't1');
  assert.equal(p.role, 'admin');
});

test('token alterado o con firma ajena es rechazado', () => {
  const t = signAdminSession({ tenantId: 't1', slug: 'acme', role: 'supervisor', email: 'a@b.cl' });
  const [h, , s] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ typ: 'admin', tid: 't2', role: 'admin', exp: 9999999999 })).toString('base64url');
  assert.equal(verify(`${h}.${forged}.${s}`), null);
  assert.equal(verify(t + 'x'), null);
  assert.equal(verify('a.b.c'), null);
  assert.equal(verify(''), null);
  assert.equal(verify(undefined), null);
});

test('token expirado es rechazado', () => {
  assert.equal(verify(sign({ typ: 'admin' }, -10)), null);
});

test('token de superadmin tiene typ propio', () => {
  assert.equal(verify(signSuperAdminSession()).typ, 'superadmin');
});
