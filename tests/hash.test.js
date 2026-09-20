const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPin, verifyPin, isHashed } = require('../api/lib/hash');

test('hashPin genera hash verificable y con sal distinta cada vez', () => {
  const a = hashPin('1234');
  const b = hashPin('1234');
  assert.notEqual(a, b);
  assert.ok(isHashed(a));
  assert.ok(verifyPin('1234', a));
  assert.ok(verifyPin('1234', b));
});

test('verifyPin rechaza PIN incorrecto y entradas vacías', () => {
  const h = hashPin('1234');
  assert.equal(verifyPin('4321', h), false);
  assert.equal(verifyPin('', h), false);
  assert.equal(verifyPin('1234', ''), false);
  assert.equal(verifyPin('1234', null), false);
});

test('verifyPin acepta PIN legacy en texto plano', () => {
  assert.equal(isHashed('1234'), false);
  assert.ok(verifyPin('1234', '1234'));
  assert.equal(verifyPin('9999', '1234'), false);
});
