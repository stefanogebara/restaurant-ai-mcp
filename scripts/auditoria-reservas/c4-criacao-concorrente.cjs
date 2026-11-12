'use strict';
// C4 — two guest bookings created at the same time (voice + voice, voice + booking
// page). Barriers are explicit: a gate that holds every handler at its write step
// until all racers have finished their availability check, and an open
// transaction that holds a booking uncommitted. Never sleeps as synchronization.
// Fixture: two tables of 4 (8 seats), open 18:00-23:00, 90-minute sittings, a
// date 7 days ahead. A WhatsApp booking of 4 without a table is already at 19:00.
// Expected outcomes (written before running):
//   V1 voice + voice, 4 each, 4 seats left  -> one accepted, one refused, <= 8 seats
//   V2 voice + page, 4 each, 4 seats left   -> one accepted, one refused, <= 8 seats
//   V3 voice + voice, 4 each, empty room    -> both accepted on DIFFERENT tables
//   D0 two plain INSERTs, both uncommitted  -> they do not wait for each other (root cause)
//   D1 booking function, first call uncommitted -> second waits on the lock, then refused
//   D2 same voice external_id twice, first uncommitted -> one row, second gets 'existing'
// Run it on main to see the overbooking, and on the fix to see the refusal.
const h = require('./harness.cjs');
const { Client } = require('pg');
const tools = h.load('api/_lib/tool-handlers.js');
const portal = h.load('api/portal.js');

const T2 = '22222222-2222-4222-8222-222222222222';
const DAY = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, open_time: '18:00', close_time: '23:00' }]));
const restaurant = { id: h.R, restaurant_name: 'Casa Teste', business_hours: hours, timezone: 'America/Sao_Paulo',
  whatsapp_enabled: false, average_dining_duration_minutes: 90 };
const conn = () => { const c = new Client({ host: process.env.AUDIT_SOCK, port: 55441, user: 'postgres', database: 'audit' }); return c.connect().then(() => c); };

async function fixture({ seed = true } = {}) {
  await h.pool.query('ALTER TABLE restaurant.restaurant_config ADD COLUMN IF NOT EXISTS whatsapp_phone_number text');
  await h.pool.query('TRUNCATE public.reservations, public.tables, restaurant.restaurant_config CASCADE');
  await h.pool.query(`INSERT INTO restaurant.restaurant_config (id, business_hours, timezone) VALUES ($1, $2::jsonb, 'America/Sao_Paulo')`,
    [h.R, JSON.stringify(hours)]);
  await h.pool.query(`INSERT INTO public.tables (id, table_number, capacity, restaurant_id) VALUES ($1,1,4,$3), ($2,2,4,$3)`, [h.T1, T2, h.R]);
  if (seed) {
    await h.pool.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, party_size, date, time, status,
      table_ids, restaurant_id, source) VALUES ('RES-C4-WHATSAPP0','Wanda Zap','+5511960000000',4,$1,'19:00','confirmed','{}',$2,'whatsapp_ai')`, [DAY, h.R]);
  }
}
const seatsAt19 = async () => (await h.pool.query(`SELECT coalesce(sum(party_size),0)::int s FROM public.reservations
  WHERE lower(status) IN ('confirmed','pending','seated') AND (date + time) < ($1::date + time '19:00') + interval '90 minutes'
  AND (date + time) + interval '90 minutes' > ($1::date + time '19:00')`, [DAY])).rows[0].s;
const fnExists = async () => (await h.pool.query(`SELECT to_regprocedure('public.book_guest_reservation(uuid,text,text,text,date,time without time zone,integer,text,text,text,text,text[],text,text,numeric)') IS NOT NULL AS ok`)).rows[0].ok;

// Gate: every racer stops at its write (an INSERT into reservations, or the
// booking function) until all racers got there, i.e. all checks already ran.
// A racer that ends without writing (refused earlier) opens the gate too.
function holdWrites(n) {
  let arrived = 0, open; const gate = new Promise(r => { open = r; });
  const arrive = () => { if (++arrived >= n) open(); return gate; };
  const from = h.fake.from, rpc = h.fake.rpc;
  h.fake.from = table => {
    const q = from(table);
    if (table === 'reservations') { const run = q.run.bind(q); q.run = async () => { if (q.op === 'insert') await arrive(); return run(); }; }
    return q;
  };
  h.fake.rpc = async (fn, args) => { if (fn === 'book_guest_reservation') await arrive(); return rpc(fn, args); };
  return { done: () => open(), restore: () => { h.fake.from = from; h.fake.rpc = rpc; } };
}
async function race(...racers) {
  const g = holdWrites(racers.length);
  try { return await Promise.all(racers.map(r => r().finally(g.done))); } finally { g.restore(); }
}
const voice = (phone, name) => () => tools.createReservation(h.R, restaurant, { date: DAY, time: '19:00', party_size: 4,
  customer_name: name, customer_phone: phone });
const page = (phone, name) => () => h.call(portal, { method: 'POST', query: { action: 'reserve' },
  body: { restaurant_id: h.R, customer_name: name, customer_phone: phone, party_size: 4, date: DAY, time: '19:00' } });
const verdictVoice = r => (r.success ? 'accepted' : `refused(${r.error})`);
const verdictPage = r => (r.statusCode === 201 ? 'accepted' : `refused(${r.statusCode})`);
const tablesOf = async () => (await h.pool.query(`SELECT array_to_string(table_ids, ',') t FROM public.reservations
  WHERE source = 'voice_ai' ORDER BY created_at`)).rows.map(r => (r.t === h.T1 ? 'T1' : r.t === T2 ? 'T2' : r.t || '-')).join('+');

// Block until `client` waits on a lock (bounded poll of a condition, not a sleep-as-sync).
async function waitsOnLock(pending) {
  let waiting = 0, done = false; pending.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 300 && !waiting && !done; i++) {
    ({ rows: [{ waiting }] } = await h.pool.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = 'audit'`));
    if (!waiting) await new Promise(r => setTimeout(r, 10));
  }
  return waiting >= 1;
}
const book = (c, { ext = null, source = 'voice_ai', id, phone }) => c.query(`SELECT public.book_guest_reservation(
  p_restaurant_id => $1::uuid, p_source => $2, p_external_id => $3, p_reservation_id => $4, p_date => $5::date,
  p_time => '19:00'::time, p_party_size => 4, p_customer_name => 'Cliente Prova', p_customer_phone => $6) AS r`,
  [h.R, source, ext, id, DAY, phone]).then(x => x.rows[0].r);
const insertPlain = (c, id, phone) => c.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone,
  party_size, date, time, status, table_ids, restaurant_id, source) VALUES ($1,'Cliente Direto',$2,4,$3,'19:00','confirmed','{}',$4,'voice_ai')`,
  [id, phone, DAY, h.R]);

(async () => {
  const out = [];
  const hasFn = await fnExists();

  await fixture();
  const [v1a, v1b] = await race(voice('+5511970000001', 'Voz Um'), voice('+5511970000002', 'Voz Dois'));
  out.push({ case: 'V1 voice + voice, 4 seats left', expected: 'one accepted, one refused, <=8 seats',
    observed: `${verdictVoice(v1a)} / ${verdictVoice(v1b)} seats@19:00=${await seatsAt19()} of 8` });

  await fixture();
  const [v2a, v2b] = await race(voice('+5511970000003', 'Voz Tres'), page('+5511980000004', 'Pagina Quatro'));
  out.push({ case: 'V2 voice + booking page, 4 seats left', expected: 'one accepted, one refused, <=8 seats',
    observed: `voice=${verdictVoice(v2a)} page=${verdictPage(v2b)} seats@19:00=${await seatsAt19()} of 8` });

  await fixture({ seed: false });
  const [v3a, v3b] = await race(voice('+5511970000005', 'Voz Cinco'), voice('+5511970000006', 'Voz Seis'));
  const clash = (await h.overbookedTables()).length;
  out.push({ case: 'V3 voice + voice, empty room (table choice)', expected: 'both accepted, different tables, 0 clashes',
    observed: `${verdictVoice(v3a)} / ${verdictVoice(v3b)} tables=${await tablesOf()} table_clashes=${clash}` });

  // D0: the old write. Two uncommitted INSERTs both take only FOR KEY SHARE on
  // the restaurant row, which never conflicts with another FOR KEY SHARE.
  await fixture();
  const a = await conn(), b = await conn();
  await a.query('BEGIN'); await insertPlain(a, 'RES-C4-PLAIN-A', '+5511990000001');
  await b.query('BEGIN'); const pb = insertPlain(b, 'RES-C4-PLAIN-B', '+5511990000002');
  const bWaited = await waitsOnLock(pb); await pb; await a.query('COMMIT'); await b.query('COMMIT');
  out.push({ case: 'D0 two plain INSERTs, both uncommitted', expected: 'second does not wait (the race)',
    observed: `second_waited_on_lock=${bWaited} seats@19:00=${await seatsAt19()} of 8` });

  if (!hasFn) {
    out.push({ case: 'D1/D2 booking function', expected: 'lock + idempotency', observed: 'book_guest_reservation absent (before the fix)' });
  } else {
    // D1: the first booking holds the restaurant lock uncommitted; the second must wait, then see it.
    await fixture();
    await a.query('BEGIN'); const r1 = await book(a, { id: 'RES-C4-LOCK-A', phone: '+5511990000003' });
    await b.query('BEGIN'); const p2 = book(b, { id: 'RES-C4-LOCK-B', phone: '+5511990000004' });
    const waited = await waitsOnLock(p2); await a.query('COMMIT'); const r2 = await p2; await b.query('COMMIT');
    out.push({ case: 'D1 function, first call uncommitted', expected: 'second waits, then unavailable, 8 seats',
      observed: `first=${r1.status} second=${r2.status} second_waited_on_lock=${waited} seats@19:00=${await seatsAt19()} of 8` });

    // D2: a provider retry of the same call (same external_id) while the first is uncommitted.
    await fixture({ seed: false });
    await a.query('BEGIN'); const k1 = await book(a, { ext: 'voice:conv_repro_0001', id: 'RES-C4-KEY-A', phone: '+5511990000005' });
    await b.query('BEGIN'); const pk = book(b, { ext: 'voice:conv_repro_0001', id: 'RES-C4-KEY-B', phone: '+5511990000005' });
    const kWaited = await waitsOnLock(pk); await a.query('COMMIT'); const k2 = await pk; await b.query('COMMIT');
    const rows = (await h.pool.query(`SELECT count(*)::int n FROM public.reservations WHERE external_id = 'voice:conv_repro_0001'`)).rows[0].n;
    out.push({ case: 'D2 same voice external_id twice', expected: 'one row; second existing, same code',
      observed: `first=${k1.status} second=${k2.status} same_code=${k1.reservation_id === k2.reservation_id} waited=${kWaited} rows=${rows}` });
  }
  await a.end(); await b.end();
  console.table(out);
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
