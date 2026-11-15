'use strict';
// R10 — the booking page's time list (GET /api/portal?action=availability)
// agrees with the booking. For each date, every half hour the list shows is
// compared with the real booking function (book_guest_reservation) run in a
// transaction that is rolled back; a half hour the list leaves out must not be
// one the booking accepts. Then the page's own booking step (POST reserve)
// must accept the times the list offers. Restaurant: São Paulo, lunch
// 12:00-15:00 and dinner 19:00-23:00, two tables of 4 (8 seats),
// advance_booking_days 10, max_party_size 6; a 'Seated' party of 8 holds day+2
// at 20:00; table 1 is occupied right now. Dates: day+1, day+2, day+11.
// Expected outcomes (written before running):
//   P10a listed as available, booking refuses  -> 0
//   P10b booking accepts, list says no or omits -> 0
//   P10c a party of 7 (limit 6) gets no available time -> 0 available
//   P10d the page books the first available time of each date -> 201 each
const h = require('./harness.cjs');
const { Client } = require('pg');
const portal = h.load('api/portal.js');
const T2 = '22222222-2222-4222-8222-222222222222';
const settings = { advance_booking_days: 10, max_party_size: 6 };
const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, periods: [{ open: '12:00', close: '15:00' }, { open: '19:00', close: '23:00' }] }]));
const localDay = n => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const clock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

async function fixture() {
  await h.pool.query('ALTER TABLE restaurant.restaurant_config ADD COLUMN IF NOT EXISTS whatsapp_phone_number text');
  await h.pool.query('TRUNCATE public.reservations, public.tables, restaurant.restaurant_config CASCADE');
  await h.pool.query(`INSERT INTO restaurant.restaurant_config (id, business_hours, timezone, reservation_settings)
    VALUES ($1, $2::jsonb, 'America/Sao_Paulo', $3::jsonb)`, [h.R, JSON.stringify(hours), JSON.stringify(settings)]);
  await h.pool.query(`INSERT INTO public.tables (id, table_number, capacity, restaurant_id, status) VALUES ($1,1,4,$3,'occupied'), ($2,2,4,$3,'available')`, [h.T1, T2, h.R]);
  await h.pool.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, party_size, date, time, status,
    table_ids, restaurant_id, source) VALUES ('RES-R10-SEATED01','Mesa Cheia','+5511960000001',8,$1,'20:00','Seated','{}',$2,'manual')`,
    [localDay(2), h.R]);
}
const list = (date, party = 2) => h.call(portal, { method: 'GET', query: { action: 'availability', restaurant_id: h.R, date, party_size: String(party) } });
const reserve = (date, time, phone) => h.call(portal, { method: 'POST', query: { action: 'reserve' },
  body: { restaurant_id: h.R, customer_name: 'Pagina Prova', customer_phone: phone, party_size: 2, date, time } });

(async () => {
  await fixture();
  const probe = new Client({ host: process.env.AUDIT_SOCK, port: 55441, user: 'postgres', database: 'audit' }); await probe.connect();
  let n = 0;
  const bookable = async (date, time, party = 2) => {
    await probe.query('BEGIN');
    const { rows: [{ r }] } = await probe.query(`SELECT public.book_guest_reservation(p_restaurant_id => $1::uuid, p_source => 'online_portal',
      p_external_id => NULL, p_reservation_id => $2, p_date => $3::date, p_time => $4::time, p_party_size => $5,
      p_customer_name => 'Prova', p_customer_phone => '+5511900000000') AS r`, [h.R, `RES-R10-PROBE${String(++n).padStart(5, '0')}`, date, time, party]);
    await probe.query('ROLLBACK');
    return r.status === 'created';
  };

  const falseYes = [], falseNo = [];
  let listedAvailable = 0;
  const firstAvailable = {};
  for (const d of [1, 2, 11]) {
    const date = localDay(d);
    const res = await list(date);
    const shown = new Map((res.body?.slots || []).map(s => [s.time, s.available === true]));
    for (let m = 0; m < 24 * 60; m += 30) {
      const time = clock(m);
      const said = shown.get(time) === true;
      const truth = await bookable(date, time);
      if (said) { listedAvailable++; firstAvailable[date] = firstAvailable[date] || time; }
      if (said && !truth) falseYes.push(`${date.slice(5)} ${time}`);
      if (!said && truth) falseNo.push(`${date.slice(5)} ${time}`);
    }
  }
  const big = await list(localDay(1), 7);
  await probe.end();

  const booked = [];
  for (const [i, [date, time]] of Object.entries(firstAvailable).entries()) {
    await fixture();
    const r = await reserve(date, time, `+55119800000${String(i).padStart(2, '0')}`);
    booked.push(`${date.slice(5)} ${time}=${r.statusCode}`);
  }

  const show = list_ => `${list_.length}${list_.length ? ` e.g. ${list_.slice(0, 4).join(', ')}` : ''}`;
  console.table([
    { case: 'P10a listed as available, booking refuses', expected: '0', observed: `${show(falseYes)} (of ${listedAvailable} listed available)` },
    { case: 'P10b booking accepts, list says no or omits', expected: '0', observed: show(falseNo) },
    { case: 'P10c a party of 7 (limit 6)', expected: '0 available', observed: `HTTP ${big.statusCode} ${(big.body?.slots || []).filter(s => s.available).length} available` },
    { case: 'P10d the page books the first listed time of each date', expected: '201 each', observed: booked.join(', ') || 'none listed' },
  ]);
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
