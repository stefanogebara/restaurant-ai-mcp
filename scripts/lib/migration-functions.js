'use strict';

/**
 * SQL functions declared in supabase/migrations vs. the ones in production.
 *
 * Why: the migration check only proved that tables exist. A migration that
 * replaces a function was invisible to it: on 2026-11-11 the keypad
 * confirmation function was merged but not applied (found only because the
 * live smoke test failed), and the booking functions of PR #333 and #335 had
 * to be compared by hand (md5 of pg_get_functiondef). This module takes the
 * latest definition of every function in the migrations and compares its body
 * with the body stored in production (pg_proc.prosrc).
 *
 * Comparison ignores comments and whitespace: production keeps the text that
 * was sent to it, and copies applied by hand often drop comments or change
 * line endings (both happened). Any other change counts.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Replace comments with spaces of the same length, so offsets stay valid.
// Single-quoted strings are skipped, so '--' inside a string is kept.
function maskComments(sql) {
  let out = '';
  let i = 0;
  let quoted = false;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (quoted) {
      out += c;
      if (c === "'") {
        if (next === "'") { out += next; i += 2; continue; }
        quoted = false;
      }
      i += 1;
      continue;
    }
    if (c === "'") { quoted = true; out += c; i += 1; continue; }
    if (c === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end < 0 ? sql.length : end + 2;
      out += sql.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Function body without comments, whitespace collapsed. */
function normalizeSource(source) {
  return maskComments(String(source ?? '')).replace(/\s+/g, ' ').trim();
}

function fingerprint(source) {
  return crypto.createHash('md5').update(normalizeSource(source)).digest('hex');
}

const HEADER = /\b(CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION|DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?)\s*((?:"?[A-Za-z_]\w*"?\s*\.\s*)?"?[A-Za-z_]\w*"?)/gi;

/**
 * Latest definition of every function, in file order (file names sort by date).
 * @param {{ file: string, sql: string }[]} files
 * @returns {Map<string, { file: string, source: string|null, dropped?: boolean }>}
 */
function extractFunctions(files) {
  const latest = new Map();
  for (const { file, sql } of [...files].sort((a, b) => a.file.localeCompare(b.file))) {
    const masked = maskComments(sql);
    HEADER.lastIndex = 0;
    let match;
    while ((match = HEADER.exec(masked))) {
      const raw = match[2].replace(/["\s]/g, '').toLowerCase();
      const key = raw.includes('.') ? raw : `public.${raw}`;
      if (/^DROP/i.test(match[1])) { latest.set(key, { file, source: null, dropped: true }); continue; }
      const rest = masked.slice(match.index);
      const tag = rest.match(/\bAS\s+(\$[A-Za-z_]*\$)/i);
      if (!tag) { latest.set(key, { file, source: null }); continue; }
      const start = match.index + tag.index + tag[0].length;
      const end = sql.indexOf(tag[1], start);
      latest.set(key, { file, source: end < 0 ? null : sql.slice(start, end) });
    }
  }
  return latest;
}

function readMigrations(dir) {
  return fs.readdirSync(dir).filter(file => file.endsWith('.sql'))
    .map(file => ({ file, sql: fs.readFileSync(path.join(dir, file), 'utf8') }));
}

/**
 * @param {Map} expected from extractFunctions
 * @param {{ key: string, source: string }[]} production rows (one per overload)
 * @param {Record<string, { repo: string, producao: string, motivo: string }>} known frozen differences
 * @returns {{ ok: string[], known: string[], missing: object[], differs: object[], staleKnown: string[] }}
 */
function compareFunctions(expected, production, known = {}) {
  const byKey = new Map();
  for (const row of production) {
    if (!byKey.has(row.key)) byKey.set(row.key, []);
    byKey.get(row.key).push(fingerprint(row.source));
  }
  const result = { ok: [], known: [], missing: [], differs: [], staleKnown: [] };
  for (const [key, def] of expected) {
    if (def.dropped) continue;
    const prints = byKey.get(key) || [];
    if (!prints.length) { result.missing.push({ key, file: def.file }); continue; }
    const repo = def.source == null ? null : fingerprint(def.source);
    if (repo && prints.includes(repo)) { result.ok.push(key); continue; }
    const frozen = known[key];
    if (frozen && frozen.repo === repo && prints.includes(frozen.producao)) { result.known.push(key); continue; }
    result.differs.push({ key, file: def.file, repo, production: prints });
  }
  // A frozen entry whose function now matches (or is gone) should be removed.
  for (const key of Object.keys(known)) {
    if (!result.known.includes(key)) result.staleKnown.push(key);
  }
  return result;
}

module.exports = { maskComments, normalizeSource, fingerprint, extractFunctions, readMigrations, compareFunctions };
