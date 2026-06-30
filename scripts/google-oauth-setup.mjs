#!/usr/bin/env node
// =============================================================================
// google-oauth-setup.mjs — get a Google Calendar OAuth REFRESH TOKEN (one-shot).
// =============================================================================
// For the prospecting booking engine (Phase 4). Single-user: it authorizes YOUR
// own Google account/calendar. You run this locally; you approve in the browser.
//
// ── STEP 1 — create the OAuth client (Google Cloud Console, ~3 min, ONE time) ──
//   1. https://console.cloud.google.com  → create or pick a project.
//   2. APIs & Services → Library → search "Google Calendar API" → ENABLE.
//   3. APIs & Services → OAuth consent screen → User type EXTERNAL → fill the app
//      name + your support email → SAVE. Under "Test users" add your own email
//      (stefanogebara@gmail.com). (Staying in "Testing" is fine for personal use;
//      no Google verification needed.)
//   4. APIs & Services → Credentials → Create Credentials → OAuth client ID →
//      Application type "Desktop app" → Create → copy the Client ID + Client secret.
//      (Desktop app = loopback redirect is allowed automatically; no URI to register.)
//
// ── STEP 2 — run this script ──
//   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/google-oauth-setup.mjs
//   • Open the printed URL (logged in as the calendar owner).
//   • You'll see an "unverified app" screen (it's your own app) → Advanced →
//     "Go to <app> (unsafe)" → Continue → allow Calendar access.
//   • The script prints GOOGLE_REFRESH_TOKEN.
//
// ── STEP 3 — set these in Vercel (Project → Settings → Environment Variables) ──
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (printed),
//   PROSPECTING_CALENDAR_ID=primary, PROSPECTING_REP_EMAILS=stefanogebara@gmail.com
//   Then redeploy. The booking engine is live.
//
// Node 18+ (global fetch). No dependencies. Default loopback port 5858 (override
// with OAUTH_PORT). Re-run anytime; `prompt=consent` always returns a fresh token.
// =============================================================================

import http from 'node:http';
import { URL } from 'node:url';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = Number(process.env.OAUTH_PORT || 5858);
const REDIRECT = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/calendar';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars first (from Step 1).');
  process.exit(1);
}

const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline', // needed to receive a refresh_token
  prompt: 'consent',       // force a refresh_token even on re-auth
}).toString();

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  const code = u.searchParams.get('code');
  const err = u.searchParams.get('error');
  if (err) { res.writeHead(400); res.end('Authorization denied: ' + err); console.error('\nDenied:', err); finish(1); return; }
  if (!code) { res.writeHead(204); res.end(); return; } // ignore favicon etc.
  try {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: 'authorization_code',
      }).toString(),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.refresh_token) {
      res.writeHead(500, { 'Content-Type': 'text/html' });
      res.end('<h2>Token exchange failed — check the terminal.</h2>');
      console.error('\nToken exchange failed:', JSON.stringify(data, null, 2));
      if (resp.ok && !data.refresh_token) {
        console.error('Got an access token but NO refresh token. Revoke this app at');
        console.error('https://myaccount.google.com/permissions and run again (prompt=consent forces it).');
      }
      finish(1);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Done ✓ Refresh token printed in your terminal. You can close this tab.</h2>');
    console.log('\n=== SUCCESS ===\n');
    console.log('GOOGLE_REFRESH_TOKEN=' + data.refresh_token);
    console.log('\nNow set in Vercel: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, the token above,');
    console.log('PROSPECTING_CALENDAR_ID=primary, PROSPECTING_REP_EMAILS=stefanogebara@gmail.com — then redeploy.');
    finish(0);
  } catch (e) {
    res.writeHead(500); res.end('Error: ' + e.message);
    console.error(e);
    finish(1);
  }
});

function finish(code) {
  setTimeout(() => { try { server.close(); } catch { /* noop */ } process.exit(code); }, 400);
}

server.listen(PORT, () => {
  console.log('\n1) Open this URL in your browser (signed in as the calendar owner):\n');
  console.log('   ' + authUrl + '\n');
  console.log('2) Approve Calendar access. Waiting for the redirect on ' + REDIRECT + ' …');
});
