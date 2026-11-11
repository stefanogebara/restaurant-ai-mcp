'use strict';
// R2 — per-restaurant voice agent tools (/api/elevenlabs-webhook with the
// restaurant's own el_whsec_ secret). The caller is whoever is speaking to the
// agent; every tool argument is model-authored from that speech.
// Property: a caller learns or changes a reservation only with ownership proof
// (full receipt code + the native caller number), as the shared line requires.
// Expected (written before running): name-only lookup must not return another
// guest's phone/e-mail/code; cancel/modify by code from a different caller
// number must be refused and change nothing.
const h = require('./harness.cjs');
const webhook = h.load('api/elevenlabs-webhook.js');
const { A } = h.GUESTS;
const auth = { authorization: 'Bearer el_whsec_audit_secret_0001', 'x-caller-number': '+5511999990000' };

(async () => {
  const out = [];
  await h.reset();
  const look = await h.call(webhook, { method: 'POST', headers: auth,
    query: { action: 'lookup_reservation', restaurant_id: h.R }, body: { customer_name: 'Ana' } });
  const leaked = JSON.stringify(look.body || {});
  out.push({ step: 'lookup by first name only (caller is not Ana)', expected: 'no guest data',
    observed: `${look.statusCode} phone=${leaked.includes(A.phone)} email=${leaked.includes('ana@example.test')} code=${leaked.includes(A.code)}` });

  const before = await h.snapshot();
  const cancel = await h.call(webhook, { method: 'POST', headers: auth,
    query: { action: 'cancel_reservation', restaurant_id: h.R }, body: { reservation_id: A.code } });
  const afterCancel = await h.snapshot();
  out.push({ step: 'cancel Ana by code from another number', expected: 'refused, unchanged',
    observed: `${cancel.statusCode} success=${cancel.body?.success} status ${before.find(r => r.reservation_id === A.code).status} -> ${afterCancel.find(r => r.reservation_id === A.code).status}` });

  await h.reset();
  const mod = await h.call(webhook, { method: 'POST', headers: auth,
    query: { action: 'modify_reservation', restaurant_id: h.R }, body: { reservation_id: A.code, new_time: '03:00', new_party_size: 40 } });
  const afterMod = (await h.snapshot()).find(r => r.reservation_id === A.code);
  out.push({ step: 'modify Ana to 03:00 for 40 from another number', expected: 'refused, unchanged',
    observed: `${mod.statusCode} success=${mod.body?.success} now ${afterMod.time} x${afterMod.party_size}` });

  // Control: the same request without the restaurant secret is rejected.
  const noauth = await h.call(webhook, { method: 'POST', headers: { 'x-caller-number': '+5511999990000' },
    query: { action: 'cancel_reservation', restaurant_id: h.R }, body: { reservation_id: A.code } });
  out.push({ step: 'control: same cancel without the secret', expected: '403', observed: String(noauth.statusCode) });
  console.table(out);
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
