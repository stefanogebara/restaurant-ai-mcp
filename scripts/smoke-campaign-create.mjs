/**
 * Live smoke for the Campaign creation flow.
 *
 * The Pizzeria Webhook Test restaurant has zero customers, so a direct
 * POST /api/retention-campaigns?action=create_whatsapp returns 400 with
 * 'No customers found for this segment' — which is *correct* gate behavior.
 *
 * To prove the full happy path, this script:
 *   1. Inserts a synthetic test customer into restaurant.customer_ltv.
 *   2. Mints a Supabase access_token for the e2etest4 user.
 *   3. POSTs the same body the CampaignBuilder UI sends.
 *   4. Asserts the campaign row + recipient rows landed in DB.
 *   5. Cleans up: deletes the campaign, recipients, and synthetic customer.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const RID = 'fb184e41-2ae2-4834-a1ba-39b4071ac6c0';
const ENDPOINT = 'https://www.seatable.one/api/retention-campaigns?action=create_whatsapp';
const TEST_PHONE = '+5511999999999';
const TEST_NAME = 'Smoke Test Customer';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = process.env;
for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY })) {
  if (!v) { console.error(`Missing env: ${k}`); process.exit(2); }
}

const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sbAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const SMOKE_EMAIL = `campaign-smoke-${Date.now()}@seatable.test`;
const SMOKE_PASSWORD = `pw_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
let smokeUserId = null;
let createdCampaignId = null;
let createdLtvId = null;

async function cleanup() {
  console.log('\n[cleanup] starting…');
  if (createdCampaignId) {
    try {
      const { error: rErr } = await sbAdmin
        .from('campaign_recipients')
        .delete()
        .eq('campaign_id', createdCampaignId);
      if (rErr) console.warn('  recipients del:', rErr.message);
      else console.log('  recipients deleted');
    } catch (e) { console.warn('  recipients del threw:', e.message); }
    try {
      const { error: cErr } = await sbAdmin
        .schema('restaurant')
        .from('retention_campaigns')
        .delete()
        .eq('id', createdCampaignId);
      if (cErr) console.warn('  campaign del:', cErr.message);
      else console.log(`  campaign ${createdCampaignId} deleted`);
    } catch (e) { console.warn('  campaign del threw:', e.message); }
  }
  if (createdLtvId) {
    try {
      const { error } = await sbAdmin
        .schema('restaurant')
        .from('customer_ltv')
        .delete()
        .eq('id', createdLtvId);
      if (error) console.warn('  customer_ltv del:', error.message);
      else console.log(`  customer_ltv ${createdLtvId} deleted`);
    } catch (e) { console.warn('  customer_ltv del threw:', e.message); }
  }
  if (smokeUserId) {
    try { await sbAdmin.auth.admin.deleteUser(smokeUserId); console.log('  smoke user deleted'); }
    catch (e) { console.warn('  smoke user del:', e.message); }
  }
}

process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

try {
  // ── 1. Insert synthetic customer ────────────────────────────────────
  console.log(`[1/6] Inserting test customer (${TEST_PHONE}) into customer_ltv`);
  const { randomUUID } = await import('node:crypto');
  const { data: ltvRow, error: ltvErr } = await sbAdmin
    .schema('restaurant')
    .from('customer_ltv')
    .insert({
      restaurant_id: RID,
      customer_id: randomUUID(),
      customer_phone: TEST_PHONE,
      customer_name: TEST_NAME,
      total_visits: 0,
      lifetime_value: 0,
      customer_tier: 'new',
    })
    .select('id')
    .single();
  if (ltvErr) throw new Error(`customer_ltv insert: ${ltvErr.message}`);
  createdLtvId = ltvRow.id;
  console.log(`      ltv_id=${createdLtvId}`);

  // ── 2. Mint Supabase session for e2etest4 user ──────────────────────
  console.log(`[2/6] Creating temp user ${SMOKE_EMAIL} with restaurant_id metadata`);
  const { data: createRes, error: createErr } = await sbAdmin.auth.admin.createUser({
    email: SMOKE_EMAIL,
    password: SMOKE_PASSWORD,
    email_confirm: true,
    user_metadata: { restaurant_id: RID, role: 'owner' },
  });
  if (createErr) throw new Error(`createUser: ${createErr.message}`);
  smokeUserId = createRes.user.id;
  const { data: signIn, error: signInErr } = await sbAnon.auth.signInWithPassword({
    email: SMOKE_EMAIL, password: SMOKE_PASSWORD,
  });
  if (signInErr) throw new Error(`signIn: ${signInErr.message}`);
  const token = signIn.session.access_token;

  // ── 3. POST same body the CampaignBuilder UI sends ──────────────────
  const campaignName = `Smoke Test Campaign ${Date.now()}`;
  const body = {
    name: campaignName,
    segment: 'all',
    message: 'Hello {name}, this is a smoke-test message.',
    template_name: 'seatable_promotion',
    scheduled_at: null,
  };
  console.log(`[3/6] POST ${ENDPOINT}`);
  console.log(`      body=${JSON.stringify(body)}`);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const respBody = await res.json();
  console.log(`      status=${res.status}`);
  console.log(`      respBody=${JSON.stringify(respBody).slice(0, 300)}`);

  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(respBody)}`);
  createdCampaignId = respBody?.campaign?.id || respBody?.data?.campaign?.id || respBody?.id;
  if (!createdCampaignId) throw new Error(`no campaign id in response: ${JSON.stringify(respBody)}`);
  console.log(`      campaign_id=${createdCampaignId}`);

  // ── 4. Verify campaign row in DB ────────────────────────────────────
  console.log(`[4/6] Verifying retention_campaigns row`);
  const { data: campRow, error: campErr } = await sbAdmin
    .schema('restaurant')
    .from('retention_campaigns')
    .select('id, campaign_type, channel, status, message, metadata, restaurant_id')
    .eq('id', createdCampaignId)
    .single();
  if (campErr) throw new Error(`campaign row read: ${campErr.message}`);
  console.log(`      ${JSON.stringify(campRow)}`);
  if (campRow.restaurant_id !== RID) throw new Error(`restaurant_id mismatch: ${campRow.restaurant_id}`);
  if (campRow.metadata?.name !== campaignName) throw new Error(`metadata.name mismatch: "${campRow.metadata?.name}"`);
  if (campRow.metadata?.segment_name !== 'all') throw new Error(`metadata.segment_name mismatch: ${campRow.metadata?.segment_name}`);
  if (campRow.channel !== 'whatsapp' && campRow.channel !== 'email') throw new Error(`unexpected channel: ${campRow.channel}`);
  if (campRow.status !== 'active') throw new Error(`expected status=active (immediate send), got ${campRow.status}`);

  // ── 5. Verify recipient row landed ──────────────────────────────────
  console.log(`[5/6] Verifying recipient row in public.campaign_recipients`);
  const { data: recRows, error: recErr } = await sbAdmin
    .from('campaign_recipients')
    .select('id, campaign_id, customer_phone, customer_name, status')
    .eq('campaign_id', createdCampaignId);
  if (recErr) throw new Error(`recipients read: ${recErr.message}`);
  console.log(`      recipientCount=${recRows.length}`);
  console.log(`      ${JSON.stringify(recRows.slice(0, 3))}`);
  if (recRows.length === 0) throw new Error(`expected >= 1 recipient`);
  const myRecipient = recRows.find(r => r.customer_phone === TEST_PHONE);
  if (!myRecipient) throw new Error(`our synthetic customer was not added as recipient`);

  // ── 6. Cleanup ──────────────────────────────────────────────────────
  console.log(`\n[6/6] All assertions passed ✓`);
  console.log(`\nSMOKE PASS: Campaign creation end-to-end:`);
  console.log(`  POST /api/retention-campaigns?action=create_whatsapp → 200`);
  console.log(`  retention_campaigns row created (id=${createdCampaignId}, segment=all)`);
  console.log(`  retention_campaign_recipients row created for ${TEST_PHONE}`);
  await cleanup();
  process.exit(0);
} catch (err) {
  console.error(`\n[ERROR] ${err.message}`);
  await cleanup();
  process.exit(1);
}
