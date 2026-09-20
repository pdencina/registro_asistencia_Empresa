// Migración 001 + cadena de integridad v2 contra un PostgreSQL real (PGlite).
process.env.TIMESTAMP_SECRET = 'test-timestamp-secret';
delete process.env.FORCE_LEGACY_INTEGRITY;

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createTestDb, useDb, MIGRATIONS_DIR } = require('./pgHelper');
const { planMigrations, applyMigrations, loadMigrations } = require('../api/lib/migrations');

let ctx;
let integrity;
const T1 = randomUUID(); // empresa con historial v1 + v2
const T2 = randomUUID(); // empresa nueva (solo v2)
const T3 = randomUUID(); // concurrencia
const EMP = { [T1]: randomUUID(), [T2]: randomUUID(), [T3]: randomUUID() };

const base = (tenant, type, extra = {}) => ({
  id: randomUUID(), tenant_id: tenant, employee_id: EMP[tenant], type,
  timestamp: new Date().toISOString(), method: 'pin', notes: null, ...extra,
});

test('preparación: base de datos y empresas', async () => {
  ctx = await createTestDb();
  useDb(ctx.sql);
  for (const [i, t] of [T1, T2, T3].entries()) {
    await ctx.sql('INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)', [t, `Empresa ${i}`, `emp-${i}`]);
  }
  integrity = require('../api/lib/integrity');
  integrity._resetV2Cache();
});

let legacyHashes;

test('antes de la migración se sigue usando el formato v1 (despliegue sin downtime)', async () => {
  const hoursAgo = [5, 4, 3];
  for (const [i, type] of ['entry', 'exit', 'entry'].entries()) {
    await integrity.insertAttendanceRecord(base(T1, type, { timestamp: new Date(Date.now() - hoursAgo[i] * 3600e3).toISOString() }));
  }
  const rows = await ctx.sql('SELECT record_hash, previous_hash FROM attendance_records WHERE tenant_id = $1 ORDER BY created_at', [T1]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].previous_hash, 'GENESIS');
  const res = await integrity.verifyChainIntegrity(T1);
  assert.equal(res.integrity_ok, true);
  assert.equal(res.legacy_records, 3);
  assert.equal(res.v2_records, 0);
  legacyHashes = await ctx.sql('SELECT id, record_hash, previous_hash, timestamp_seal FROM attendance_records WHERE tenant_id = $1 ORDER BY id', [T1]);
});

test('migración 001: dry-run, aplicación, idempotencia y tipos', async () => {
  const plan = await planMigrations(ctx.db, MIGRATIONS_DIR);
  assert.equal(plan.pending.length, loadMigrations(MIGRATIONS_DIR).length);

  const applied = await applyMigrations(ctx.db, MIGRATIONS_DIR);
  assert.deepEqual(applied.applied, ['001_attendance_v2.sql']);

  const again = await applyMigrations(ctx.db, MIGRATIONS_DIR);
  assert.deepEqual(again.applied, []);

  const types = await ctx.sql(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'attendance_records' AND column_name IN ('server_timestamp', 'created_at', 'seq', 'hash_version')`
  );
  const byName = Object.fromEntries(types.map((r) => [r.column_name, r.data_type]));
  assert.equal(byName.server_timestamp, 'timestamp with time zone');
  assert.equal(byName.created_at, 'timestamp with time zone');
  assert.equal(byName.seq, 'bigint');
});

test('migración 001 no altera ningún registro histórico', async () => {
  const after = await ctx.sql('SELECT id, record_hash, previous_hash, timestamp_seal, seq, hash_version FROM attendance_records WHERE tenant_id = $1 ORDER BY id', [T1]);
  assert.equal(after.length, legacyHashes.length);
  after.forEach((r, i) => {
    assert.equal(r.record_hash, legacyHashes[i].record_hash);
    assert.equal(r.previous_hash, legacyHashes[i].previous_hash);
    assert.equal(r.timestamp_seal, legacyHashes[i].timestamp_seal);
    assert.equal(r.seq, null);
    assert.equal(Number(r.hash_version), 1);
  });
  const res = await integrity.verifyChainIntegrity(T1);
  assert.equal(res.integrity_ok, true, JSON.stringify(res.corrupted_records));
});

test('una migración ya aplicada no puede editarse', async () => {
  await ctx.sql("UPDATE schema_migrations SET checksum = 'deadbeef' WHERE name = '001_attendance_v2.sql'");
  await assert.rejects(() => applyMigrations(ctx.db, MIGRATIONS_DIR), /modificadas después de aplicarse/);
  const real = loadMigrations(MIGRATIONS_DIR)[0].checksum;
  await ctx.sql('UPDATE schema_migrations SET checksum = $1 WHERE name = $2', [real, '001_attendance_v2.sql']);
});

test('la migración se niega a convertir columnas si la sesión no está en UTC', async () => {
  const other = await createTestDb({ timezone: 'America/Santiago' });
  // Estado previo: columnas TIMESTAMP naive como las dejó ensureIntegrityColumns
  await other.pg.exec('ALTER TABLE attendance_records ADD COLUMN created_at TIMESTAMP DEFAULT NOW()');
  await assert.rejects(() => applyMigrations(other.db, MIGRATIONS_DIR), /TimeZone de la sesión/);
});

test('v2: seq consecutivo, primer registro enlaza con el último histórico y la cadena verifica', async () => {
  integrity._resetV2Cache();
  const lastLegacy = (await ctx.sql(
    'SELECT record_hash FROM attendance_records WHERE tenant_id = $1 ORDER BY timestamp DESC, created_at DESC LIMIT 1', [T1]
  ))[0].record_hash;

  const out = [];
  for (const type of ['exit', 'entry', 'exit']) {
    out.push(await integrity.insertAttendanceRecord(base(T1, type, {
      auth_method: 'PIN', auth_result: 'SUCCESS', channel: 'TOTEM', device_id: 'totem-1',
      latitude: -33.4489, longitude: -70.6693, geo_status: 'INSIDE', geo_distance_m: 12, geo_accuracy_m: 8.5,
      server_received_at: new Date().toISOString(),
    })));
  }
  assert.deepEqual(out.map((o) => o.seq), [1, 2, 3]);
  assert.ok(out.every((o) => o.hash_version === 2));

  const v2 = await ctx.sql('SELECT seq, previous_hash, record_hash FROM attendance_records WHERE tenant_id = $1 AND hash_version = 2 ORDER BY seq', [T1]);
  assert.equal(v2[0].previous_hash, lastLegacy);
  assert.equal(v2[1].previous_hash, v2[0].record_hash);
  assert.equal(v2[2].previous_hash, v2[1].record_hash);

  const res = await integrity.verifyChainIntegrity(T1);
  assert.equal(res.integrity_ok, true, JSON.stringify(res.corrupted_records));
  assert.equal(res.legacy_records, 3);
  assert.equal(res.v2_records, 3);
  assert.equal(res.total_verified, 6);
});

test('el hash calculado en SQL coincide con el recalculado en JS (evidencia completa)', async () => {
  const [r] = await ctx.sql('SELECT * FROM attendance_records WHERE tenant_id = $1 AND seq = 2', [T1]);
  const expected = integrity.computeRecordHashV2(integrity.canonicalPrefixV2(r), r.seq, r.previous_hash);
  assert.equal(r.record_hash, expected);
  assert.equal(r.auth_method, 'PIN');
  assert.equal(r.device_id, 'totem-1');
  assert.equal(r.geo_status, 'INSIDE');
  assert.equal(r.channel, 'TOTEM');
});

test('detecta alteración de cualquier campo de evidencia', async () => {
  const tampers = [
    ['latitude', '-33.0'],
    ['auth_method', "'FACIAL'"],
    ['device_id', "'otro'"],
    ['geo_status', "'OUTSIDE'"],
    ['evidence_sha256', "'" + 'a'.repeat(64) + "'"],
    ['channel', "'MOBILE'"],
  ];
  for (const [col, value] of tampers) {
    const [orig] = await ctx.sql(`SELECT ${col} AS v FROM attendance_records WHERE tenant_id = $1 AND seq = 2`, [T1]);
    await ctx.sql(`UPDATE attendance_records SET ${col} = ${value} WHERE tenant_id = $1 AND seq = 2`, [T1]);
    const res = await integrity.verifyChainIntegrity(T1);
    assert.equal(res.integrity_ok, false, `no detectó alteración de ${col}`);
    assert.ok(res.corrupted_records.some((c) => c.seq === '2'), `no señaló seq 2 para ${col}`);
    await ctx.sql(`UPDATE attendance_records SET ${col} = $2 WHERE tenant_id = $1 AND seq = 2`, [T1, orig.v]);
  }
  assert.equal((await integrity.verifyChainIntegrity(T1)).integrity_ok, true);
});

test('detecta sello de tiempo alterado y reordenamiento de hash', async () => {
  const [orig] = await ctx.sql('SELECT timestamp_seal FROM attendance_records WHERE tenant_id = $1 AND seq = 3', [T1]);
  await ctx.sql("UPDATE attendance_records SET timestamp_seal = $2 WHERE tenant_id = $1 AND seq = 3", [T1, 'f'.repeat(64)]);
  const res = await integrity.verifyChainIntegrity(T1);
  assert.equal(res.integrity_ok, false);
  assert.ok(res.corrupted_records.some((c) => /sello/.test(c.reason)));
  await ctx.sql('UPDATE attendance_records SET timestamp_seal = $2 WHERE tenant_id = $1 AND seq = 3', [T1, orig.timestamp_seal]);
  assert.equal((await integrity.verifyChainIntegrity(T1)).integrity_ok, true);
});

test('detecta un registro eliminado (salto de secuencia)', async () => {
  for (const type of ['entry', 'exit', 'entry']) await integrity.insertAttendanceRecord(base(T2, type));
  assert.equal((await integrity.verifyChainIntegrity(T2)).integrity_ok, true);

  await ctx.sql('DELETE FROM attendance_records WHERE tenant_id = $1 AND seq = 2', [T2]);
  const res = await integrity.verifyChainIntegrity(T2);
  assert.equal(res.integrity_ok, false);
  assert.ok(res.corrupted_records.some((c) => /salto en la secuencia/.test(c.reason)));
});

test('detecta un registro inicial eliminado (la cadena no empieza en 1)', async () => {
  await ctx.sql('DELETE FROM attendance_records WHERE tenant_id = $1 AND seq = 1', [T2]);
  const res = await integrity.verifyChainIntegrity(T2);
  assert.ok(res.corrupted_records.some((c) => /no comienza en seq 1/.test(c.reason)));
});

test('marcaciones simultáneas: secuencia sin huecos ni duplicados y cadena íntegra', async () => {
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => integrity.insertAttendanceRecord(base(T3, i % 2 ? 'exit' : 'entry')))
  );
  const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
  assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const res = await integrity.verifyChainIntegrity(T3);
  assert.equal(res.integrity_ok, true, JSON.stringify(res.corrupted_records));
  assert.equal(res.v2_records, 10);
});

test('la base rechaza un seq duplicado (guarda contra bifurcaciones)', async () => {
  await assert.rejects(
    () => ctx.sql(
      `INSERT INTO attendance_records (id, tenant_id, employee_id, type, seq, hash_version)
       VALUES ($1, $2, $3, 'entry', 1, 2)`, [randomUUID(), T3, EMP[T3]]),
    (e) => e.code === '23505'
  );
});

test('interruptor de emergencia FORCE_LEGACY_INTEGRITY y advertencia por v1 posterior a v2', async () => {
  process.env.FORCE_LEGACY_INTEGRITY = 'true';
  integrity._resetV2Cache();
  await integrity.insertAttendanceRecord(base(T1, 'entry'));
  delete process.env.FORCE_LEGACY_INTEGRITY;
  integrity._resetV2Cache();

  const [last] = await ctx.sql("SELECT hash_version FROM attendance_records WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1", [T1]);
  assert.equal(Number(last.hash_version), 1);

  const res = await integrity.verifyChainIntegrity(T1);
  assert.equal(res.integrity_ok, true, JSON.stringify(res.corrupted_records));
  assert.ok(res.warnings.some((w) => /formato v1 creados después/.test(w)), JSON.stringify(res.warnings));
});

test('el verificador informa el estado de la clave de sellado', async () => {
  const res = await integrity.verifyChainIntegrity(T3);
  assert.equal(res.seal_key.source, 'TIMESTAMP_SECRET');
  assert.equal(res.seal_key.weak, false);
  assert.match(res.seal_key.key_id, /^[0-9a-f]{8}$/);
});

test('los triggers de protección bloquean UPDATE y DELETE, incluidas las columnas nuevas', async () => {
  const out = await integrity.createProtectionRules();
  assert.equal(out.success, true, out.error);

  await assert.rejects(() => ctx.sql("UPDATE attendance_records SET auth_method = 'FACIAL' WHERE tenant_id = $1", [T3]), /No se permite modificar/);
  await assert.rejects(() => ctx.sql("UPDATE attendance_records SET geo_status = 'INSIDE' WHERE tenant_id = $1", [T3]), /No se permite modificar/);
  await assert.rejects(() => ctx.sql('UPDATE attendance_records SET timestamp = NOW() WHERE tenant_id = $1', [T3]), /No se permite modificar/);
  await assert.rejects(() => ctx.sql('DELETE FROM attendance_records WHERE tenant_id = $1', [T3]), /No se permite eliminar/);

  // Sigue permitido lo no crítico (p. ej. purgar la URL de la foto por retención) y anexar nuevos registros
  await ctx.sql("UPDATE attendance_records SET photo_snapshot_url = NULL WHERE tenant_id = $1", [T3]);
  const more = await integrity.insertAttendanceRecord(base(T3, 'entry'));
  assert.equal(more.seq, 11);
  assert.equal((await integrity.verifyChainIntegrity(T3)).integrity_ok, true);
});
