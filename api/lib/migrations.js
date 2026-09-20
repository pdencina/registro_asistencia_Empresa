const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

/**
 * Runner de migraciones versionadas.
 *
 * Los archivos viven en /migrations, se ordenan por nombre (001_..., 002_...) y se aplican una sola vez.
 * Cada archivo es una lista de sentencias separadas por una línea "-- @@" (los bloques DO $$ ... $$
 * contienen ";" y no se pueden separar por punto y coma).
 *
 * El acceso a la base se inyecta para poder usar Neon en producción y PGlite en los tests:
 *   db.query(sql, params) -> Promise<rows[]>
 *   db.batch(statements)  -> Promise<void>   ejecuta todas las sentencias de forma atómica
 */

const SEPARATOR = /^\s*--\s*@@\s*$/m;

function splitStatements(sqlText) {
  return sqlText
    .split(SEPARATOR)
    .map((s) => s.trim())
    .filter((s) => s.replace(/--.*$/gm, '').trim().length > 0);
}

function loadMigrations(dir) {
  return fs.readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((name) => {
      const text = fs.readFileSync(path.join(dir, name), 'utf8').replace(/\r\n/g, '\n');
      return {
        name,
        checksum: createHash('sha256').update(text, 'utf8').digest('hex'),
        statements: splitStatements(text),
      };
    });
}

async function ensureMigrationsTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/** Compara los archivos con lo aplicado. `changed` = archivo modificado después de aplicarse. */
async function planMigrations(db, dir) {
  await ensureMigrationsTable(db);
  const files = loadMigrations(dir);
  const applied = await db.query('SELECT name, checksum FROM schema_migrations ORDER BY name');
  const appliedByName = new Map(applied.map((r) => [r.name, r.checksum]));

  const pending = [];
  const changed = [];
  for (const m of files) {
    if (!appliedByName.has(m.name)) pending.push(m);
    else if (appliedByName.get(m.name) !== m.checksum) changed.push(m.name);
  }
  return { files, pending, changed, appliedCount: applied.length };
}

async function applyMigrations(db, dir, { log = () => {} } = {}) {
  const plan = await planMigrations(db, dir);
  if (plan.changed.length > 0) {
    throw new Error(`Migraciones modificadas después de aplicarse: ${plan.changed.join(', ')}. Crea una migración nueva en vez de editarlas.`);
  }
  for (const m of plan.pending) {
    log(`Aplicando ${m.name} (${m.statements.length} sentencias)`);
    await db.batch([
      ...m.statements.map((text) => ({ text, params: [] })),
      { text: 'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', params: [m.name, m.checksum] },
    ]);
  }
  return { applied: plan.pending.map((m) => m.name) };
}

/** Adaptador para @neondatabase/serverless (transacción HTTP atómica). */
function neonAdapter(sql) {
  return {
    query: (text, params = []) => sql(text, params),
    batch: async (statements) => {
      if (typeof sql.transaction === 'function') {
        await sql.transaction((txn) => statements.map((s) => txn(s.text, s.params)));
      } else {
        for (const s of statements) await sql(s.text, s.params);
      }
    },
  };
}

module.exports = { splitStatements, loadMigrations, planMigrations, applyMigrations, neonAdapter };
