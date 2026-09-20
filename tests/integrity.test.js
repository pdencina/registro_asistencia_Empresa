const test = require('node:test');
const assert = require('node:assert/strict');
const { computeRecordHash } = require('../api/lib/integrity');

const base = {
  id: 'r1', tenant_id: 't1', employee_id: 'e1',
  type: 'entrada', timestamp: '2026-01-01T08:00:00.000Z', method: 'pin',
};

test('computeRecordHash es determinista y hex SHA-256', () => {
  const h = computeRecordHash(base);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, computeRecordHash(base));
});

test('computeRecordHash cambia si se altera cualquier campo', () => {
  const h = computeRecordHash(base);
  for (const [k, v] of Object.entries({ id: 'r2', tenant_id: 't2', employee_id: 'e2', type: 'salida', timestamp: '2026-01-01T09:00:00.000Z', method: 'qr' })) {
    assert.notEqual(h, computeRecordHash({ ...base, [k]: v }), `campo ${k}`);
  }
});

test('computeRecordHash encadena con previous_hash', () => {
  const genesis = computeRecordHash(base);
  const next = computeRecordHash({ ...base, id: 'r2', previous_hash: genesis });
  assert.notEqual(next, computeRecordHash({ ...base, id: 'r2' }));
});
