'use strict';
// R1 — customer portal (/api/customer-reservation) versus the guarded RPC.
// Expected outcomes are written BEFORE running. Property: a guest change must
// be refused when it double-books a table, leaves business hours, exceeds
// capacity, or targets a finished visit; a refusal changes nothing.
const h = require('./harness.cjs');
const portal = h.load('api/customer-reservation.js');
const { A, B, C } = h.GUESTS;

const digits = p => p.replace(/\D/g, '');
const cases = [
  { id: 'S1 move B onto A (same table, overlapping)', body: { reservation_id: B.code, customer_phone: B.phone, time: '19:30' },
    rpc: [B, { time: '19:30' }], expect: 'refused' },
  { id: 'S2 move B to 03:00 (closed)', body: { reservation_id: B.code, customer_phone: B.phone, time: '03:00' },
    rpc: [B, { time: '03:00' }], expect: 'refused' },
  { id: 'S3 grow B to 40 guests (table seats 4)', body: { reservation_id: B.code, customer_phone: B.phone, party_size: 40 },
    rpc: [B, { party_size: 40 }], expect: 'refused' },
  { id: 'S4 reschedule C, a completed visit', body: { reservation_id: C.code, customer_phone: C.phone, date: h.DAY, time: '22:00' },
    rpc: [C, { date: h.DAY, time: '22:00' }], expect: 'refused' },
  { id: 'S5 cancel C, a completed visit', cancel: true, body: { reservation_id: C.code, customer_phone: C.phone },
    rpcCancel: C, expect: 'refused' },
  { id: 'S6 control: move B to 21:30 (free, open)', body: { reservation_id: B.code, customer_phone: B.phone, time: '21:30' },
    rpc: [B, { time: '21:30' }], expect: 'accepted' },
];

(async () => {
  const rows = [];
  for (const c of cases) {
    // Portal path
    await h.reset();
    const before = JSON.stringify(await h.snapshot());
    const res = await h.call(portal, { method: 'POST', query: { action: c.cancel ? 'cancel' : 'modify' }, body: c.body });
    const after = JSON.stringify(await h.snapshot());
    const portalChanged = before !== after;
    const portalOver = (await h.overbookedTables()).length;
    // Reference path: the repository's guarded transition, same input.
    await h.reset();
    const g = c.rpc ? c.rpc[0] : c.rpcCancel;
    const { rows: [{ r }] } = await h.pool.query(
      'SELECT public.mutate_guest_reservation($1::uuid, $2, $3, $4, $5::jsonb) AS r',
      [h.R, digits(g.phone), g.code, c.cancel ? 'cancel' : 'modify', JSON.stringify(c.rpc ? c.rpc[1] : {})]);
    const rpcChanged = before !== JSON.stringify(await h.snapshot());
    const portalVerdict = portalChanged ? 'accepted' : 'refused';
    rows.push({ case: c.id, expected: c.expect, portal: `${res.statusCode} ${portalVerdict}${portalOver ? ` OVERBOOKED x${portalOver}` : ''}`,
      rpc: `${r.success ? 'ok' : r.error.code} ${rpcChanged ? 'accepted' : 'refused'}`,
      portal_matches_expectation: portalVerdict === c.expect, rpc_matches_expectation: (rpcChanged ? 'accepted' : 'refused') === c.expect });
  }
  console.table(rows);
  const failures = rows.filter(r => !r.portal_matches_expectation).length;
  const controlBroken = rows.filter(r => !r.rpc_matches_expectation).length;
  console.log(JSON.stringify({ portal_violations: failures, reference_mismatches: controlBroken }));
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
