const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('../api/lib/validate');

test('rechaza body no objeto', () => {
  assert.equal(validate(null, {}).valid, false);
});

test('campos obligatorios y email', () => {
  const schema = { email: { required: true, type: 'email' }, name: { required: true, minLength: 2 } };
  assert.equal(validate({ email: 'a@b.cl', name: 'Ana' }, schema).valid, true);
  const r = validate({ email: 'malo' }, schema);
  assert.equal(r.valid, false);
  assert.equal(r.errors.length, 2);
});

test('número con rango, fecha, hora, uuid y enum', () => {
  const schema = {
    n: { type: 'number', min: 1, max: 5 },
    d: { type: 'date' }, t: { type: 'time' }, u: { type: 'uuid' },
    e: { enum: ['a', 'b'] },
  };
  assert.equal(validate({ n: 3, d: '2026-01-01', t: '08:30', u: '123e4567-e89b-12d3-a456-426614174000', e: 'a' }, schema).valid, true);
  assert.equal(validate({ n: 9 }, schema).valid, false);
  assert.equal(validate({ d: '01-01-2026' }, schema).valid, false);
  assert.equal(validate({ t: '8:30' }, schema).valid, false);
  assert.equal(validate({ u: 'x' }, schema).valid, false);
  assert.equal(validate({ e: 'c' }, schema).valid, false);
});
