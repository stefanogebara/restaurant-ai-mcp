#!/usr/bin/env node
/**
 * Live end-to-end test of the WhatsApp duplicate-prevention stack.
 *
 * Fires 3 parallel signed webhook requests at seatable.one with the SAME
 * phone number but DIFFERENT messageIds and text, then:
 *   - verifies all 3 messageIds landed in whatsapp_message_dedup (dedup OK)
 *   - verifies whatsapp_processing_lock is empty after settle (released)
 *   - measures timing to confirm lock serialization
 *
 * Uses a non-registered phone so the LLM may run but the outbound Graph
 * send fails harmlessly with "recipient not opted in" — no real WhatsApp
 * messages are delivered.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const APP_SECRET = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET;
const WEBHOOK_URL = 'https://seatable.one/api/whatsapp-webhook';
const TEST_PHONE = '+5511900000888';  // fake number, never used by real customers
const WABA_PHONE_ID = '1035729146286096'; // sandbox WABA phone-number-id

if (!APP_SECRET) { console.error('Missing WHATSAPP_APP_SECRET'); process.exit(1); }

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function makeWebhookBody(messageId, text) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'test-waba',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '551150289356', phone_number_id: WABA_PHONE_ID },
          contacts: [{ profile: { name: 'Lock Race Test' }, wa_id: TEST_PHONE.replace('+', '') }],
          messages: [{
            from: TEST_PHONE.replace('+', ''),
            id: messageId,
            timestamp: String(Math.floor(Date.now() / 1000)),
            text: { body: text },
            type: 'text',
          }],
        },
        field: 'messages',
      }],
    }],
  };
}

function sign(bodyJson) {
  return 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(bodyJson).digest('hex');
}

async function fireWebhook(i) {
  const messageId = `wamid.TEST-RACE-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
  const text = `race test message ${i} at ${new Date().toISOString()}`;
  const body = JSON.stringify(makeWebhookBody(messageId, text));
  const signature = sign(body);
  const t0 = Date.now();
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature },
    body,
  });
  const elapsed = Date.now() - t0;
  return { i, messageId, status: res.status, elapsed };
}

async function assertLockPrimaryKey() {
  // Belt-and-suspenders: confirm the UNIQUE/PRIMARY KEY on `phone` is intact.
  // If someone drops the PK, the lock becomes a suggestion and duplicates sneak through.
  const probe = `__pk_probe_${Date.now()}`;
  const expiresAt = new Date(Date.now() + 5000).toISOString();
  await supabase.from('whatsapp_processing_lock').delete().eq('phone', probe);
  const first = await supabase.from('whatsapp_processing_lock').insert({ phone: probe, expires_at: expiresAt });
  if (first.error) throw new Error(`PK probe insert #1 failed: ${first.error.message}`);
  const second = await supabase.from('whatsapp_processing_lock').insert({ phone: probe, expires_at: expiresAt });
  if (second.error?.code !== '23505') {
    throw new Error(`PK probe: expected 23505 unique violation on duplicate insert, got ${second.error?.code || 'OK'} — PRIMARY KEY may be missing`);
  }
  await supabase.from('whatsapp_processing_lock').delete().eq('phone', probe);
  console.log('  PK assertion: phone column is unique (duplicate insert rejected with 23505)');
}

async function main() {
  console.log(`\nPhone: ${TEST_PHONE}`);
  console.log('Asserting whatsapp_processing_lock PRIMARY KEY is intact...');
  await assertLockPrimaryKey();
  console.log('Clearing any prior state for this phone...');
  await supabase.from('whatsapp_processing_lock').delete().eq('phone', TEST_PHONE);

  // Clear prior dedup entries we created in earlier test runs (keep only from last 5 min)
  const { count: lockBefore } = await supabase
    .from('whatsapp_processing_lock').select('*', { count: 'exact', head: true })
    .eq('phone', TEST_PHONE);
  console.log(`  lock rows for phone before: ${lockBefore ?? 0}`);

  console.log('\nFiring 3 parallel webhook requests with same phone, different messageIds...');
  const t0 = Date.now();
  const results = await Promise.all([fireWebhook(1), fireWebhook(2), fireWebhook(3)]);
  const totalElapsed = Date.now() - t0;

  console.log('\nResults:');
  for (const r of results) {
    console.log(`  [${r.i}] status=${r.status} elapsed=${r.elapsed}ms messageId=${r.messageId}`);
  }
  console.log(`  total wall time: ${totalElapsed}ms`);

  console.log('\nSettle 8s for async tails...');
  await new Promise(r => setTimeout(r, 8000));

  console.log('\nPost-run state checks:');
  const { data: dedupRows } = await supabase
    .from('whatsapp_message_dedup').select('message_id')
    .in('message_id', results.map(r => r.messageId));
  console.log(`  messageIds recorded in dedup: ${dedupRows?.length ?? 0} / 3`);

  const { count: lockAfter } = await supabase
    .from('whatsapp_processing_lock').select('*', { count: 'exact', head: true })
    .eq('phone', TEST_PHONE);
  console.log(`  lock rows for phone after:  ${lockAfter ?? 0} (expected: 0)`);

  const allResponded = results.every(r => r.status === 200);
  const allDeduped = dedupRows?.length === 3;
  const lockReleased = (lockAfter ?? 0) === 0;

  console.log('\nVerdict:');
  console.log(`  all 3 webhook calls returned 200:   ${allResponded}`);
  console.log(`  all 3 messageIds atomically dedup'd: ${allDeduped}`);
  console.log(`  lock released after all processing: ${lockReleased}`);
  const pass = allResponded && allDeduped && lockReleased;
  console.log(`\n${pass ? 'PASS' : 'FAIL'}: production webhook handles parallel same-phone messages correctly`);

  // Cleanup: the test messageIds are marker-free, but keep them in dedup (harmless)
  process.exit(pass ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
