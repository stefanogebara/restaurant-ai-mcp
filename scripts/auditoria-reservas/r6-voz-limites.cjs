'use strict';
// R6 — voice availability and creation follow the restaurant's own booking
// limits (reservation_settings), the same ones book_guest_reservation enforces.
// Found live on 14/11/2026: the Trattoria E2E Teste agent said "temos
// disponibilidade" for a date 46 days ahead, then the booking was refused as too
// far (the restaurant books 30 days ahead).
// Restaurant as the voice loader returns it (restaurant-loader.getRestaurantById):
// São Paulo, open 18:00-23:00, two tables of 4, advance_booking_days 30,
// max_party_size 6. Expected outcomes (written before running):
//   A1 availability 40 days ahead      -> not available (TOO_FAR)
//   A2 booking 40 days ahead           -> refused, no row
//   A3 availability 30 days ahead      -> available; booking it -> created (the edge agrees)
//   A4 availability for 7 guests       -> not available (PARTY_TOO_LARGE)
//   A5 control: availability 7 days    -> available
const h = require('./harness.cjs');
const tools = h.load('api/_lib/tool-handlers.js');
const { getRestaurantById } = h.load('api/_lib/restaurant-loader.js');
const T2 = '22222222-2222-4222-8222-222222222222';
const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, open_time: '18:00', close_time: '23:00' }]));
const localDay = n => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

async function fixture() {
  await h.pool.query('TRUNCATE public.reservations, public.tables, restaurant.restaurant_config CASCADE');
  await h.pool.query(`INSERT INTO restaurant.restaurant_config (id, business_hours, timezone, reservation_settings)
    VALUES ($1, $2::jsonb, 'America/Sao_Paulo', '{"advance_booking_days": 30, "max_party_size": 6}')`, [h.R, JSON.stringify(hours)]);
  await h.pool.query(`INSERT INTO public.tables (id, table_number, capacity, restaurant_id) VALUES ($1,1,4,$3), ($2,2,4,$3)`, [h.T1, T2, h.R]);
}
const rows = async () => (await h.pool.query('SELECT count(*)::int n FROM public.reservations')).rows[0].n;
const avail = r => (r.available ? 'available' : `not available(${r.error || (r.details?.is_closed ? 'closed' : 'capacity')})`);
const booked = r => (r.success ? 'created' : `refused(${r.error})`);

(async () => {
  const out = [];
  await fixture();
  const restaurant = { ...(await getRestaurantById(h.R)), whatsapp_enabled: false };
  const ask = (date, party = 2) => tools.checkAvailability(h.R, restaurant, { date, time: '20:00', party_size: party });
  const book = date => tools.createReservation(h.R, restaurant, { date, time: '20:00', party_size: 2,
    customer_name: 'Cliente Limite', customer_phone: '+5511970000010' });

  out.push({ case: 'A1 availability 40 days ahead (limit 30)', expected: 'not available (TOO_FAR)', observed: avail(await ask(localDay(40))) });
  const a2 = await book(localDay(40));
  out.push({ case: 'A2 booking 40 days ahead', expected: 'refused, no row', observed: `${booked(a2)} rows=${await rows()}` });
  const a3 = await ask(localDay(30));
  const a3b = await book(localDay(30));
  out.push({ case: 'A3 availability and booking 30 days ahead', expected: 'available, created', observed: `${avail(a3)}, ${booked(a3b)}` });
  out.push({ case: 'A4 availability for 7 guests (limit 6)', expected: 'not available (PARTY_TOO_LARGE)', observed: avail(await ask(localDay(7), 7)) });
  out.push({ case: 'A5 control: availability 7 days ahead', expected: 'available', observed: avail(await ask(localDay(7))) });
  console.table(out);
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
