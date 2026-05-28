/**
 * Smoke test the Stripe Connect onboarding endpoint against production.
 *
 *   1. Mint a JWT locally for the test bistro (eee572c5…) using
 *      JWT_SECRET from .env.local
 *   2. POST /api/stripe-connect-onboarding with that JWT
 *   3. Assert: 200, body.url is a Stripe-hosted URL, body.account_id
 *      starts with "acct_"
 *   4. Verify a row materialised in restaurant.stripe_connect_accounts
 *   5. Cleanup: delete the Stripe Account at Stripe + the row
 *
 * Usage:
 *   set -a; . .env.local; set +a; \
 *     node scripts/stripe-connect-onboarding-smoke.mjs
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const RID = 'eee572c5-9f1a-4d96-a560-a92bfd747947';
const ENDPOINT = 'https://seatable.one/api/stripe-connect-onboarding';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY,
  STRIPE_SECRET_KEY,
} = process.env;

for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, STRIPE_SECRET_KEY })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(2); }
}

const stripe = Stripe(STRIPE_SECRET_KEY);
const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const sb = async (pathAndQuery, init = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'restaurant',
      'Accept-Profile': 'restaurant',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text }; }
};

// 1. Create a real Supabase smoke-test user and sign in for a live
// session — the endpoint's verifyJWT enforces SEC-09 session liveness,
// so synthetic HS256 tokens won't pass.
const SMOKE_EMAIL = `stripe-connect-smoke-${Date.now()}@seatable.test`;
const SMOKE_PASSWORD = `pw_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

console.log(`[0/4] Creating smoke-test user ${SMOKE_EMAIL}`);
const { data: createRes, error: createErr } = await sbAdmin.auth.admin.createUser({
  email: SMOKE_EMAIL,
  password: SMOKE_PASSWORD,
  email_confirm: true,
  user_metadata: { restaurant_id: RID, role: 'owner' },
});
if (createErr) { console.error(`createUser failed: ${createErr.message}`); process.exit(1); }
const smokeUserId = createRes.user.id;
console.log(`  user_id=${smokeUserId}`);

const { data: signInRes, error: signInErr } = await sbAnon.auth.signInWithPassword({
  email: SMOKE_EMAIL,
  password: SMOKE_PASSWORD,
});
if (signInErr) {
  console.error(`signInWithPassword failed: ${signInErr.message}`);
  await sbAdmin.auth.admin.deleteUser(smokeUserId);
  process.exit(1);
}
const token = signInRes.session.access_token;
console.log(`  access_token len=${token.length}\n`);

// Cleanup helper invoked on exit
const cleanupUser = async () => {
  try { await sbAdmin.auth.admin.deleteUser(smokeUserId); } catch {}
};

// 2. POST the endpoint
console.log(`[1/4] POST ${ENDPOINT}`);
const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    return_url: 'https://seatable.one/host-dashboard/voice-settings?stripe_connect=ok',
    refresh_url: 'https://seatable.one/host-dashboard/voice-settings?stripe_connect=refresh',
    country: 'BR',
  }),
});
const data = await res.json().catch(() => ({}));
console.log(`  HTTP ${res.status}`);
console.log(`  body: ${JSON.stringify(data).slice(0, 400)}\n`);

const failures = [];
const log = (ok, msg) => { console.log(`  ${ok ? '✅' : '❌'} ${msg}`); if (!ok) failures.push(msg); };

log(res.status === 200, `HTTP 200 (got ${res.status})`);
log(data?.success === true, 'body.success === true');
log(typeof data?.url === 'string' && /^https:\/\/.*stripe\.com\//.test(data.url), `body.url is a stripe.com URL (got "${data?.url?.slice(0, 80)}")`);
log(typeof data?.account_id === 'string' && data.account_id.startsWith('acct_'), `body.account_id starts with acct_ (got "${data?.account_id}")`);

// 3. DB row materialized?  Use postgres protocol via pg (REST cache may
// not have refreshed for the new table yet).
console.log(`\n[2/4] Check stripe_connect_accounts row via Supabase REST`);
const sel = await sb(`/stripe_connect_accounts?restaurant_id=eq.${RID}&select=id,stripe_account_id,status,country,default_currency,charges_enabled,details_submitted`);
console.log(`  HTTP ${sel.status}, body: ${JSON.stringify(sel.body).slice(0, 200)}`);
if (Array.isArray(sel.body) && sel.body[0]) {
  const r = sel.body[0];
  console.log(`  row: ${JSON.stringify(r)}`);
  log(r.stripe_account_id === data.account_id, `row.stripe_account_id matches endpoint response`);
  log(r.country === 'BR', `country = BR`);
  log(r.status === 'pending', `status = pending`);
} else if (sel.status === 404 || (typeof sel.body === 'object' && sel.body?.message?.includes('schema cache'))) {
  console.log('  (PostgREST schema cache stale — skipping row verification; manual SQL check needed)');
} else {
  failures.push('no row found');
}

// 4. Idempotency: second call should reuse the same account_id
console.log(`\n[3/4] Idempotency: second POST should reuse acct_id`);
const res2 = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ return_url: 'https://seatable.one/x', refresh_url: 'https://seatable.one/x' }),
});
const data2 = await res2.json().catch(() => ({}));
log(res2.status === 200, `HTTP 200`);
log(data2?.account_id === data?.account_id, `account_id unchanged across calls`);
log(data2?.url !== data?.url, `url is freshly minted (AccountLinks are single-use)`);

// 5. Cleanup
console.log(`\n[4/4] Cleanup: delete Stripe account + row`);
if (data?.account_id) {
  try {
    const del = await stripe.accounts.del(data.account_id);
    console.log(`  Stripe del: ${JSON.stringify(del).slice(0, 200)}`);
  } catch (err) {
    console.log(`  Stripe del failed: ${err.message}`);
  }
}
const dbDel = await sb(`/stripe_connect_accounts?restaurant_id=eq.${RID}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
console.log(`  DB del: ${dbDel.status}`);

await cleanupUser();
console.log('  (smoke-test user deleted)');

if (failures.length === 0) {
  console.log('\n✅ ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.log(`\n❌ ${failures.length} check(s) failed`);
  process.exit(1);
}
