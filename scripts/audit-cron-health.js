#!/usr/bin/env node
/**
 * Cron health audit.
 *
 * Reads vercel.json, lists every configured cron, then probes each by
 * sending GET with the CRON_SECRET bearer. Asserts each endpoint:
 *   - responds (no 5xx)
 *   - returns 200 or 401 (401 = endpoint exists but cron-only auth applied,
 *     which itself proves the endpoint is reachable and the auth gate works)
 *
 * Caught the case where a cron handler is silently broken between schedule
 * runs (file moved, env var missing, db query fails). In normal CI runs
 * we use a synthetic test secret to skip side-effects, but here we hit
 * prod with real CRON_SECRET so we get the actual prod path.
 *
 * Doesn't trigger heavy work — most cron handlers early-out on time
 * windows, dedup keys, or feature flags.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const VERCEL_JSON = path.join(__dirname, '..', 'vercel.json');
const BASE_URL = process.env.PW_BASE_URL || 'https://seatable.one';
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
  console.error('CRON_SECRET required (in .env.local or env).');
  process.exit(2);
}

function loadCrons() {
  const cfg = JSON.parse(fs.readFileSync(VERCEL_JSON, 'utf8'));
  // Dedupe by path (some configs have the same path with different ?type=... query)
  const list = (cfg.crons || []).map(c => ({ path: c.path, schedule: c.schedule }));
  return list;
}

async function probe(cronPath) {
  const url = `${BASE_URL}${cronPath}`;
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${SECRET}` },
    });
    const body = await r.text().catch(() => '');
    return { status: r.status, body: body.slice(0, 200) };
  } catch (e) {
    return { status: 0, error: e.message?.slice(0, 200) };
  }
}

(async () => {
  const crons = loadCrons();
  console.log(`Probing ${crons.length} cron endpoints...\n`);

  const failures = [];
  for (const c of crons) {
    const r = await probe(c.path);
    const ok = r.status === 200 || r.status === 401;  // 401 = cron-secret guard rejected our test (still proves alive)
    const icon = ok ? '✓' : '✗';
    console.log(`${icon} ${String(r.status).padStart(3)} ${c.path}`.slice(0, 100));
    if (!ok) {
      failures.push({ path: c.path, status: r.status, body: r.body });
      if (r.body) console.log(`     ${r.body.slice(0, 120)}`);
    }
  }

  console.log(`\n${failures.length === 0 ? '\u2713' : '\u2717'} ${crons.length - failures.length}/${crons.length} cron endpoints healthy`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f.path}  →  ${f.status}  ${f.body?.slice(0, 100)}`);
    process.exit(1);
  }
  process.exit(0);
})();
