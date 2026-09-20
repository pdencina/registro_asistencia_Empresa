// Endpoints con política de marcación: pin-checkin (RUT + PIN con hash), política, cambio y restablecimiento de PIN.
process.env.TIMESTAMP_SECRET = 'test-timestamp-secret';
process.env.SESSION_SECRET = 'test-secret';
process.env.PIN_PEPPER = 'pepper-de-prueba';
process.env.ENABLE_ENFORCED_MARKING = 'true';
process.env.BASE_URL = 'https://flexio.test';
delete process.env.RESEND_API_KEY;

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestDb, useDb, MIGRATIONS_DIR } = require('./pgHelper');
const { mockRes, mockReq } = require('./helpers');
const { applyMigrations } = require('../api/lib/migrations');
const { signAdminSession } = require('../api/lib/session');

let ctx;
let integrity;
let h; // handlers
const TENANT = randomUUID();
const OTHER = randomUUID();
const EMP = { ana: randomUUID(), beto: randomUUID(), caro: randomUUID() };
const RUT = { ana: '11.111.111-1', beto: '22.222.222-2', caro: '33.333.333-3' };
let ipCounter = 0;
const nextIp = () => `10.20.30.${++ipCounter}`;

const token = (tid, role = 'admin', email = 'rrhh@acme.cl') => signAdminSession({ tenantId: tid, slug: 's', role, email });

async function call(handler, { method = 'POST', body = {}, query = {}, headers = {} } = {}) {
  const res = mockRes();
  await handler(mockReq({ method, body, query, headers: { 'x-forwarded-for': nextIp(), ...headers } }), res);
  return res;
}
const tenantCall = (handler, body, slug = 'acme', extra = {}) => call(handler, { body, headers: { 'x-tenant-slug': slug, ...extra } });
const adminCall = (handler, opts = {}, tid = TENANT, role = 'admin') =>
  call(handler, { ...opts, headers: { authorization: `Bearer ${token(tid, role)}`, ...(opts.headers || {}) } });

const records = (employeeId) => ctx.sql('SELECT * FROM attendance_records WHERE employee_id = $1 ORDER BY seq', [employeeId]);

// Simula Resend para capturar los correos
const emails = [];
const realFetch = global.fetch;
function mockResend() {
  process.env.RESEND_API_KEY = 're_test';
  global.fetch = async (url, opts) => {
    if (String(url).includes('api.resend.com')) { emails.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; }
    return realFetch(url, opts);
  };
}
function unmockResend() { delete process.env.RESEND_API_KEY; global.fetch = realFetch; }

test('preparación', async () => {
  ctx = await createTestDb();
  useDb(ctx.sql);
  await applyMigrations(ctx.db, MIGRATIONS_DIR);
  await ctx.sql("INSERT INTO tenants (id, name, slug, admin_email) VALUES ($1, 'Acme', 'acme', 'a@acme.cl'), ($2, 'Otra', 'otra', 'o@otra.cl')", [TENANT, OTHER]);
  for (const k of Object.keys(EMP)) {
    await ctx.sql('INSERT INTO employees (id, tenant_id, rut, first_name, last_name, email) VALUES ($1, $2, $3, $4, $5, $6)',
      [EMP[k], TENANT, RUT[k], k, 'Test', k === 'caro' ? null : `${k}@correo.cl`]);
  }
  integrity = require('../api/lib/integrity');
  integrity._resetV2Cache();
  h = {
    policy: require('../api/policy/index'),
    publicPolicy: require('../api/policy/public'),
    checkin: require('../api/attendance/pin-checkin'),
    register: require('../api/attendance/register'),
    createPin: require('../api/auth/create-pin'),
    changePin: require('../api/auth/change-pin'),
    resetPin: require('../api/auth/reset-pin'),
    setPin: require('../api/auth/set-pin'),
  };
});

// ---------------- política ----------------

test('GET /policy: política por defecto con advertencias; el supervisor puede leerla pero no editarla', async () => {
  const res = await adminCall(h.policy, { method: 'GET' }, TENANT, 'supervisor');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.policy.version, 0);
  assert.equal(res.body.policy.legacy_marking, true);
  assert.ok(res.body.presets.includes('FACIAL_PIN'));

  const put = await adminCall(h.policy, { method: 'PUT', body: { preset: 'FACIAL_PIN' } }, TENANT, 'rrhh');
  assert.equal(put.statusCode, 403);
});

test('PUT /policy: sin sesión 401; "solo facial" exige confirmación y queda auditada', async () => {
  assert.equal((await tenantCall(h.policy, { preset: 'FACIAL_PIN' })).statusCode, 401);

  const noAck = await adminCall(h.policy, { method: 'PUT', body: { preset: 'FACIAL_ONLY' } });
  assert.equal(noAck.statusCode, 409);
  assert.equal(noAck.body.code, 'ACK_REQUIRED');
  assert.equal(noAck.body.warnings[0].article, 'Art. 7 g)');

  const ok = await adminCall(h.policy, { method: 'PUT', body: { preset: 'FACIAL_ONLY', acknowledge: ['ART_7G_TWO_ALTERNATIVES'], reason: 'Piloto sin PIN' } });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.policy.version, 1);

  const [audit] = await ctx.sql("SELECT * FROM audit_log WHERE action = 'policy.update' AND tenant_id = $1", [TENANT]);
  assert.equal(audit.actor, 'rrhh@acme.cl');
  assert.equal(audit.details.reason, 'Piloto sin PIN');
  assert.deepEqual(audit.details.acknowledged, ['ART_7G_TWO_ALTERNATIVES']);
  assert.equal(audit.details.to_version, 1);
});

test('PUT /policy: los valores que el texto prohíbe devuelven 422 con el artículo', async () => {
  const res = await adminCall(h.policy, { method: 'PUT', body: { changes: { geo_mode: 'BLOCK', marks_retention_years: 2 } } });
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.code, 'VALIDATION_FAILED');
  assert.deepEqual(res.body.errors.map((e) => e.article).sort(), ['Art. 53 c)', 'Art. 53 f) y 58 l)']);
});

test('historial de versiones y aislamiento entre empresas', async () => {
  const hist = await adminCall(h.policy, { method: 'GET', query: { history: '1' } });
  assert.equal(hist.statusCode, 200);
  assert.equal(hist.body.versions.length, 1);
  const other = await adminCall(h.policy, { method: 'GET', query: { history: '1' } }, OTHER);
  assert.equal(other.body.versions.length, 0);
});

test('activar el modo con política (facial + PIN, sin flujo legado) y consultar lo público', async () => {
  const res = await adminCall(h.policy, { method: 'PUT', body: { preset: 'FACIAL_PIN', changes: { legacy_marking: false, pin_max_attempts: 3 }, reason: 'Empresa enrolada' } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.policy.version, 2);
  assert.equal(res.body.policy.legacy_marking, false);

  const pub = await tenantCall(h.publicPolicy, undefined, 'acme');
  const pubGet = await call(h.publicPolicy, { method: 'GET', headers: { 'x-tenant-slug': 'acme' } });
  assert.equal(pubGet.statusCode, 200);
  assert.equal(pubGet.body.legacy_marking, false);
  assert.deepEqual(pubGet.body.channels.TOTEM, { primary: ['FACIAL'], fallback: ['PIN'] });
  assert.equal(pubGet.body.facial_threshold, undefined, 'no expone parámetros internos');
  void pub;
});

// ---------------- PIN: creación por enlace ----------------

let anaLink;

test('sin PIN creado el trabajador no puede marcar (respuesta genérica, no revela nada)', async () => {
  const res = await tenantCall(h.checkin, { rut: RUT.ana, pin: '4821', action: 'entry', source: 'totem' });
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'INVALID_CREDENTIALS');
});

test('create-pin (solo RUT) queda bloqueado con política activa', async () => {
  const res = await tenantCall(h.createPin, { rut: RUT.ana, pin: '4821' });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'USE_RESET_LINK');
});

test('restablecer PIN: exige correo del trabajador y correo configurado', async () => {
  const noEmail = await adminCall(h.resetPin, { body: { employee_id: EMP.caro } });
  assert.equal(noEmail.statusCode, 409);
  assert.equal(noEmail.body.code, 'EMAIL_REQUIRED');

  const noMailer = await adminCall(h.resetPin, { body: { employee_id: EMP.ana } });
  assert.equal(noMailer.statusCode, 503);
  assert.equal(noMailer.body.code, 'EMAIL_NOT_CONFIGURED');
});

test('restablecer PIN: el enlace llega solo al correo del trabajador; la administración no lo recibe', async () => {
  mockResend();
  const res = await adminCall(h.resetPin, { body: { employee_id: EMP.ana } });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(emails.length, 1);
  assert.deepEqual(emails[0].to, ['ana@correo.cl']);
  const link = /href="([^"]+)"/.exec(emails[0].html)[1].replace(/&amp;/g, '&');
  const tokenValue = new URL(link).searchParams.get('token');
  assert.match(link, /^https:\/\/flexio\.test\/crear-pin\/acme\?token=/);
  assert.ok(tokenValue.length >= 30);
  assert.equal(JSON.stringify(res.body).includes(tokenValue), false, 'el enlace no viaja en la respuesta a la administración');
  anaLink = tokenValue;

  const [audit] = await ctx.sql("SELECT * FROM audit_log WHERE action = 'credential.reset'");
  assert.equal(audit.actor, 'rrhh@acme.cl');
  assert.equal(JSON.stringify(audit.details).includes(tokenValue), false);
  unmockResend();
});

test('otra empresa no puede restablecer el PIN de este trabajador', async () => {
  // La otra empresa también usa política (si no, el reset responde 409 antes de buscar al trabajador)
  await require('../api/lib/policy').savePolicy(ctx.sql, OTHER, { preset: 'FACIAL_PIN', changes: { legacy_marking: false }, actor: 'test' });
  mockResend();
  const res = await adminCall(h.resetPin, { body: { employee_id: EMP.beto } }, OTHER);
  assert.equal(res.statusCode, 404);
  unmockResend();

  // Y una empresa que aún usa el flujo legado no puede usar el reset por enlace
  const LEG = randomUUID();
  await ctx.sql("INSERT INTO tenants (id, name, slug) VALUES ($1, 'Leg', 'leg-reset')", [LEG]);
  const legacy = await adminCall(h.resetPin, { body: { employee_id: EMP.beto } }, LEG);
  assert.equal(legacy.statusCode, 409);
  assert.equal(legacy.body.code, 'LEGACY_MODE');
});

test('crear el PIN con el enlace: valida formato sin gastar el enlace, se usa una sola vez', async () => {
  mockResend();
  const weak = await tenantCall(h.setPin, { token: anaLink, pin: '1234' });
  assert.equal(weak.statusCode, 422);
  assert.equal(weak.body.code, 'PIN_FORMAT');

  const wrongTenant = await tenantCall(h.setPin, { token: anaLink, pin: '4821' }, 'otra');
  assert.equal(wrongTenant.statusCode, 410);

  const ok = await tenantCall(h.setPin, { token: anaLink, pin: '4821' });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  const reuse = await tenantCall(h.setPin, { token: anaLink, pin: '9053' });
  assert.equal(reuse.statusCode, 410);

  // Art. 7 f): correo automático con el resultado, fecha y hora, sin el PIN
  const mail = emails[emails.length - 1];
  assert.deepEqual(mail.to, ['ana@correo.cl']);
  assert.match(mail.html, /creado correctamente/);
  assert.match(mail.html, /\d{2}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{2}/);
  assert.equal(mail.html.includes('4821'), false);
  unmockResend();

  const [c] = await ctx.sql('SELECT secret_hash FROM employee_credentials WHERE employee_id = $1', [EMP.ana]);
  assert.match(c.secret_hash, /^[0-9a-f]{8}\$[0-9a-f]{32}:[0-9a-f]{128}$/, 'solo se guarda el hash');
});

// ---------------- marcación con política ----------------

test('exige RUT y PIN: PIN solo o RUT solo ya no marcan', async () => {
  for (const body of [{ pin: '4821' }, { rut: RUT.ana }]) {
    const res = await tenantCall(h.checkin, { ...body, action: 'entry', source: 'totem' });
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(res.body.code, 'RUT_AND_PIN_REQUIRED');
  }
  assert.equal((await records(EMP.ana)).length, 0);
});

test('RUT + PIN correctos: se marca con evidencia (método, resultado y versión de política)', async () => {
  const res = await tenantCall(h.checkin, { rut: RUT.ana, pin: '4821', action: 'entry', source: 'totem', device_id: 'totem-1' });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const [r] = await records(EMP.ana);
  assert.equal(r.auth_method, 'PIN');
  assert.equal(r.auth_result, 'SUCCESS');
  assert.equal(Number(r.policy_version), 2);
  assert.equal(r.channel, 'TOTEM');
  assert.equal(Number(r.hash_version), 2);
});

test('RUT sin puntos ni guión también funciona (normalización)', async () => {
  const res = await tenantCall(h.checkin, { rut: '111111111', pin: '4821', action: 'identify', source: 'totem' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.employee.first_name, 'ana');
});

test('Art. 36 c): la misma marca repetida se ignora y se conserva la primera', async () => {
  const again = await tenantCall(h.checkin, { rut: RUT.ana, pin: '4821', action: 'entry', source: 'totem' });
  assert.equal(again.statusCode, 200);
  assert.equal(again.body.duplicate, true);
  assert.equal((await records(EMP.ana)).length, 1);
  const [attempt] = await ctx.sql("SELECT outcome FROM auth_attempts WHERE employee_id = $1 AND outcome = 'DUPLICATE_IGNORED'", [EMP.ana]);
  assert.ok(attempt);

  const exit = await tenantCall(h.checkin, { rut: RUT.ana, pin: '4821', action: 'exit', source: 'totem' });
  assert.equal(exit.statusCode, 201);
  assert.equal((await records(EMP.ana)).length, 2);
});

test('PIN incorrecto y RUT inexistente responden exactamente igual (sin enumeración)', async () => {
  const wrongPin = await tenantCall(h.checkin, { rut: RUT.ana, pin: '0000', action: 'entry', source: 'totem' });
  const unknown = await tenantCall(h.checkin, { rut: '99.999.999-9', pin: '0000', action: 'entry', source: 'totem' });
  assert.equal(wrongPin.statusCode, 401);
  assert.equal(unknown.statusCode, 401);
  assert.deepEqual(wrongPin.body, unknown.body);
});

test('bloqueo por intentos fallidos: 423 con tiempo de espera, y el PIN correcto tampoco pasa mientras dura', async () => {
  let res;
  for (let i = 0; i < 3; i++) res = await tenantCall(h.checkin, { rut: RUT.ana, pin: '0000', action: 'entry', source: 'totem' });
  assert.equal(res.statusCode, 423);
  assert.equal(res.body.code, 'LOCKED');
  assert.ok(res.body.retry_after_seconds > 0);

  const correct = await tenantCall(h.checkin, { rut: RUT.ana, pin: '4821', action: 'identify', source: 'totem' });
  assert.equal(correct.statusCode, 423);

  // Los intentos quedan registrados sin ningún PIN (se revisan las columnas de texto libre; los UUID en hexadecimal
  // pueden contener una secuencia de dígitos por puro azar)
  for (const row of await ctx.sql('SELECT * FROM auth_attempts')) {
    for (const col of ['reason', 'outcome', 'method', 'channel', 'device_id', 'ip']) {
      const v = String(row[col] ?? '');
      assert.equal(v.includes('0000') || v.includes('4821'), false, `un PIN apareció en auth_attempts.${col}`);
    }
  }
  await ctx.sql("UPDATE employee_credentials SET locked_until = NULL, failed_count = 0, lock_count = 0 WHERE employee_id = $1", [EMP.ana]);
});

test('cambiar el propio PIN: exige el actual, valida el nuevo, avisa por correo y el anterior deja de servir', async () => {
  mockResend();
  const before = emails.length;

  const weak = await tenantCall(h.changePin, { rut: RUT.ana, current_pin: '4821', new_pin: '1111' });
  assert.equal(weak.statusCode, 422);
  const wrong = await tenantCall(h.changePin, { rut: RUT.ana, current_pin: '9999', new_pin: '7351' });
  assert.equal(wrong.statusCode, 401);

  const ok = await tenantCall(h.changePin, { rut: RUT.ana, current_pin: '4821', new_pin: '7351' });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.notified, true);
  assert.equal(emails.length, before + 1);
  assert.match(emails[emails.length - 1].html, /cambiado correctamente/);
  assert.equal(emails[emails.length - 1].html.includes('7351'), false);
  unmockResend();

  assert.equal((await tenantCall(h.checkin, { rut: RUT.ana, pin: '4821', action: 'identify', source: 'totem' })).statusCode, 401);
  assert.equal((await tenantCall(h.checkin, { rut: RUT.ana, pin: '7351', action: 'identify', source: 'totem' })).statusCode, 200);
});

test('con la política sin configurar o con el método deshabilitado en el canal: 403 y no se marca', async () => {
  // Móvil solo con facial (override), tótem con PIN
  const ov = await adminCall(h.policy, { method: 'PUT', body: { changes: { channel_overrides: { MOBILE: { primary_methods: ['FACIAL'], fallback_methods: ['FACIAL'] } } }, acknowledge: ['ART_7G_TWO_ALTERNATIVES'] } });
  assert.equal(ov.statusCode, 200, JSON.stringify(ov.body));
  const mobile = await tenantCall(h.checkin, { rut: RUT.ana, pin: '7351', action: 'identify', source: 'movil' });
  assert.equal(mobile.statusCode, 403);
  assert.equal(mobile.body.code, 'METHOD_NOT_ALLOWED');
  const totem = await tenantCall(h.checkin, { rut: RUT.ana, pin: '7351', action: 'identify', source: 'totem' });
  assert.equal(totem.statusCode, 200);

  const unconf = await adminCall(h.policy, { method: 'PUT', body: { preset: 'UNCONFIGURED', changes: { legacy_marking: false } } });
  assert.equal(unconf.statusCode, 200, JSON.stringify(unconf.body));
  const blocked = await tenantCall(h.checkin, { rut: RUT.ana, pin: '7351', action: 'identify', source: 'totem' });
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.body.code, 'POLICY_UNCONFIGURED');
});

test('register (facial validado en el navegador) se rechaza con política activa', async () => {
  const res = await tenantCall(h.register, { employee_id: EMP.beto, type: 'entry', source: 'movil' });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'SERVER_VERIFICATION_REQUIRED');
  assert.equal((await records(EMP.beto)).length, 0);
});

test('con el flujo legado activo nada cambia: RUT solo y PIN sin RUT siguen funcionando', async () => {
  const LEG = randomUUID();
  await ctx.sql("INSERT INTO tenants (id, name, slug) VALUES ($1, 'Legado', 'legado')", [LEG]);
  const e = randomUUID();
  await ctx.sql("INSERT INTO employees (id, tenant_id, rut, first_name, last_name, personal_pin) VALUES ($1, $2, '44.444.444-4', 'Dani', 'X', '8765')", [e, LEG]);

  const viaPin = await tenantCall(h.checkin, { pin: '8765', action: 'entry', source: 'totem' }, 'legado');
  assert.equal(viaPin.statusCode, 201, JSON.stringify(viaPin.body));
  const [r] = await records(e);
  assert.equal(r.auth_method, 'PIN');
  assert.equal(Number(r.policy_version), 0);

  const reg = await tenantCall(h.register, { employee_id: e, type: 'exit', source: 'movil' }, 'legado');
  assert.equal(reg.statusCode, 201, JSON.stringify(reg.body));
});

test('la cadena de integridad de la empresa sigue verificando tras todo esto', async () => {
  const res = await integrity.verifyChainIntegrity(TENANT);
  assert.equal(res.integrity_ok, true, JSON.stringify(res.corrupted_records));
});
