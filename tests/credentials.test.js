// Credenciales PIN: hash con pepper, bloqueo progresivo, migración del PIN legado, intentos sin PIN, enlaces de un solo uso.
process.env.TIMESTAMP_SECRET = 'test-timestamp-secret';
process.env.PIN_PEPPER = 'pepper-de-prueba';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestDb, useDb, MIGRATIONS_DIR } = require('./pgHelper');
const { applyMigrations } = require('../api/lib/migrations');
const cred = require('../api/lib/credentials');

const POLICY = { pin_max_attempts: 3, pin_lockout_minutes: 15 };
let ctx;
const T = randomUUID();
const mkEmp = async (extra = {}) => {
  const id = randomUUID();
  await ctx.sql('INSERT INTO employees (id, tenant_id, rut, first_name, last_name, personal_pin) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, T, `${Math.floor(Math.random() * 1e7)}-1`, 'Ana', 'Perez', extra.personal_pin || null]);
  return (await ctx.sql('SELECT * FROM employees WHERE id = $1', [id]))[0];
};
const verify = (employee, pin, p = POLICY) => cred.verifyPinForEmployee(ctx.sql, { tenantId: T, employee, pin, policy: p, ctx: { channel: 'TOTEM', ip: '1.1.1.1' } });

test('preparación', async () => {
  ctx = await createTestDb();
  useDb(ctx.sql);
  await applyMigrations(ctx.db, MIGRATIONS_DIR);
});

test('el hash no contiene el PIN, cambia en cada cálculo y verifica', () => {
  const a = cred.hashSecret('73519204');
  const b = cred.hashSecret('73519204');
  assert.notEqual(a, b);
  assert.equal(a.includes('73519204'), false);
  assert.match(a, /^[0-9a-f]{8}\$[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(cred.verifySecret('73519204', a).ok, true);
  assert.equal(cred.verifySecret('73519205', a).ok, false);
  assert.equal(cred.verifySecret('73519204', 'basura').malformed, true);
});

test('el pepper vive fuera de la base: con otro pepper el hash no se puede verificar', () => {
  const stored = cred.hashSecret('4821');
  process.env.PIN_PEPPER = 'otro-pepper';
  const r = cred.verifySecret('4821', stored);
  assert.equal(r.ok, false);
  assert.equal(r.keyMismatch, true);
  process.env.PIN_PEPPER = 'pepper-de-prueba';
});

test('formato del PIN: numérico, largo mínimo, sin repeticiones ni secuencias', () => {
  const ok = ['4821', '907153', '13579'];
  const bad = ['12', 'abcd', '1111', '1234', '4321', '123456789', '', null, '12 34'];
  ok.forEach((p) => assert.equal(cred.validatePinFormat(p).ok, true, p));
  bad.forEach((p) => assert.equal(cred.validatePinFormat(p).ok, false, String(p)));
  assert.equal(cred.validatePinFormat('4821', { minLength: 6 }).ok, false);
});

test('PIN correcto: éxito, contadores en cero y se registra el intento', async () => {
  const e = await mkEmp();
  await cred.setCredential(ctx.sql, { tenantId: T, employeeId: e.id, pin: '4821' });
  const r = await verify(e, '4821');
  assert.deepEqual([r.ok, r.outcome], [true, 'SUCCESS']);
  const [c] = await ctx.sql('SELECT failed_count, lock_count, last_used_at FROM employee_credentials WHERE employee_id = $1', [e.id]);
  assert.equal(c.failed_count, 0);
  assert.ok(c.last_used_at);
});

test('bloqueo tras N fallos; mientras está bloqueado no se verifica ni el PIN correcto', async () => {
  const e = await mkEmp();
  await cred.setCredential(ctx.sql, { tenantId: T, employeeId: e.id, pin: '4821' });

  assert.equal((await verify(e, '0000')).outcome, 'INVALID');
  assert.equal((await verify(e, '0000')).outcome, 'INVALID');
  const third = await verify(e, '0000');
  assert.equal(third.outcome, 'LOCKED');
  assert.ok(third.retryAfterSeconds > 14 * 60 && third.retryAfterSeconds <= 15 * 60);

  const withCorrect = await verify(e, '4821');
  assert.equal(withCorrect.ok, false);
  assert.equal(withCorrect.outcome, 'LOCKED');
});

test('el bloqueo crece en cada reincidencia y un éxito lo reinicia', async () => {
  const e = await mkEmp();
  await cred.setCredential(ctx.sql, { tenantId: T, employeeId: e.id, pin: '4821' });
  const expire = () => ctx.sql("UPDATE employee_credentials SET locked_until = NOW() - interval '1 second' WHERE employee_id = $1", [e.id]);

  for (let i = 0; i < 3; i++) await verify(e, '0000');           // 1.er bloqueo: 15 min
  await expire();
  let last;
  for (let i = 0; i < 3; i++) last = await verify(e, '0000');    // 2.º bloqueo: 30 min
  assert.equal(last.outcome, 'LOCKED');
  assert.ok(last.retryAfterSeconds > 29 * 60 && last.retryAfterSeconds <= 30 * 60, `retry ${last.retryAfterSeconds}`);

  await expire();
  assert.equal((await verify(e, '4821')).ok, true);
  const [c] = await ctx.sql('SELECT lock_count, failed_count FROM employee_credentials WHERE employee_id = $1', [e.id]);
  assert.deepEqual([c.lock_count, c.failed_count], [0, 0]);
});

test('el bloqueo tiene tope de 24 horas', async () => {
  const e = await mkEmp();
  await cred.setCredential(ctx.sql, { tenantId: T, employeeId: e.id, pin: '4821' });
  await ctx.sql('UPDATE employee_credentials SET lock_count = 12 WHERE employee_id = $1', [e.id]);
  let last;
  for (let i = 0; i < 3; i++) last = await verify(e, '0000');
  assert.ok(last.retryAfterSeconds <= 1440 * 60);
  assert.ok(last.retryAfterSeconds > 1400 * 60);
});

test('los intentos se registran SIN el PIN ingresado (ni correcto ni incorrecto)', async () => {
  const e = await mkEmp();
  const RIGHT = '58204917';
  const WRONG = '92736451';
  await cred.setCredential(ctx.sql, { tenantId: T, employeeId: e.id, pin: RIGHT });
  await verify(e, WRONG);
  await verify(e, RIGHT);
  const rows = await ctx.sql('SELECT * FROM auth_attempts WHERE employee_id = $1 ORDER BY created_at', [e.id]);
  assert.deepEqual(rows.map((r) => r.outcome), ['INVALID', 'SUCCESS']);
  for (const row of rows) {
    for (const col of ['reason', 'outcome', 'method', 'channel', 'device_id', 'ip']) {
      const v = String(row[col] ?? '');
      assert.equal(v.includes(RIGHT) || v.includes(WRONG), false, `el PIN apareció en auth_attempts.${col}`);
    }
  }
  const [stored] = await ctx.sql('SELECT secret_hash FROM employee_credentials WHERE employee_id = $1', [e.id]);
  assert.equal(stored.secret_hash.includes(RIGHT), false);
  assert.equal(rows[0].method, 'PIN');
  assert.equal(rows[0].channel, 'TOTEM');
});

test('RUT desconocido: se registra solo un HMAC del RUT, nunca el RUT', async () => {
  await cred.logAttempt(ctx.sql, { tenantId: T, rut: '12.345.678-5', method: 'PIN', outcome: 'INVALID' });
  const [row] = await ctx.sql('SELECT * FROM auth_attempts WHERE rut_hmac IS NOT NULL ORDER BY created_at DESC LIMIT 1');
  assert.match(row.rut_hmac, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(row).includes('12345678'), false);
  assert.equal(row.employee_id, null);
  // Mismo RUT con otro formato produce el mismo HMAC (permite detectar ataques repetidos)
  assert.equal(cred.rutHmac('12.345.678-5'), cred.rutHmac('123456785'.replace(/(\d)(\d)$/, '$1-$2')));
});

test('sin credencial ni PIN legado: NO_CREDENTIAL', async () => {
  const e = await mkEmp();
  const r = await verify(e, '4821');
  assert.deepEqual([r.ok, r.outcome], [false, 'NO_CREDENTIAL']);
});

test('PIN legado en texto plano: se acepta una vez y se migra a hash en el acto', async () => {
  const e = await mkEmp({ personal_pin: '68402915' });
  const wrong = await verify(e, '0000');
  assert.equal(wrong.outcome, 'INVALID');
  assert.equal((await ctx.sql('SELECT COUNT(*)::int AS n FROM employee_credentials WHERE employee_id = $1', [e.id]))[0].n, 0);

  const ok = await verify(e, '68402915');
  assert.deepEqual([ok.ok, ok.migrated], [true, true]);
  const [c] = await ctx.sql('SELECT secret_hash, set_by FROM employee_credentials WHERE employee_id = $1', [e.id]);
  assert.equal(c.set_by, 'MIGRATION');
  assert.equal(c.secret_hash.includes('68402915'), false);

  // A partir de aquí manda la credencial con hash (con bloqueo), no el texto plano
  const again = await cred.verifyPinForEmployee(ctx.sql, { tenantId: T, employee: { ...e }, pin: '68402915', policy: POLICY });
  assert.equal(again.ok, true);
  assert.equal(again.migrated, undefined);
});

test('revocar borra la credencial y el PIN legado', async () => {
  const e = await mkEmp({ personal_pin: '5382' });
  await cred.setCredential(ctx.sql, { tenantId: T, employeeId: e.id, pin: '4821' });
  await cred.revokeCredential(ctx.sql, { tenantId: T, employeeId: e.id });
  assert.equal(await cred.getCredential(ctx.sql, e.id), null);
  assert.equal((await ctx.sql('SELECT personal_pin FROM employees WHERE id = $1', [e.id]))[0].personal_pin, null);
});

test('enlace de un solo uso: se guarda solo su hash, se consume una vez y vence', async () => {
  const e = await mkEmp();
  const token = await cred.createResetToken(ctx.sql, { tenantId: T, employeeId: e.id, createdBy: 'rrhh@acme.cl' });
  const [stored] = await ctx.sql('SELECT token_hash, created_by FROM credential_reset_tokens WHERE employee_id = $1', [e.id]);
  assert.notEqual(stored.token_hash, token);
  assert.equal(JSON.stringify(stored).includes(token), false);

  const first = await cred.consumeResetToken(ctx.sql, token, T);
  assert.equal(first.employee_id, e.id);
  assert.equal(await cred.consumeResetToken(ctx.sql, token, T), null, 'no se puede reutilizar');

  const t2 = await cred.createResetToken(ctx.sql, { tenantId: T, employeeId: e.id });
  await ctx.sql("UPDATE credential_reset_tokens SET expires_at = NOW() - interval '1 minute' WHERE employee_id = $1 AND used_at IS NULL", [e.id]);
  assert.equal(await cred.consumeResetToken(ctx.sql, t2, T), null, 'vencido');
  assert.equal(await cred.consumeResetToken(ctx.sql, 'corto', T), null);

  // Con otra empresa no se consume: el enlace sigue disponible para la correcta
  const t3 = await cred.createResetToken(ctx.sql, { tenantId: T, employeeId: e.id });
  assert.equal(await cred.consumeResetToken(ctx.sql, t3, randomUUID()), null);
  assert.ok(await cred.consumeResetToken(ctx.sql, t3, T), 'el enlace no debió quemarse');
});

test('intentos simultáneos con PIN erróneo: el contador no se pierde (bloquea al llegar al máximo)', async () => {
  const e = await mkEmp();
  await cred.setCredential(ctx.sql, { tenantId: T, employeeId: e.id, pin: '4821' });
  const results = await Promise.all(Array.from({ length: 4 }, () => verify(e, '0000')));
  assert.ok(results.some((r) => r.outcome === 'LOCKED'));
  const [c] = await ctx.sql('SELECT locked_until FROM employee_credentials WHERE employee_id = $1', [e.id]);
  assert.ok(new Date(c.locked_until) > new Date());
});
