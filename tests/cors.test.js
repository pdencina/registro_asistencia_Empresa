const test = require('node:test');
const assert = require('node:assert/strict');
const { corsHeaders } = require('../api/lib/cors');

test('CORS: permite dominios propios, previews y localhost', () => {
  for (const o of ['https://flexio.cl', 'https://app.flexio.cl', 'https://flexio-abc.vercel.app', 'http://localhost:5173']) {
    assert.equal(corsHeaders(o)['Access-Control-Allow-Origin'], o, o);
  }
});

test('CORS: no habilita origenes ajenos ni parecidos', () => {
  for (const o of ['https://evil.com', 'https://flexio.cl.evil.com', 'https://notflexio.cl', 'http://flexio.cl', undefined]) {
    assert.equal(corsHeaders(o)['Access-Control-Allow-Origin'], undefined, String(o));
  }
});
