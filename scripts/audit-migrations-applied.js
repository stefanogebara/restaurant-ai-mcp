#!/usr/bin/env node
/**
 * Migration drift detector.
 *
 * Parses every supabase/migrations/*.sql file for CREATE TABLE statements,
 * then probes each table via the Supabase REST endpoint. If any table comes
 * back with the schema-cache "Could not find the table" error, the migration
 * was never applied to the live DB.
 *
 * Caught the whatsapp_test_messages drift on 2026-04-26: file existed in
 * repo, table missing in prod, cooldown protection silently disabled, real
 * WA messages dispatched without rate limiting.
 *
 * Since 2026-11-14 it also compares every SQL function declared in the
 * migrations with production (see auditFunctions below).
 *
 * Exit code 1 if drift found.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(2);
}

// Tables intentionally not in prod (legacy/superseded). Add 'schema.table'
// keys with a one-line reason. Keep tight.
const SKIP_TABLES = new Set([]);

function* findCreateTables(sql) {
  // Migration files can include commented rollback examples. Those are not
  // deployed tables and must not become false-positive drift failures.
  const executableSql = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*--[^\n]*/gm, '');
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:([a-zA-Z_][a-zA-Z0-9_]*)\.)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;
  let m;
  while ((m = re.exec(executableSql)) !== null) {
    yield {
      schema: (m[1] || 'public').toLowerCase(),
      table: m[2].toLowerCase(),
    };
  }
}

function collectExpected() {
  const map = new Map();
  for (const f of fs.readdirSync(MIGRATIONS_DIR).sort()) {
    if (!f.endsWith('.sql')) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    for (const { schema, table } of findCreateTables(sql)) {
      const key = `${schema}.${table}`;
      if (!map.has(key)) map.set(key, f);
    }
  }
  return map;
}

async function probeTable(schema, table) {
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const q = schema === 'public' ? client.from(table) : client.schema(schema).from(table);
  const { error } = await q.select('*').limit(1);
  if (!error) return { ok: true };
  const msg = error.message || '';
  const missing = /Could not find the table|relation .* does not exist/i.test(msg);
  return { ok: !missing, error: msg };
}

(async () => {
  const expected = collectExpected();
  console.log(`Scanning ${expected.size} CREATE TABLE declarations across supabase/migrations/...`);

  const missing = [];
  for (const [key, migration] of expected) {
    if (SKIP_TABLES.has(key)) continue;
    const [schema, table] = key.split('.');
    const result = await probeTable(schema, table);
    if (!result.ok) {
      missing.push({ key, migration, error: result.error });
      console.log(`  \u2717 ${key.padEnd(50)} from ${migration}`);
    }
  }

  if (missing.length === 0) {
    console.log(`\n\u2713 All ${expected.size} tables present in prod DB.`);
  } else {
    console.log(`\n\u2717 ${missing.length} table(s) declared in migrations but missing in prod:\n`);
    for (const m of missing) {
      console.log(`  ${m.key}  \u2192  ${m.migration}`);
      console.log(`    ${(m.error || '').slice(0, 200)}`);
    }
    console.log(`\nFix: apply the missing migration(s) in Supabase SQL editor or via 'supabase db push'.`);
  }

  const functionsOk = await auditFunctions();
  process.exit(missing.length === 0 && functionsOk ? 0 : 1);
})();

/**
 * Functions: the latest body of every function in the migrations must be the
 * one in production (comments and whitespace ignored). Since 2026-11-14; the
 * table probe above never saw a function that was merged but not applied.
 * Known, reviewed differences are frozen in migration-functions.divida.json
 * with both fingerprints, so any further change on either side fails again.
 */
async function auditFunctions() {
  const { extractFunctions, readMigrations, compareFunctions } = require('./lib/migration-functions');
  const known = JSON.parse(fs.readFileSync(path.join(__dirname, 'migration-functions.divida.json'), 'utf8'));
  const expected = extractFunctions(readMigrations(MIGRATIONS_DIR));
  const keys = [...expected].filter(([, def]) => !def.dropped).map(([key]) => key);
  console.log(`\nScanning ${keys.length} functions declared across supabase/migrations/...`);

  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await client.rpc('audit_function_sources', { p_keys: keys });
  if (error) {
    console.log(`\u2717 Could not read function sources: ${error.message}`);
    console.log('  Fix: apply supabase/migrations/20261114120000_audit_function_sources.sql in production.');
    return false;
  }

  const result = compareFunctions(expected, data || [], known);
  for (const m of result.missing) console.log(`  \u2717 missing  ${m.key.padEnd(50)} from ${m.file}`);
  for (const d of result.differs) console.log(`  \u2717 differs  ${d.key.padEnd(50)} from ${d.file}`);
  for (const key of result.staleKnown) console.log(`  \u2717 stale    ${key.padEnd(50)} frozen in migration-functions.divida.json but no longer this difference`);

  const failures = result.missing.length + result.differs.length + result.staleKnown.length;
  if (failures === 0) {
    console.log(`\u2713 ${result.ok.length} functions match production (${result.known.length} known difference(s) frozen).`);
    return true;
  }
  console.log(`\n\u2717 ${failures} function problem(s). A "missing" or "differs" function usually means a migration`);
  console.log('  was merged but not applied: apply it. If production is right instead, write a migration that');
  console.log('  matches it. Remove a "stale" entry from migration-functions.divida.json.');
  return false;
}
