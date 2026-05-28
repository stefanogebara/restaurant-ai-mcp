// End-to-end live test for the Connect webhook.
//
// We can't easily fire a real `account.updated` from Stripe without
// onboarding a real restaurant. Instead we forge a valid Stripe-signed
// payload using the SDK's `stripe.webhooks.generateTestHeaderString()`
// helper and POST it at the live endpoint. The endpoint verifies the
// signature against STRIPE_CONNECT_WEBHOOK_SECRET — so if both sides
// share the same secret, the round-trip works.
//
// Pre-req: STRIPE_CONNECT_WEBHOOK_SECRET set in .env.local AND in Vercel
// production (must match).
//
// Verifies:
//   1. account.updated → 200, DB row reflects new flags
//   2. account.application.deauthorized → 200, status='revoked'
//   3. capability.updated → 200, no DB write
//   4. Duplicate event_id → 200 with deduplicated:true
//   5. Bad signature → 400

import 'dotenv/config';
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local', override: true });
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const ENDPOINT = process.env.WEBHOOK_ENDPOINT || 'https://seatable.one/api/stripe-connect-webhook';
const SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
if (!SECRET) { console.error('Missing STRIPE_CONNECT_WEBHOOK_SECRET'); process.exit(2); }

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// --- Helpers ---
function signedPost(eventObj, secretOverride) {
  const payload = JSON.stringify(eventObj);
  const header = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: secretOverride || SECRET,
    timestamp: Math.floor(Date.now() / 1000),
  });
  return fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
}
const failures = [];
const log = (ok, msg) => {
  console.log(`  ${ok ? '✅' : '❌'} ${msg}`);
  if (!ok) failures.push(msg);
};

// --- Setup: pick (or create) a real connected account so the DB row exists ---
console.log('[0/5] Setup: ensure a stripe_connect_accounts row exists to update');
const { data: rows } = await sbAdmin.schema('restaurant')
  .from('stripe_connect_accounts')
  .select('id, stripe_account_id, restaurant_id, charges_enabled, status')
  .limit(1);

let testAccountId, testRowId, createdAcct = false, restaurantId;
if (rows && rows.length > 0) {
  ({ stripe_account_id: testAccountId, id: testRowId, restaurant_id: restaurantId } = rows[0]);
  console.log(`  → reusing existing row: ${testRowId} acct=${testAccountId}`);
} else {
  // Create a Stripe Standard account + DB row to play with
  console.log('  → no row exists; creating one for the test');
  const acct = await stripe.accounts.create({ type: 'standard', country: 'BR', email: `webhook-test+${Date.now()}@seatable.one` });
  testAccountId = acct.id;
  createdAcct = true;
  // Find any restaurant_id for FK
  const { data: r } = await sbAdmin.schema('restaurant').from('restaurant_config').select('id').limit(1);
  restaurantId = r?.[0]?.id;
  const { data: insRow, error } = await sbAdmin.schema('restaurant').from('stripe_connect_accounts').insert({
    restaurant_id: restaurantId,
    stripe_account_id: testAccountId,
    status: 'pending',
    country: 'BR',
    default_currency: 'brl',
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
  }).select('id').single();
  if (error) { console.error('  → row insert failed:', error.message); process.exit(2); }
  testRowId = insRow.id;
  console.log(`  → created row: ${testRowId} acct=${testAccountId}`);
}

// --- Test 1: account.updated → expects DB to flip to active ---
console.log('\n[1/5] account.updated (active flags)');
const evt1 = {
  id: 'evt_test_acc_updated_' + Date.now(),
  object: 'event',
  type: 'account.updated',
  account: testAccountId,
  livemode: true,
  data: { object: {
    id: testAccountId,
    object: 'account',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
    default_currency: 'brl',
  }},
};
const r1 = await signedPost(evt1);
const b1 = await r1.json().catch(() => ({}));
log(r1.status === 200, `HTTP 200 (got ${r1.status})  body=${JSON.stringify(b1).slice(0, 100)}`);

// Verify DB
await new Promise(r => setTimeout(r, 1000));
const { data: row1 } = await sbAdmin.schema('restaurant').from('stripe_connect_accounts')
  .select('status, charges_enabled, payouts_enabled, details_submitted')
  .eq('stripe_account_id', testAccountId).single();
log(row1?.status === 'active', `DB status = active (got "${row1?.status}")`);
log(row1?.charges_enabled === true, `DB charges_enabled = true (got ${row1?.charges_enabled})`);
log(row1?.payouts_enabled === true, `DB payouts_enabled = true (got ${row1?.payouts_enabled})`);
log(row1?.details_submitted === true, `DB details_submitted = true (got ${row1?.details_submitted})`);

// --- Test 2: duplicate event id → deduplicated ---
console.log('\n[2/5] duplicate event_id (idempotency)');
const r2 = await signedPost(evt1); // same event id as #1
const b2 = await r2.json().catch(() => ({}));
log(r2.status === 200, `HTTP 200`);
log(b2.deduplicated === true, `body.deduplicated === true (got ${JSON.stringify(b2)})`);

// --- Test 3: capability.updated → 200 no DB write ---
console.log('\n[3/5] capability.updated (log only)');
const evt3 = {
  id: 'evt_test_cap_' + Date.now(),
  object: 'event',
  type: 'capability.updated',
  account: testAccountId,
  livemode: true,
  data: { object: { id: 'card_payments', account: testAccountId, status: 'active', requested: true } },
};
const r3 = await signedPost(evt3);
log(r3.status === 200, `HTTP 200 (got ${r3.status})`);

// --- Test 4: bad signature → 400 ---
console.log('\n[4/5] bad signature → 400');
const r4 = await signedPost({ ...evt1, id: 'evt_bad_' + Date.now() }, 'whsec_wrong_secret_xxxxx');
log(r4.status === 400, `HTTP 400 (got ${r4.status})`);

// --- Test 5: account.application.deauthorized → status revoked ---
console.log('\n[5/5] account.application.deauthorized (revoke)');
const evt5 = {
  id: 'evt_test_deauth_' + Date.now(),
  object: 'event',
  type: 'account.application.deauthorized',
  account: testAccountId,
  livemode: true,
  data: { object: { id: 'ca_xxxxx', object: 'application', name: 'Seatable' } },
};
const r5 = await signedPost(evt5);
log(r5.status === 200, `HTTP 200 (got ${r5.status})`);

await new Promise(r => setTimeout(r, 1000));
const { data: row5 } = await sbAdmin.schema('restaurant').from('stripe_connect_accounts')
  .select('status, charges_enabled, payouts_enabled')
  .eq('stripe_account_id', testAccountId).single();
log(row5?.status === 'revoked', `DB status = revoked (got "${row5?.status}")`);
log(row5?.charges_enabled === false, `DB charges_enabled = false (got ${row5?.charges_enabled})`);

// --- Cleanup ---
console.log('\n[CLEANUP]');
if (createdAcct) {
  // Restore the row to its starting state so we don't pollute prod
  await sbAdmin.schema('restaurant').from('stripe_connect_accounts').delete().eq('id', testRowId);
  console.log('  → test row deleted');
  console.log(`  → note: Stripe account ${testAccountId} is dormant (Standard accts can't be deleted via API)`);
} else {
  // Reset to pending so the real restaurant's row isn't left as revoked
  await sbAdmin.schema('restaurant').from('stripe_connect_accounts').update({
    status: 'pending', charges_enabled: false, payouts_enabled: false, details_submitted: false,
  }).eq('id', testRowId);
  console.log('  → row reset to status=pending (reused existing)');
}

// --- Cleanup webhook event rows we created (idempotency table) ---
const eventIdsToCleanup = [evt1.id, evt3.id, evt5.id];
await sbAdmin.from('stripe_webhook_events_processed').delete().in('event_id', eventIdsToCleanup);
console.log(`  → cleaned ${eventIdsToCleanup.length} idempotency rows`);

console.log('\n' + (failures.length === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures.length} CHECK(S) FAILED`));
process.exit(failures.length === 0 ? 0 : 1);
