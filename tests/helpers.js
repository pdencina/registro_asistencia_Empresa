// Utilidades para probar handlers sin base de datos real.
const path = require('node:path');

/** Reemplaza api/lib/db.js por un sql falso: handler(query, params) => filas */
function stubDb(handler) {
  const dbPath = require.resolve(path.join(__dirname, '../api/lib/db.js'));
  const calls = [];
  const sql = async (q, p) => { calls.push({ q, p }); return handler(String(q), p || []); };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getDb: () => sql } };
  return calls;
}

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined, ended: false };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; res.ended = true; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}

function mockReq({ method = 'GET', headers = {}, query = {}, body = {} } = {}) {
  return { method, headers, query, body };
}

module.exports = { stubDb, mockRes, mockReq };
