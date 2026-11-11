'use strict';
// C1/C2 — concurrency of mutate_guest_reservation, with explicit barriers
// (an open transaction that holds its write), never sleeps-as-synchronization.
// Fixture for these cases: two tables of 4 (T1 and T2), no table_ids on the
// bookings, so admission is the aggregate-seat rule (8 seats).
// C1 expected: two guests racing for the same last 4 seats -> exactly one wins.
// C2 expected (property): no writer sequence yields more than 8 seats in use.
// C3 expected: repeating a committed modify/cancel is a no-op success.
const h = require('./harness.cjs');
const { Client } = require('pg');
const T2 = '22222222-2222-4222-8222-222222222222';
const conn = () => { const c = new Client({ host: process.env.AUDIT_SOCK, port: 55441, user: 'postgres', database: 'audit' }); return c.connect().then(() => c); };
const digits = p => p.replace(/\D/g, '');
const call = (c, g, action, changes = {}) => c.query('SELECT public.mutate_guest_reservation($1::uuid,$2,$3,$4,$5::jsonb) AS r',
  [h.R, digits(g.phone), g.code, action, JSON.stringify(changes)]).then(x => x.rows[0].r);
const seatsAt = async (time) => (await h.pool.query(`SELECT coalesce(sum(party_size),0)::int s FROM public.reservations
  WHERE lower(status) IN ('confirmed','pending','seated') AND (date + time) < ($1::date + $2::time) + interval '90 minutes'
  AND (date + time) + interval '90 minutes' > ($1::date + $2::time)`, [h.DAY, time])).rows[0].s;

async function fixture() {
  await h.reset();
  await h.pool.query(`INSERT INTO public.tables (id, table_number, capacity, restaurant_id) VALUES ($1, 2, 4, $2)`, [T2, h.R]);
  await h.pool.query(`UPDATE public.reservations SET table_ids = '{}'`);
  // A occupies 4 of 8 seats at 19:00. B (21:00) and a new guest D (21:00) both want 19:00.
  await h.pool.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, party_size, date, time, status,
    table_ids, restaurant_id) VALUES ('RES-20261111-DDDDDDDDDDDD','Dora Prova','+5511944440000',4,$1,'21:00','confirmed','{}',$2)`, [h.DAY, h.R]);
}
const D = { code: 'RES-20261111-DDDDDDDDDDDD', phone: '+5511944440000' };

(async () => {
  const out = [];
  // C1: B holds its modify open (barrier); D's modify must wait on the restaurant lock, then see B.
  await fixture();
  const b = await conn(), d = await conn();
  await b.query('BEGIN'); const rb = await call(b, h.GUESTS.B, 'modify', { time: '19:00' });
  await d.query('BEGIN');
  let dDone = false; const pd = call(d, D, 'modify', { time: '19:00' }).then(r => { dDone = true; return r; });
  // Barrier: proceed only once D is observably blocked on a lock (bounded poll of a condition).
  let waiting = 0;
  for (let i = 0; i < 200 && !waiting && !dDone; i++) {
    ({ rows: [{ waiting }] } = await h.pool.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = 'audit'`));
    if (!waiting) await new Promise(r => setTimeout(r, 10));
  }
  await b.query('COMMIT'); const rd = await pd; await d.query('COMMIT');
  out.push({ case: 'C1 two RPC modifies race for last 4 seats', expected: 'one ok, one unavailable, <=8 seats',
    observed: `B=${rb.success ? 'ok' : rb.error.code} D=${rd.success ? 'ok' : rd.error.code} D_waited_on_lock=${waiting >= 1} seats@19:00=${await seatsAt('19:00')}` });
  await b.end(); await d.end();

  // C2: a writer that does not take the restaurant lock (a plain INSERT, as the
  // non-RPC paths do) holds an uncommitted 4-seat booking; the RPC cannot see it.
  await fixture();
  const w = await conn(), r = await conn();
  await w.query('BEGIN');
  await w.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, party_size, date, time, status, table_ids, restaurant_id)
    VALUES ('RES-20261111-EEEEEEEEEEEE','Eva Direta','+5511955550000',4,$1,'19:00','confirmed','{}',$2)`, [h.DAY, h.R]);
  let rDone = false; const pr = call(r, h.GUESTS.B, 'modify', { time: '19:00' }).then(x => { rDone = true; return x; });
  let blocked = 0;
  for (let i = 0; i < 200 && !blocked && !rDone; i++) {
    ({ rows: [{ blocked }] } = await h.pool.query(`SELECT count(*)::int AS blocked FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = 'audit'`));
    if (!blocked) await new Promise(res => setTimeout(res, 10));
  }
  await w.query('COMMIT');
  const rr = await pr;
  out.push({ case: 'C2 RPC modify while a plain INSERT is uncommitted', expected: '<=8 seats at 19:00',
    observed: `RPC_blocked_by_insert=${blocked >= 1} RPC=${rr.success ? 'ok' : rr.error.code} seats@19:00=${await seatsAt('19:00')}` });
  // Other ordering: insert commits BEFORE the RPC reads -> RPC must refuse.
  await fixture();
  await h.pool.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, party_size, date, time, status, table_ids, restaurant_id)
    VALUES ('RES-20261111-EEEEEEEEEEEE','Eva Direta','+5511955550000',4,$1,'19:00','confirmed','{}',$2)`, [h.DAY, h.R]);
  const rr2 = await call(r, h.GUESTS.B, 'modify', { time: '19:00' });
  out.push({ case: 'C2b same, insert committed first', expected: 'RPC unavailable, 8 seats',
    observed: `RPC=${rr2.success ? 'ok' : rr2.error.code} seats@19:00=${await seatsAt('19:00')}` });
  await w.end(); await r.end();

  // C3: lost response -> the guest repeats the same explicit action.
  await fixture();
  const c = await conn();
  const m1 = await call(c, h.GUESTS.B, 'modify', { time: '21:30' }), m2 = await call(c, h.GUESTS.B, 'modify', { time: '21:30' });
  const k1 = await call(c, h.GUESTS.A, 'cancel'), k2 = await call(c, h.GUESTS.A, 'cancel');
  out.push({ case: 'C3 repeat modify and cancel', expected: 'changed true then false, success both',
    observed: `modify ${m1.changed}/${m2.changed} ok=${m1.success && m2.success}; cancel ${k1.changed}/${k2.changed} ok=${k1.success && k2.success}` });
  await c.end();
  console.table(out);
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
