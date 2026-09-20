// Edición / borrado administrativo de marcaciones (interino hasta la etapa 9: correcciones con original conservado).
process.env.TIMESTAMP_SECRET = 'test-timestamp-secret';
process.env.SESSION_SECRET = 'test-secret';
delete process.env.RESEND_API_KEY;

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestDb, useDb, MIGRATIONS_DIR } = require('./pgHelper');
const { mockRes, mockReq } = require('./helpers');
const { applyMigrations } = require('../api/lib/migrations');
const { signAdminSession } = require('../api/lib/session');

let ctx;
let handler;
let integrity;
const TENANT = randomUUID();
const OTHER_TENANT = randomUUID();
const EMP = randomUUID();
const tokenFor = (tid, role = 'admin', email = 'rrhh@acme.cl') => signAdminSession({ tenantId: tid, slug: 's', role, email });

async function newRecord() {
  const id = randomUUID();
  await integrity.insertAttendanceRecord({
    id, tenant_id: TENANT, employee_id: EMP, type: 'entry',
    timestamp: new Date(Date.now() - 3600e3).toISOString(), method: 'pin', auth_method: 'PIN', auth_result: 'SUCCESS',
  });
  return id;
}

async function call(method, id, { body = {}, token = tokenFor(TENANT, 'admin') } = {}) {
  const res = mockRes();
  await handler(mockReq({
    method, query: { id }, body,
    headers: { authorization: `Bearer ${token}`, 'user-agent': 'test-agent', 'x-forwarded-for': '9.9.9.9' },
  }), res);
  return res;
}

test('preparación', async () => {
  ctx = await createTestDb();
  useDb(ctx.sql);
  await ctx.sql("INSERT INTO tenants (id, name, slug) VALUES ($1, 'Acme', 'acme'), ($2, 'Otra', 'otra')", [TENANT, OTHER_TENANT]);
  await ctx.sql("INSERT INTO employees (id, tenant_id, rut, first_name, last_name) VALUES ($1, $2, '1-9', 'Ana', 'Perez')", [EMP, TENANT]);
  await applyMigrations(ctx.db, MIGRATIONS_DIR);
  integrity = require('../api/lib/integrity');
  integrity._resetV2Cache();
  handler = require('../api/attendance/[id]/index');
});

test('PUT: audita ANTES de modificar, con el actor real y el registro original completo', async () => {
  const id = await newRecord();
  const [orig] = await ctx.sql('SELECT * FROM attendance_records WHERE id = $1', [id]);
  const newTs = new Date(Date.now() - 7200e3).toISOString();

  const res = await call('PUT', id, { body: { timestamp: newTs, reason: 'Olvidó marcar' } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));

  const [audit] = await ctx.sql("SELECT * FROM audit_log WHERE target_id = $1 AND action = 'attendance.edit'", [id]);
  assert.ok(audit, 'debe existir la entrada de auditoría');
  assert.equal(audit.actor, 'rrhh@acme.cl');
  assert.equal(audit.actor_role, 'admin');
  assert.equal(audit.user_agent, 'test-agent');
  assert.equal(audit.ip, '9.9.9.9');
  assert.equal(audit.details.reason, 'Olvidó marcar');
  assert.equal(audit.details.new_timestamp, newTs);
  // El original queda íntegro en la auditoría (con su hash y su secuencia)
  assert.equal(audit.details.original_record.record_hash, orig.record_hash);
  assert.equal(audit.details.original_record.auth_method, 'PIN');
  assert.equal(new Date(audit.details.original_record.timestamp).toISOString(), new Date(orig.timestamp).toISOString());
});

test('PUT con timestamp inválido: 400 y sin cambios', async () => {
  const id = await newRecord();
  const res = await call('PUT', id, { body: { timestamp: 'no-es-fecha' } });
  assert.equal(res.statusCode, 400);
  assert.equal((await ctx.sql("SELECT COUNT(*)::int AS n FROM audit_log WHERE target_id = $1", [id]))[0].n, 0);
});

test('si la auditoría falla, la modificación NO se realiza (nada cambia sin constancia)', async () => {
  const id = await newRecord();
  const [before] = await ctx.sql('SELECT timestamp FROM attendance_records WHERE id = $1', [id]);

  await ctx.sql(`CREATE FUNCTION audit_down() RETURNS TRIGGER AS $$ BEGIN RAISE EXCEPTION 'auditoria caida'; END; $$ LANGUAGE plpgsql`);
  await ctx.sql('CREATE TRIGGER trg_audit_down BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_down()');

  const put = await call('PUT', id, { body: { timestamp: new Date().toISOString() } });
  assert.equal(put.statusCode, 500);
  const del = await call('DELETE', id);
  assert.equal(del.statusCode, 500);

  await ctx.sql('DROP TRIGGER trg_audit_down ON audit_log');

  const [after] = await ctx.sql('SELECT timestamp FROM attendance_records WHERE id = $1', [id]);
  assert.equal(new Date(after.timestamp).toISOString(), new Date(before.timestamp).toISOString(), 'el registro no debió cambiar');
});

test('DELETE: guarda el registro original completo en la auditoría antes de borrarlo', async () => {
  const id = await newRecord();
  const [orig] = await ctx.sql('SELECT * FROM attendance_records WHERE id = $1', [id]);

  const res = await call('DELETE', id, { body: { reason: 'Duplicado' } });
  assert.equal(res.statusCode, 200);
  assert.equal((await ctx.sql('SELECT COUNT(*)::int AS n FROM attendance_records WHERE id = $1', [id]))[0].n, 0);

  const [audit] = await ctx.sql("SELECT * FROM audit_log WHERE target_id = $1 AND action = 'attendance.delete'", [id]);
  assert.equal(audit.details.original_record.record_hash, orig.record_hash);
  assert.equal(audit.details.reason, 'Duplicado');
  assert.equal(audit.actor, 'rrhh@acme.cl');
});

test('otra empresa no puede tocar la marcación (aislamiento) y un supervisor no puede editar', async () => {
  const id = await newRecord();
  const cross = await call('PUT', id, { body: { timestamp: new Date().toISOString() }, token: tokenFor(OTHER_TENANT) });
  assert.equal(cross.statusCode, 404);

  const sup = await call('PUT', id, { body: { timestamp: new Date().toISOString() }, token: tokenFor(TENANT, 'supervisor') });
  assert.equal(sup.statusCode, 403);
});

test('con los triggers activos: 409 explicativo, el original intacto y el intento auditado', async () => {
  const id = await newRecord();
  const [orig] = await ctx.sql('SELECT timestamp, record_hash FROM attendance_records WHERE id = $1', [id]);
  const out = await integrity.createProtectionRules();
  assert.equal(out.success, true, out.error);

  const put = await call('PUT', id, { body: { timestamp: new Date().toISOString() } });
  assert.equal(put.statusCode, 409);
  assert.equal(put.body.code, 'RECORD_PROTECTED');

  const del = await call('DELETE', id);
  assert.equal(del.statusCode, 409);
  assert.equal(del.body.code, 'RECORD_PROTECTED');

  const [after] = await ctx.sql('SELECT timestamp, record_hash FROM attendance_records WHERE id = $1', [id]);
  assert.equal(new Date(after.timestamp).toISOString(), new Date(orig.timestamp).toISOString());
  assert.equal(after.record_hash, orig.record_hash);

  const failed = await ctx.sql("SELECT action FROM audit_log WHERE target_id = $1 AND action LIKE '%_failed'", [id]);
  assert.deepEqual(failed.map((r) => r.action).sort(), ['attendance.delete_failed', 'attendance.edit_failed']);
});
