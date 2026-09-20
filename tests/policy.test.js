// Política de marcación por empresa: validación (reglas del texto), versionado inmutable y restricciones en la base.
process.env.TIMESTAMP_SECRET = 'test-timestamp-secret';
delete process.env.ENABLE_ENFORCED_MARKING;

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestDb, useDb, MIGRATIONS_DIR } = require('./pgHelper');
const { applyMigrations } = require('../api/lib/migrations');
const policy = require('../api/lib/policy');

let ctx;
const T1 = randomUUID();
const T2 = randomUUID();

test('preparación', async () => {
  ctx = await createTestDb();
  useDb(ctx.sql);
  const applied = await applyMigrations(ctx.db, MIGRATIONS_DIR);
  assert.deepEqual(applied.applied, ['001_attendance_v2.sql', '002_policy_and_credentials.sql']);
});

test('sin política guardada: se aplica la política por defecto (flujo legado, versión 0)', async () => {
  const p = await policy.getActivePolicy(ctx.sql, T1);
  assert.equal(p.version, 0);
  assert.equal(p.source, 'DEFAULT');
  assert.equal(p.legacy_marking, true);
  assert.equal(await policy.policyVersionFor(ctx.sql, T1), 0);
});

test('la política por defecto es válida y solo genera advertencias informativas', () => {
  const { errors, warnings } = policy.validatePolicy(policy.defaultPolicy());
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings.map((w) => w.code).sort(), ['LEGACY_MARKING_ACTIVE', 'OFFLINE_WITHOUT_JUSTIFICATION']);
  assert.ok(warnings.every((w) => w.requires_ack === false));
});

test('Art. 7 g): "solo facial" exige confirmación explícita; facial + PIN no', async () => {
  const facialOnly = policy.mergePolicy(policy.defaultPolicy(), {}, 'FACIAL_ONLY');
  const w = policy.validatePolicy(facialOnly).warnings.find((x) => x.code === 'ART_7G_TWO_ALTERNATIVES');
  assert.ok(w && w.requires_ack);
  assert.equal(w.article, 'Art. 7 g)');

  const ok = policy.mergePolicy(policy.defaultPolicy(), {}, 'FACIAL_PIN');
  assert.equal(policy.validatePolicy(ok).warnings.some((x) => x.code === 'ART_7G_TWO_ALTERNATIVES'), false);

  // Dos métodos pero ninguno no biométrico tampoco cumple (hoy el único no biométrico es el PIN)
  assert.deepEqual(policy.art7gViolations({ ...ok, primary_methods: ['FACIAL'], fallback_methods: ['FACIAL'] }), ['TODOS']);
});

test('Art. 7 g) también se evalúa por canal (override del tótem o del móvil)', () => {
  const p = policy.mergePolicy(policy.defaultPolicy(), { channel_overrides: { TOTEM: { primary_methods: ['FACIAL'], fallback_methods: [] } } });
  assert.deepEqual(policy.art7gViolations(p), ['TOTEM']);
  assert.deepEqual(policy.effectiveMethods(p, 'MOBILE'), { primary: ['FACIAL'], fallback: ['PIN'] });
  assert.equal(policy.allowsMethod(p, 'PIN', 'TOTEM'), false);
  assert.equal(policy.allowsMethod(p, 'PIN', 'MOBILE'), true);
});

test('reglas del texto como errores: retención, destrucción, geolocalización y evento', () => {
  const base = policy.defaultPolicy();
  const cases = [
    [{ marks_retention_years: 3 }, 'marks_retention_years', /Art\. 53 f\)/],
    [{ template_destroy_after_termination_days: 60 }, 'template_destroy_after_termination_days', /Art\. 57\.4/],
    [{ template_destroy_after_termination_days: 200 }, 'template_destroy_after_termination_days', /Art\. 57\.4/],
    [{ geo_mode: 'BLOCK' }, 'geo_mode', /Art\. 53 c\)/],
    [{ event_selection: 'AUTO_FROM_LAST' }, 'event_selection', /Art\. 35-36/],
    [{ primary_methods: ['FACE_ID'] }, 'primary_methods', null],
    [{ facial_threshold: 0.95 }, 'facial_threshold', null],
    [{ pin_max_attempts: 1 }, 'pin_max_attempts', null],
    [{ evidence_photo: 'SIEMPRE' }, 'evidence_photo', null],
    [{ offline_policy: { allowed: 'si', max_age_hours: 10 } }, 'offline_policy', null],
  ];
  for (const [change, field, article] of cases) {
    const { errors } = policy.validatePolicy({ ...base, ...change });
    const e = errors.find((x) => x.field === field);
    assert.ok(e, `debió rechazar ${JSON.stringify(change)}`);
    if (article) assert.match(e.article, article);
  }
});

test('offline sin justificación advierte (Art. 10) y con justificación no', () => {
  const p = policy.defaultPolicy();
  assert.ok(policy.validatePolicy(p).warnings.some((w) => w.code === 'OFFLINE_WITHOUT_JUSTIFICATION'));
  const j = policy.mergePolicy(p, { offline_policy: { justification: 'Fundo sin cobertura móvil' } });
  assert.equal(j.offline_policy.max_age_hours, 168); // se fusiona campo a campo
  assert.equal(policy.validatePolicy(j).warnings.some((w) => w.code === 'OFFLINE_WITHOUT_JUSTIFICATION'), false);
});

test('guardar sin la confirmación requerida es rechazado y no crea versión', async () => {
  await assert.rejects(
    () => policy.savePolicy(ctx.sql, T1, { preset: 'FACIAL_ONLY', actor: 'admin@acme.cl' }),
    (e) => e.code === 'ACK_REQUIRED' && e.status === 409 && e.details.warnings[0].code === 'ART_7G_TWO_ALTERNATIVES'
  );
  assert.equal((await ctx.sql('SELECT COUNT(*)::int AS n FROM tenant_attendance_policy WHERE tenant_id = $1', [T1]))[0].n, 0);
});

test('versionado: cada cambio crea una versión nueva y guarda quién, por qué y qué se confirmó', async () => {
  const v1 = await policy.savePolicy(ctx.sql, T1, { preset: 'FACIAL_ONLY', acknowledge: ['ART_7G_TWO_ALTERNATIVES'], reason: 'Piloto', actor: 'admin@acme.cl' });
  assert.equal(v1.policy.version, 1);
  assert.deepEqual(v1.policy.acknowledged_warnings, ['ART_7G_TWO_ALTERNATIVES']);
  assert.equal(v1.policy.created_by, 'admin@acme.cl');
  assert.equal(v1.policy.change_reason, 'Piloto');
  assert.deepEqual(v1.policy.fallback_methods, []);

  const v2 = await policy.savePolicy(ctx.sql, T1, { preset: 'FACIAL_PIN', reason: 'Se agrega PIN', actor: 'admin@acme.cl' });
  assert.equal(v2.policy.version, 2);
  assert.deepEqual(v2.policy.fallback_methods, ['PIN']);

  const active = await policy.getActivePolicy(ctx.sql, T1, { useCache: false });
  assert.equal(active.version, 2);
  assert.equal(await policy.policyVersionFor(ctx.sql, T1), 2);

  // La versión 1 no cambió
  const [old] = await ctx.sql('SELECT fallback_methods FROM tenant_attendance_policy WHERE tenant_id = $1 AND version = 1', [T1]);
  assert.deepEqual(old.fallback_methods, []);
});

test('las versiones son inmutables en la base (UPDATE y DELETE bloqueados)', async () => {
  await assert.rejects(() => ctx.sql("UPDATE tenant_attendance_policy SET geo_mode = 'OFF' WHERE tenant_id = $1", [T1]), /inmutables/);
  await assert.rejects(() => ctx.sql('DELETE FROM tenant_attendance_policy WHERE tenant_id = $1', [T1]), /inmutables/);
});

test('la base rechaza valores que el texto prohíbe, aunque se salte la validación', async () => {
  const insert = (col, val) => ctx.sql(`INSERT INTO tenant_attendance_policy (tenant_id, version, ${col}) VALUES ($1, 99, $2)`, [T2, val]);
  for (const [col, val] of [['marks_retention_years', 3], ['template_destroy_after_termination_days', 60], ['geo_mode', 'BLOCK'], ['event_selection', 'AUTO']]) {
    await assert.rejects(() => insert(col, val), (e) => e.code === '23514', `${col}=${val} debió violar un CHECK`);
  }
});

test('desactivar el flujo legado exige que el nuevo flujo esté habilitado (evita cortar el marcaje)', async () => {
  await assert.rejects(
    () => policy.savePolicy(ctx.sql, T2, { changes: { legacy_marking: false }, actor: 'a' }),
    (e) => e.code === 'ENFORCEMENT_NOT_AVAILABLE' && e.status === 409
  );
  process.env.ENABLE_ENFORCED_MARKING = 'true';
  const saved = await policy.savePolicy(ctx.sql, T2, { preset: 'FACIAL_PIN', changes: { legacy_marking: false }, actor: 'a' });
  assert.equal(saved.policy.legacy_marking, false);
  delete process.env.ENABLE_ENFORCED_MARKING;
});

test('empresa C: política sin configurar no exige método ni confirmaciones', async () => {
  const T3 = randomUUID();
  const saved = await policy.savePolicy(ctx.sql, T3, { preset: 'UNCONFIGURED', actor: 'a' });
  assert.equal(saved.policy.status, 'UNCONFIGURED');
  assert.deepEqual(saved.policy.primary_methods, []);
  assert.equal(saved.warnings.some((w) => w.requires_ack), false);
});

test('errores de validación no crean versión (422 con el detalle por campo)', async () => {
  const before = (await ctx.sql('SELECT COUNT(*)::int AS n FROM tenant_attendance_policy WHERE tenant_id = $1', [T2]))[0].n;
  await assert.rejects(
    () => policy.savePolicy(ctx.sql, T2, { changes: { geo_mode: 'BLOCK', marks_retention_years: 1 }, actor: 'a' }),
    (e) => e.status === 422 && e.code === 'VALIDATION_FAILED' && e.details.errors.length === 2
  );
  assert.equal((await ctx.sql('SELECT COUNT(*)::int AS n FROM tenant_attendance_policy WHERE tenant_id = $1', [T2]))[0].n, before);
});

test('guardados simultáneos: versiones únicas y consecutivas', async () => {
  const T4 = randomUUID();
  const results = await Promise.all([1, 2, 3, 4].map((i) => policy.savePolicy(ctx.sql, T4, { changes: { pin_max_attempts: 3 + i }, actor: 'a' })));
  const versions = results.map((r) => r.policy.version).sort((a, b) => a - b);
  assert.deepEqual(versions, [1, 2, 3, 4]);
});
