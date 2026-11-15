'use strict';
// R8 — Google's BatchAvailabilityLookup offers only slots the booking accepts.
// Property oracle: every slot the lookup offers is passed to the real booking
// function (book_guest_reservation, source 'google') inside a transaction that
// is rolled back; it must answer 'created'. Restaurant: São Paulo, split
// service (lunch 12:00-15:00, dinner 19:00-23:00), two tables of 4 (8 seats),
// advance_booking_days 10, max_party_size 6; a 'Seated' party of 8 holds day+2
// at 20:00. Expected outcomes (written before running):
//   L1 every offered slot is bookable              -> refused = 0
//   L2 slots in the lunch gap (15:00-19:00)        -> 0 offered
//   L3 slots after the last seating (21:30 dinner) -> 0 offered
//   L4 slots overlapping the seated party (day+2)  -> 0 offered
//   L5 slots past the 10-day window, or in the past -> 0 offered
//   L6 a party of 7 (limit 6)                      -> 0 slots
//   L7 control: day+1 19:00 for 2                  -> offered
const process_ = process;
process.env.GOOGLE_BOOKING_SECRET = 'audit-google-secret-0001';
const h = require('./harness.cjs');
const { Client } = require('pg');
const google = h.load('api/google-booking/server.js');
const T2 = '22222222-2222-4222-8222-222222222222';
const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, periods: [{ open: '12:00', close: '15:00' }, { open: '19:00', close: '23:00' }] }]));
const localDay = n => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const localNow = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).replace(' ', 'T');

async function fixture() {
  await h.pool.query('TRUNCATE public.reservations, public.tables, restaurant.restaurant_config CASCADE');
  await h.pool.query(`INSERT INTO restaurant.restaurant_config (id, business_hours, timezone, reservation_settings)
    VALUES ($1, $2::jsonb, 'America/Sao_Paulo', '{"advance_booking_days": 10, "max_party_size": 6}')`, [h.R, JSON.stringify(hours)]);
  await h.pool.query(`INSERT INTO public.tables (id, table_number, capacity, restaurant_id) VALUES ($1,1,4,$3), ($2,2,4,$3)`, [h.T1, T2, h.R]);
  await h.pool.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, party_size, date, time, status,
    table_ids, restaurant_id, source) VALUES ('RES-R8-SEATED001','Mesa Cheia','+5511960000001',8,$1,'20:00','Seated','{}',$2,'manual')`,
    [localDay(2), h.R]);
}
const lookup = (party, start, end) => h.call(google, { method: 'POST', query: { action: 'BatchAvailabilityLookup' },
  headers: { authorization: `Bearer ${process_.env.GOOGLE_BOOKING_SECRET}` },
  body: { merchant_id: h.R, party_size: party, slot_time_range: { start_date: start, end_date: end } } });
const split = s => { const [date, rest] = s.start_time.split('T'); return { date, time: rest.slice(0, 5) }; };
const mins = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

(async () => {
  const out = [];
  await fixture();
  const res = await lookup(2, localDay(-1), localDay(14));
  const offered = (res.body?.slots || []).map(split);
  const c = new Client({ host: process.env.AUDIT_SOCK, port: 55441, user: 'postgres', database: 'audit' }); await c.connect();
  const refusals = {};
  for (const [i, s] of offered.entries()) {
    await c.query('BEGIN');
    const { rows: [{ r }] } = await c.query(`SELECT public.book_guest_reservation(p_restaurant_id => $1::uuid, p_source => 'google',
      p_external_id => NULL, p_reservation_id => $2, p_date => $3::date, p_time => $4::time, p_party_size => 2,
      p_customer_name => 'Prova', p_customer_phone => '+5511900000000') AS r`, [h.R, `RES-R8-PROBE${String(i).padStart(4, '0')}`, s.date, s.time]);
    await c.query('ROLLBACK');
    if (r.status !== 'created') refusals[r.status] = (refusals[r.status] || 0) + 1;
  }
  await c.end();
  const refused = Object.values(refusals).reduce((a, b) => a + b, 0);
  out.push({ case: 'L1 every offered slot is bookable', expected: 'refused = 0',
    observed: `HTTP ${res.statusCode} offered=${offered.length} refused=${refused} ${JSON.stringify(refusals)}` });
  out.push({ case: 'L2 lunch gap 15:00-19:00', expected: '0 offered', observed: `${offered.filter(s => mins(s.time) >= 15 * 60 && mins(s.time) < 19 * 60).length} offered` });
  out.push({ case: 'L3 after last seating (dinner > 21:30)', expected: '0 offered', observed: `${offered.filter(s => mins(s.time) > 21 * 60 + 30).length} offered` });
  out.push({ case: 'L4 overlapping the seated party, day+2', expected: '0 offered',
    observed: `${offered.filter(s => s.date === localDay(2) && mins(s.time) > 20 * 60 - 90 && mins(s.time) < 20 * 60 + 90).length} offered` });
  out.push({ case: 'L5 past the 10-day window, or in the past', expected: '0 offered',
    observed: `${offered.filter(s => s.date > localDay(10) || `${s.date}T${s.time}` < localNow()).length} offered` });
  const big = await lookup(7, localDay(1), localDay(3));
  out.push({ case: 'L6 a party of 7 (limit 6)', expected: '0 slots', observed: `HTTP ${big.statusCode} ${(big.body?.slots || []).length} slots` });
  out.push({ case: 'L7 control: day+1 19:00 for 2', expected: 'offered', observed: offered.some(s => s.date === localDay(1) && s.time === '19:00') ? 'offered' : 'not offered' });
  console.table(out);
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
