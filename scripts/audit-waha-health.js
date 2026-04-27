#!/usr/bin/env node
/**
 * WAHA pipeline health gate.
 *
 * If the last 24h of waha_events shows ANY sig_invalid AND zero received/
 * processed, the pipeline is broken (key rotation drift between Vercel and
 * Fly.io WAHA, almost certainly). Caught the 2026-04-24 regression: 660
 * sig_invalid events accumulated over 3 days while every real customer
 * WhatsApp message was silently dropped.
 *
 * Exit code 1 if drift detected. Wire into live-smoke.yml.
 *
 * Skipped if waha_events table is empty (no traffic at all → can't
 * distinguish "broken" from "no users yet").
 */
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(2);
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from('waha_events')
    .select('event_type')
    .gte('created_at', since);

  if (error) {
    console.error(`Failed to query waha_events: ${error.message}`);
    process.exit(2);
  }

  const counts = {};
  for (const r of data || []) counts[r.event_type] = (counts[r.event_type] || 0) + 1;
  const sigInvalid = counts.sig_invalid || 0;
  const received = counts.received || 0;
  const processed = counts.processed || 0;
  const total = data?.length || 0;

  console.log(`Last 24h waha_events: total=${total}`);
  console.log(`  received=${received}  processed=${processed}  sig_invalid=${sigInvalid}  other=${total - received - processed - sigInvalid}`);

  // Quiet pipeline (no traffic) — can't distinguish broken from idle.
  if (total === 0) {
    console.log('\n\u00b7 No WAHA events in 24h. Skipping (no traffic to assess).');
    process.exit(0);
  }

  // Active pipeline with no successes and >5 sig_invalid → broken.
  if (received === 0 && processed === 0 && sigInvalid >= 5) {
    console.log(`\n\u2717 WAHA pipeline appears broken: ${sigInvalid} signature failures, zero successful events.`);
    console.log('Likely cause: WAHA_API_KEY mismatch between Vercel and Fly.io WAHA.');
    console.log('Fix: rotate keys on both sides until they match. Verify with /api/waha-status.');
    process.exit(1);
  }

  // High sig_invalid ratio even with some success → degraded.
  if (received > 0 && sigInvalid > received * 2) {
    console.log(`\n\u26a0 Degraded: sig_invalid (${sigInvalid}) > 2x received (${received}). Investigate stale clients or probing.`);
    // Don't fail CI for degraded — just warn.
  }

  console.log(`\n\u2713 WAHA pipeline healthy.`);
  process.exit(0);
})();
