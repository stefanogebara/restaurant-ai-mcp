#!/usr/bin/env node
/**
 * Audit api/ for the fire-and-forget Lambda-shutdown race that bit us
 * 7 times this past week (RELATORIO PDF, registry insert, alerts cron,
 * booking emails, manager-AI fact extraction, voice-call memory
 * extraction, etc.).
 *
 * Pattern flagged:
 *   <expression statement>.catch(...)      // not preceded by `await`
 *   ...
 *   return res.<status|json|send>(...)     // within FOLLOW_LINES below
 *
 * If the un-awaited expression returns a Promise, Vercel terminates the
 * Lambda the moment the response is sent and the work silently dies.
 *
 * ── Allow-list ──────────────────────────────────────────────────────
 * Entries are anchored to CODE, not line numbers. An earlier version
 * keyed them as `path:line`; by Aug 2026 thirteen of sixteen entries had
 * rotted (api/services → api/_services was renamed, other files shifted)
 * and were silently suppressing arbitrary lines — a real fire-and-forget
 * landing on one of those line numbers would have been swallowed. Line
 * numbers move; the statement text is what we actually judged safe.
 *
 * An entry that matches nothing is reported as STALE and fails the run,
 * so rot surfaces on the next CI run instead of years later. Fix a stale
 * entry by re-anchoring `match` to the moved code, or by deleting it if
 * the code is gone.
 *
 * Add an entry only after confirming nothing user-visible depends on the
 * result, and write the real reason — "it's fine" is not a reason.
 *
 * Exit code 1 if violations or stale allow-list entries are found.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'api');
const FOLLOW_LINES = 30;

// Each entry suppresses any flagged line in `file` whose text contains
// `match`. Keep `match` distinctive enough to name one call site.
const ALLOWLIST = [
  {
    file: 'cron/warm-seo-cache.js',
    match: 'reservasHandler(fakeReq, fakeRes).catch(',
    reason:
      'warmOne resolves its own Promise through the fake-response callbacks; ' +
      'the .catch is the throw path (resolve("error")). That Promise IS awaited ' +
      'via Promise.all in the batch loop just below.',
  },
  {
    file: 'prospect-admin.js',
    match: 'listMetaTemplates().catch(',
    reason:
      'Per-promise error handling inside an awaited Promise.all — the await sits ' +
      'two lines above, out of reach of the one-line lookbehind below.',
  },
  {
    file: 'waha-webhook.js',
    match: "logWahaEvent('sig_invalid').catch(",
    reason:
      'Telemetry for a rejected webhook signature. Nothing downstream reads it and ' +
      'the request is already being refused; losing the row costs a log line.',
  },
];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

const RES_RETURN = /return\s+res\.(status|json|send|end|redirect)/;
// match `<something>(...).catch(` where it's the start of a statement (no `await` directly before)
const CATCH_AT_LINE_START = /^\s*[\w$.[\]]+\([\s\S]*?\)\.catch\(/;

const violations = [];
// An entry stays valid while its call site still exists, flagged or not, so
// unrelated edits nearby don't churn the list. It goes stale only when the
// code it names actually changes or disappears.
const matched = new Set();

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const entries = ALLOWLIST.filter((e) => e.file === rel);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // skip if this line OR the line above contains await
    if (/\bawait\b/.test(line)) continue;
    if (i > 0 && /\bawait\b/.test(lines[i - 1])) continue;
    if (!CATCH_AT_LINE_START.test(line)) continue;

    const allowed = entries.find((e) => line.includes(e.match));
    if (allowed) matched.add(allowed);

    // Look forward for `return res.*` within FOLLOW_LINES
    let returnLine = null;
    for (let j = i + 1; j < Math.min(i + FOLLOW_LINES, lines.length); j++) {
      if (RES_RETURN.test(lines[j])) { returnLine = j + 1; break; }
    }
    if (returnLine == null) continue;
    if (allowed) continue;

    violations.push({ file: rel, line: i + 1, returnLine, snippet: line.trim().slice(0, 120) });
  }
}

const stale = ALLOWLIST.filter((e) => !matched.has(e));

if (violations.length === 0 && stale.length === 0) {
  console.log('✓ no fire-and-forget violations in api/');
  process.exit(0);
}

if (violations.length > 0) {
  console.log(`✗ ${violations.length} fire-and-forget violation(s) found:\n`);
  for (const v of violations) {
    console.log(`  api/${v.file}:${v.line}  →  return res.* at line ${v.returnLine}`);
    console.log(`    ${v.snippet}`);
  }
  console.log('\nFix: await the call (wrap in Promise.race+timeout if it can hang)');
  console.log('Or: add an { file, match, reason } entry to ALLOWLIST in this script.');
}

if (stale.length > 0) {
  console.log(`\n✗ ${stale.length} stale allow-list entry(ies) — they no longer match any code:\n`);
  for (const e of stale) {
    console.log(`  api/${e.file}  match: ${e.match}`);
  }
  console.log('\nA stale entry suppresses nothing today, but it means the code it once');
  console.log('described has moved or gone. Re-anchor `match` to the new text, or');
  console.log('delete the entry if the call site is gone.');
}

process.exit(1);
