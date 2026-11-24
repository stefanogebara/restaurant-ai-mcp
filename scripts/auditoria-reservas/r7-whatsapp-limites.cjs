'use strict';
// R7 — WhatsApp availability against the booking rule. The WhatsApp booking
// (book_whatsapp_reservation -> book_guest_reservation) reads the restaurant's
// own limits; check_availability must not offer what the booking refuses.
// Restaurant: São Paulo, open 18:00-23:00, two tables of 4 (8 seats),
// advance_booking_days 30, max_party_size 6. The inbound context carries what
// conversation.js passes to the tool. Expected outcomes (written before running):
//   W1 availability 40 days ahead          -> not available (TOO_FAR); booking refuses too
//   W2 availability for 7 guests           -> not available (PARTY_TOO_LARGE); booking refuses too
//   W3 availability yesterday 19:00        -> not available (PAST_DATE); booking refuses too
//   W4 room filled by 'pending' bookings   -> not available; booking refuses too
//   W5 control: 7 days ahead, 2 guests     -> available; booking created
const crypto = require('crypto');
const h = require('./harness.cjs');
const tools = h.load('api/_app/_services/whatsapp/reservation-tools.js');
const T2 = '22222222-2222-4222-8222-222222222222';
const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, open_time: '18:00', close_time: '23:00' }]));
const settings = { advance_booking_days: 30, max_party_size: 6 };
const localDay = n => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

async function fixture({ pending = false } = {}) {
  await h.pool.query('TRUNCATE public.reservations, public.tables, restaurant.restaurant_config CASCADE');
  await h.pool.query(`INSERT INTO restaurant.restaurant_config (id, business_hours, timezone, reservation_settings)
    VALUES ($1, $2::jsonb, 'America/Sao_Paulo', $3::jsonb)`, [h.R, JSON.stringify(hours), JSON.stringify(settings)]);
  await h.pool.query(`INSERT INTO public.tables (id, table_number, capacity, restaurant_id) VALUES ($1,1,4,$3), ($2,2,4,$3)`, [h.T1, T2, h.R]);
  if (pending) {
    await h.pool.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, party_size, date, time, status,
      table_ids, restaurant_id, source) VALUES ('RES-R7-PENDING01','Pendente','+5511960000001',8,$1,'19:00','Pending','{}',$2,'online_portal')`,
      [localDay(7), h.R]);
  }
}
const session = { restaurant: { id: h.R, average_dining_duration_minutes: 90 } };
const inbound = { timezone: 'America/Sao_Paulo', averageDiningDurationMinutes: 90, reservationSettings: settings };
const ask = (date, party = 2, time = '19:00') => tools.executeTool('check_availability', { date, time, party_size: party }, session, inbound);
const book = (date, party = 2, time = '19:00', tag = 'x') => h.pool.query(
  `SELECT public.book_whatsapp_reservation($1::uuid, $2, $3, $4::date, $5::time, $6, 'Cliente Zap', '+5511970000077', NULL, NULL) AS r`,
  [h.R, 'wa:v1:' + crypto.createHash('sha256').update(`r7-${tag}`).digest('hex'), `RES-R7-${tag.toUpperCase().padEnd(10, 'X').slice(0, 10)}`,
    date, time, party]).then(x => x.rows[0].r.status);
const avail = r => (r.available ? 'available' : `not available(${r.error || r.reason || 'capacity'})`);

(async () => {
  const out = [];
  await fixture();
  out.push({ case: 'W1 40 days ahead (limit 30)', expected: 'not available; booking refused', observed: `${avail(await ask(localDay(40)))}; booking=${await book(localDay(40), 2, '19:00', 'w1')}` });
  out.push({ case: 'W2 7 guests (limit 6)', expected: 'not available; booking refused', observed: `${avail(await ask(localDay(7), 7))}; booking=${await book(localDay(7), 7, '19:00', 'w2')}` });
  out.push({ case: 'W3 yesterday 19:00', expected: 'not available; booking refused', observed: `${avail(await ask(localDay(-1)))}; booking=${await book(localDay(-1), 2, '19:00', 'w3')}` });
  await fixture({ pending: true });
  const w4 = await ask(localDay(7));
  out.push({ case: "W4 room filled by a 'Pending' booking", expected: 'not available; booking refused',
    observed: `${avail(w4)} remaining=${w4.details?.remaining_capacity_at_time}; booking=${await book(localDay(7), 2, '19:00', 'w4')}` });
  await fixture();
  out.push({ case: 'W5 control: 7 days ahead, 2 guests', expected: 'available; booking created', observed: `${avail(await ask(localDay(7)))}; booking=${await book(localDay(7), 2, '19:00', 'w5')}` });
  console.table(out);
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
