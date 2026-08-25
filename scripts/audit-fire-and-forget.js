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
 * Allow-list: known intentional fire-and-forgets that DON'T race a
 * caller (cleanup, telemetry, cosmetic UX). Add a code path here only
 * after confirming nothing user-visible depends on the result.
 *
 * Exit code 1 if violations found — wire into CI.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'api');
const FOLLOW_LINES = 30;

// (relativePath, lineNumber) → reason
const ALLOWLIST = new Set([
  // Inside an awaited Promise.all — the .catch is per-promise error handling,
  // not fire-and-forget.
  'services/customerDNA.js:291', 'services/customerDNA.js:295',
  'services/customerDNA.js:299', 'services/customerDNA.js:303',
  '_lib/channels/message-processor.js:66', '_lib/channels/message-processor.js:70',
  'services/wikiCompiler.js:197',
  'prospect-admin.js:413',
  // Cleanup; lock TTL covers any miss, no caller waits on it.
  '_lib/channels/message-processor.js:296',
  '_lib/channels/message-processor.js:372',
  // Cosmetic WhatsApp emoji reactions.
  '_lib/channels/meta-adapter.js:87',
  '_lib/channels/meta-adapter.js:89',
  '_lib/channels/meta-adapter.js:97',
  // warmOne resolves its Promise via fake-response callbacks (lines 64, 66);
  // .catch is the throw path (resolve('error')). The Promise IS awaited via
  // Promise.all at line 79. Not fire-and-forget.
  'cron/warm-seo-cache.js:68',
  // Telemetry-only logging; no user impact if it drops.
  'waha-webhook.js:44',
  'waha-webhook.js:53',
]);

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

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // skip if this line OR the line above contains await
    if (/\bawait\b/.test(line)) continue;
    if (i > 0 && /\bawait\b/.test(lines[i - 1])) continue;
    if (!CATCH_AT_LINE_START.test(line)) continue;

    // Look forward for `return res.*` within FOLLOW_LINES
    let returnLine = null;
    for (let j = i + 1; j < Math.min(i + FOLLOW_LINES, lines.length); j++) {
      if (RES_RETURN.test(lines[j])) { returnLine = j + 1; break; }
    }
    if (returnLine == null) continue;

    const lineNum = i + 1;
    const key = `${rel}:${lineNum}`;
    if (ALLOWLIST.has(key)) continue;

    violations.push({ file: rel, line: lineNum, returnLine, snippet: line.trim().slice(0, 120) });
  }
}

if (violations.length === 0) {
  console.log('✓ no fire-and-forget violations in api/');
  process.exit(0);
}

console.log(`✗ ${violations.length} fire-and-forget violation(s) found:\n`);
for (const v of violations) {
  console.log(`  api/${v.file}:${v.line}  →  return res.* at line ${v.returnLine}`);
  console.log(`    ${v.snippet}`);
}
console.log('\nFix: await the call (wrap in Promise.race+timeout if it can hang)');
console.log(`Or: add 'api/${violations[0].file}:${violations[0].line}' to ALLOWLIST in this script with a one-line reason.`);
process.exit(1);
