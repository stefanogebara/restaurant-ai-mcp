#!/usr/bin/env node
/**
 * Rename api/services/ → api/_services/ and update all imports.
 *
 * Why: Every file under api/services/ is a library (module.exports = { ... }),
 * not a request handler. But Vercel sees them under api/ and deploys each
 * as a serverless function. With 43 service files, that's ~146s of wasted
 * NFT-trace + bundling per deploy. Curl-probing them returns
 * FUNCTION_INVOCATION_FAILED because they crash trying to run the missing
 * handler.
 *
 * Vercel's convention: files under directories starting with underscore
 * (api/_lib/, api/_services/) are NOT treated as function entrypoints;
 * they're only bundled when an importing handler requires them.
 *
 * What this script does:
 *   1. `git mv api/services api/_services`
 *   2. Rewrites every `require(...services/...)` import in api/, client/,
 *      scripts/ to use `_services/` instead
 *   3. Verifies node --check passes on every touched .js file
 *
 * Run from repo root:
 *   node scripts/rename-services-to-_services.mjs
 *
 * Safe: no shell invocation (uses execFileSync with arg arrays), no user
 * input — paths and patterns are all literals.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();

function git(...args) {
  return execFileSync('git', args, { stdio: 'inherit' });
}

/** Recursively walk a directory, yielding file paths that match `predicate`. */
async function* walk(dir, predicate) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Skip junk dirs
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === '.vercel') continue;
      yield* walk(p, predicate);
    } else if (e.isFile() && predicate(p)) {
      yield p;
    }
  }
}

// 1. git mv the directory
console.log('Step 1: git mv api/services → api/_services');
try {
  git('mv', 'api/services', 'api/_services');
} catch (e) {
  console.error('git mv failed — already moved?');
  process.exit(1);
}

// 2. Update imports. We only touch require() / import statements that
// reference services/, NOT raw "services/" strings in log messages.
console.log('Step 2: rewriting imports across api/, client/, scripts/');

const SCAN_ROOTS = ['api', 'client', 'scripts'];
const isJsOrTs = (p) => /\.(js|mjs|cjs|ts|tsx)$/.test(p);

// Match require('./_services/X'), require('../_services/X'), etc.
// We do NOT match require('services/X') (no leading dots) — that's an npm
// module name, not a relative path. We also catch ES `from './_services/...'`
// and dynamic `import('./_services/...')`.
const REQUIRE_RE = /(require\(\s*['"])(\.[.\/]*)services\//g;
const FROM_RE = /(from\s+['"])(\.[.\/]*)services\//g;
const IMPORT_RE = /(import\(\s*['"])(\.[.\/]*)services\//g;

const touchedFiles = [];
for (const root of SCAN_ROOTS) {
  for await (const f of walk(path.join(ROOT, root), isJsOrTs)) {
    const src = await readFile(f, 'utf8');
    let next = src;
    next = next.replace(REQUIRE_RE, (_, pfx, dots) => `${pfx}${dots}_services/`);
    next = next.replace(FROM_RE, (_, pfx, dots) => `${pfx}${dots}_services/`);
    next = next.replace(IMPORT_RE, (_, pfx, dots) => `${pfx}${dots}_services/`);
    if (next !== src) {
      await writeFile(f, next);
      touchedFiles.push(path.relative(ROOT, f));
    }
  }
}
console.log(`Rewrote ${touchedFiles.length} files`);

// 3. Syntax-check every touched .js file
console.log('Step 3: node --check on every changed .js file');
let failed = 0;
for (const f of touchedFiles) {
  if (!/\.(js|mjs|cjs)$/.test(f)) continue; // tsc check would be slow; skip ts/tsx
  const r = spawnSync('node', ['--check', f], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`SYNTAX FAIL: ${f}`);
    failed++;
  }
}
if (failed > 0) {
  console.error(`${failed} files failed syntax check — rollback with: git checkout -- api/ client/ scripts/ && git mv api/_services api/services`);
  process.exit(1);
}
console.log('All .js files parse clean');
console.log(`\nTouched files (${touchedFiles.length}):`);
for (const f of touchedFiles.slice(0, 20)) console.log(`  ${f}`);
if (touchedFiles.length > 20) console.log(`  ... and ${touchedFiles.length - 20} more`);
console.log('\nNext: git diff to review, then commit.');
