/**
 * Set a Vercel project env var via the REST API (bypasses CLI stdin
 * bugs on Windows).
 *
 * Usage:
 *   node scripts/set-vercel-env-via-api.mjs KEY <<<'value'
 *   echo 'value' | node scripts/set-vercel-env-via-api.mjs KEY
 *
 * Reads value from stdin so secrets don't land in argv.
 * Reads Vercel auth token from %APPDATA%/com.vercel.cli/Data/auth.json.
 * Targets production only (Encrypted, plain `env` not `system` env).
 */

import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ID = 'prj_XZ3RlR3RVMvKb6se2AeEQGMn1fAV';
const TEAM_ID = 'team_0OAVq8O0WIyi5FXT8Bgoxvnx';

const key = process.argv[2];
if (!key) {
  console.error('Usage: node scripts/set-vercel-env-via-api.mjs <KEY>  (value piped on stdin)');
  process.exit(2);
}

// Read value from stdin
const value = await new Promise((resolve) => {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => (buf += c));
  process.stdin.on('end', () => resolve(buf.replace(/\r?\n$/, '')));
});
if (!value) {
  console.error('No value on stdin — refusing to write empty.');
  process.exit(3);
}
console.log(`Value loaded (len ${value.length})`);

// Load Vercel auth token
const authPath = path.join(process.env.APPDATA || '', 'com.vercel.cli/Data/auth.json');
if (!fs.existsSync(authPath)) {
  console.error(`No auth.json at ${authPath} — run 'vercel login' first.`);
  process.exit(4);
}
const { token } = JSON.parse(fs.readFileSync(authPath, 'utf8'));
if (!token) {
  console.error('No token in auth.json');
  process.exit(4);
}

const base = `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}`;

// 1. List existing vars to find the existing one (if any) for this key+target.
console.log(`Querying existing env vars for ${key}…`);
const listRes = await fetch(base, {
  headers: { Authorization: `Bearer ${token}` },
});
const listJson = await listRes.json();
if (!listRes.ok) {
  console.error('List failed:', listRes.status, JSON.stringify(listJson).slice(0, 300));
  process.exit(5);
}
const existing = (listJson.envs || []).filter(
  (e) => e.key === key && (e.target || []).includes('production'),
);
if (existing.length > 0) {
  for (const e of existing) {
    console.log(`Deleting existing entry ${e.id}…`);
    const delRes = await fetch(
      `https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${e.id}?teamId=${TEAM_ID}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    if (!delRes.ok) {
      const txt = await delRes.text();
      console.error(`Delete failed: ${delRes.status} ${txt.slice(0, 300)}`);
      process.exit(6);
    }
  }
}

// 2. Create the new entry.
const createRes = await fetch(base, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key,
    value,
    type: 'encrypted',
    target: ['production'],
  }),
});
const createJson = await createRes.json();
if (!createRes.ok) {
  console.error('Create failed:', createRes.status, JSON.stringify(createJson).slice(0, 500));
  process.exit(7);
}
console.log(`✓ ${key} (len ${value.length}) written to production. id=${createJson.id || createJson.created?.id}`);
