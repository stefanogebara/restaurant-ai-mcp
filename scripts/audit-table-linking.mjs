// Audit table-linking (join) flow:
//   1. Sign up + onboarding (creates 2x cap-2 + 3x cap-4 tables)
//   2. Get two tables via /api/host-dashboard
//   3. Test bidirectional link via API → verify joinable_with persists on BOTH sides
//   4. Test unlink → verify joinable_with cleared on BOTH sides
//   5. Test 400 cases: missing args, self-link

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = readFileSync('client/.env', 'utf8');
const anon = env.match(/VITE_SUPABASE_ANON_KEY\s*=\s*([^\n\r]+)/)[1].trim();
const supabase = createClient('https://ckforlwdhewexyqljsaf.supabase.co', anon);

const email = `linktest-${Date.now()}@example.com`;
const password = 'LinkTest-2026!';
const { data: signupData } = await supabase.auth.signUp({ email, password });
const initialToken = signupData.session?.access_token;
console.log(`[setup] signed up ${email}`);

await fetch('https://seatable.one/api/onboarding/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${initialToken}` },
  body: JSON.stringify({
    customer_email: email, restaurant_name: 'Link Test', restaurant_type: 'casual_dining',
    city: 'São Paulo', country: 'Brazil', country_code: 'BR', language: 'pt',
    phone_number: '+55 11 98765-4321', email,
    business_hours: ['Monday'].map(d => ({ day: d, is_open: true, open_time: '12:00', close_time: '23:00' })),
    average_dining_duration: 90,
    areas: [{ name: 'Salão', is_active: true, tables: [
      { capacity: 2, count: 2, shape: 'round', is_fixed_seating: false, is_joinable: true },
      { capacity: 4, count: 2, shape: 'square', is_fixed_seating: false, is_joinable: true },
    ]}],
    advance_booking_days: 30, buffer_time: 15, cancellation_policy: '', special_notes: '', team_members: [],
  }),
});

const { data: refreshed } = await supabase.auth.refreshSession();
const token = refreshed.session?.access_token || initialToken;

// Fetch tables
console.log('\n[1] Fetch tables');
const dashRes = await fetch('https://seatable.one/api/host-dashboard?action=dashboard', { headers: { 'Authorization': `Bearer ${token}` } });
const dashBody = await dashRes.json();
const tables = dashBody?.tables || [];
console.log(`  found ${tables.length} tables`);
const tA = tables[0], tB = tables[1];
console.log(`  table A: ${tA?.id?.slice(0, 8)} (cap=${tA?.capacity}, joinable_with=${JSON.stringify(tA?.joinable_with)})`);
console.log(`  table B: ${tB?.id?.slice(0, 8)} (cap=${tB?.capacity}, joinable_with=${JSON.stringify(tB?.joinable_with)})`);
if (!tA || !tB) { console.error('Not enough tables'); process.exit(1); }

// Test self-link rejection
console.log('\n[2] Self-link rejection');
const selfLink = await fetch('https://seatable.one/api/host-dashboard?action=link-tables', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ table_id: tA.id, linked_table_id: tA.id }),
});
const selfLinkBody = await selfLink.json();
console.log(`  status=${selfLink.status}`, JSON.stringify(selfLinkBody).slice(0, 120));

// Test missing args
console.log('\n[3] Missing args rejection');
const missing = await fetch('https://seatable.one/api/host-dashboard?action=link-tables', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ table_id: tA.id }),
});
const missingBody = await missing.json();
console.log(`  status=${missing.status}`, JSON.stringify(missingBody).slice(0, 120));

// Real link
console.log('\n[4] Link tA ↔ tB');
const linkRes = await fetch('https://seatable.one/api/host-dashboard?action=link-tables', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ table_id: tA.id, linked_table_id: tB.id }),
});
const linkBody = await linkRes.json();
console.log(`  status=${linkRes.status}`, JSON.stringify(linkBody).slice(0, 200));

// Verify both sides
console.log('\n[5] Verify joinable_with on both sides');
const dashAfter = await fetch('https://seatable.one/api/host-dashboard?action=dashboard', { headers: { 'Authorization': `Bearer ${token}` } });
const tablesAfter = (await dashAfter.json()).tables || [];
const tAAfter = tablesAfter.find(t => t.id === tA.id);
const tBAfter = tablesAfter.find(t => t.id === tB.id);
const aHasB = tAAfter?.joinable_with?.includes(tB.id);
const bHasA = tBAfter?.joinable_with?.includes(tA.id);
console.log(`  A.joinable_with includes B: ${aHasB}`);
console.log(`  B.joinable_with includes A: ${bHasA}`);
console.log(`  A.joinable_with: ${JSON.stringify(tAAfter?.joinable_with)}`);
console.log(`  B.joinable_with: ${JSON.stringify(tBAfter?.joinable_with)}`);

// Idempotency — link the same pair again
console.log('\n[6] Re-link (idempotency)');
const relinkRes = await fetch('https://seatable.one/api/host-dashboard?action=link-tables', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ table_id: tA.id, linked_table_id: tB.id }),
});
console.log(`  status=${relinkRes.status}`, JSON.stringify(await relinkRes.json()).slice(0, 120));

// Unlink
console.log('\n[7] Unlink tA ↔ tB');
const unlinkRes = await fetch('https://seatable.one/api/host-dashboard?action=unlink-tables', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ table_id: tA.id, linked_table_id: tB.id }),
});
const unlinkBody = await unlinkRes.json();
console.log(`  status=${unlinkRes.status}`, JSON.stringify(unlinkBody).slice(0, 200));

// Verify cleared on both sides
const dashFinal = await fetch('https://seatable.one/api/host-dashboard?action=dashboard', { headers: { 'Authorization': `Bearer ${token}` } });
const tablesFinal = (await dashFinal.json()).tables || [];
const tAFinal = tablesFinal.find(t => t.id === tA.id);
const tBFinal = tablesFinal.find(t => t.id === tB.id);
const aNoB = !tAFinal?.joinable_with?.includes(tB.id);
const bNoA = !tBFinal?.joinable_with?.includes(tA.id);
console.log(`  A no longer includes B: ${aNoB}`);
console.log(`  B no longer includes A: ${bNoA}`);

// Cross-tenant guard: another user can't link tables we don't own
console.log('\n[8] Cross-tenant guard — different user');
const otherEmail = `other-${Date.now()}@example.com`;
const { data: other } = await supabase.auth.signUp({ email: otherEmail, password: 'Other-2026!' });
await fetch('https://seatable.one/api/onboarding/complete', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${other.session.access_token}` },
  body: JSON.stringify({
    customer_email: otherEmail, restaurant_name: 'Other Rest', restaurant_type: 'casual_dining',
    city: 'São Paulo', country: 'Brazil', country_code: 'BR', language: 'pt',
    phone_number: '+55 11 98765-9999', email: otherEmail,
    business_hours: ['Monday'].map(d => ({ day: d, is_open: true, open_time: '12:00', close_time: '23:00' })),
    average_dining_duration: 90,
    areas: [{ name: 'Salão', is_active: true, tables: [{ capacity: 2, count: 1, shape: 'round', is_fixed_seating: false, is_joinable: true }]}],
    advance_booking_days: 30, buffer_time: 15, cancellation_policy: '', special_notes: '', team_members: [],
  }),
});
const { data: otherRefresh } = await supabase.auth.refreshSession();
const otherToken = otherRefresh.session?.access_token;
const crossRes = await fetch('https://seatable.one/api/host-dashboard?action=link-tables', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${otherToken}` },
  body: JSON.stringify({ table_id: tA.id, linked_table_id: tB.id }),
});
const crossBody = await crossRes.json();
console.log(`  status=${crossRes.status}`, JSON.stringify(crossBody).slice(0, 200));

console.log('\n=== SUMMARY ===');
const pass = [
  selfLink.status === 400,
  missing.status === 400,
  linkRes.status === 200,
  aHasB && bHasA,
  unlinkRes.status === 200,
  aNoB && bNoA,
  crossRes.status >= 400, // must reject cross-tenant
];
console.log('Self-link rejected:', pass[0]);
console.log('Missing args rejected:', pass[1]);
console.log('Link 200:', pass[2]);
console.log('Bidirectional persisted:', pass[3]);
console.log('Unlink 200:', pass[4]);
console.log('Bidirectional cleared:', pass[5]);
console.log('Cross-tenant rejected:', pass[6]);

const allPass = pass.every(Boolean);
console.log(allPass ? '\n✓ TABLE LINKING ALL CHECKS PASS' : '\n✗ TABLE LINKING HAS FAILURES');
process.exit(allPass ? 0 : 1);
