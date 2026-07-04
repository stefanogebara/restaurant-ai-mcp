'use strict';

/**
 * Mints an INDEPENDENT Supabase session for the prospecting-admin account and
 * writes a Playwright storageState file (e2e/auth-state-olimpia.json).
 *
 * Why not reuse the browser session: Supabase rotates refresh tokens with
 * reuse detection — sharing one token family between the operator's Chrome
 * and Playwright can revoke the operator's session mid-test. generateLink
 * (service role, local .env) + verifyOtp yields a fresh, separate family.
 *
 * Run: node e2e/gen-olimpia-auth.js
 */

require('dotenv').config({ path: [`${__dirname}/../.env`, `${__dirname}/../.env.local`] });
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ckforlwdhewexyqljsaf.supabase.co';
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.PROSPECTING_ADMIN_EMAILS
  ? process.env.PROSPECTING_ADMIN_EMAILS.split(',')[0].trim()
  : 'stefanogebara@gmail.com';
const OUT = path.join(__dirname, 'auth-state-olimpia.json');
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];

(async () => {
  if (!ANON_KEY) { console.error('SUPABASE_ANON_KEY missing'); process.exit(1); }
  const { supabaseAdmin } = require('../api/_lib/supabase');

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: ADMIN_EMAIL,
  });
  if (error) { console.error('generateLink failed:', error.message); process.exit(1); }
  const tokenHash = data.properties && data.properties.hashed_token;
  if (!tokenHash) { console.error('no hashed_token in generateLink response'); process.exit(1); }

  // Exchange the hash for a session (tries both verify types across GoTrue versions).
  let session = null;
  for (const type of ['magiclink', 'email']) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, token_hash: tokenHash }),
    });
    const json = await res.json();
    if (res.ok && json.access_token) { session = json; break; }
    console.error(`verify type=${type} → ${res.status}: ${json.error_description || json.msg || json.error || 'unknown'}`);
  }
  if (!session) { console.error('could not mint session'); process.exit(1); }

  const storageValue = JSON.stringify({
    access_token: session.access_token,
    token_type: 'bearer',
    expires_in: session.expires_in || 3600,
    expires_at: Math.floor(Date.now() / 1000) + (session.expires_in || 3600),
    refresh_token: session.refresh_token,
    user: session.user,
  });

  fs.writeFileSync(OUT, JSON.stringify({
    cookies: [],
    origins: [{
      origin: 'https://seatable.one',
      localStorage: [{ name: `sb-${PROJECT_REF}-auth-token`, value: storageValue }],
    }],
  }, null, 2));
  console.log(`auth state written for ${ADMIN_EMAIL} → ${OUT} (expires in ${session.expires_in || 3600}s)`);
  process.exit(0);
})();
