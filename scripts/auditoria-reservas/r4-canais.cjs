'use strict';
// R4 — cross-channel capacity. Restaurant: two combinable tables of 4 (8 seats),
// open 18:00-23:00, 90-minute sittings. Slot: 2026-11-26 19:00 (no clock issue).
// Oracle (manual): once 8 seats are booked at 19:00, any further booking that
// overlaps 19:00 must be refused, whichever channel took the first 8 seats.
// R4a: WhatsApp books 8 (no table assignment) -> voice asks for 4. Expected: refused.
// R4b (control): voice books 8 (assigns both tables) -> WhatsApp asks for 4. Expected: refused.
const h = require('./harness.cjs');
const tools = h.load('api/_lib/tool-handlers.js');
const T2 = '22222222-2222-4222-8222-222222222222';
const DAY = '2026-11-26';
const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, open_time: '18:00', close_time: '23:00' }]));
const restaurant = { id: h.R, restaurant_name: 'Casa Teste', business_hours: hours, timezone: 'America/Sao_Paulo',
  whatsapp_enabled: false, average_dining_duration_minutes: 90 };

async function fixture() {
  await h.pool.query('TRUNCATE public.reservations, public.tables, restaurant.restaurant_config CASCADE');
  await h.pool.query(`INSERT INTO restaurant.restaurant_config (id, business_hours, timezone) VALUES ($1, $2::jsonb, 'America/Sao_Paulo')`, [h.R, JSON.stringify(hours)]);
  await h.pool.query(`INSERT INTO public.tables (id, table_number, capacity, restaurant_id) VALUES ($1,1,4,$3), ($2,2,4,$3)`, [h.T1, T2, h.R]);
}
const seats = async () => (await h.pool.query(`SELECT coalesce(sum(party_size),0)::int s FROM public.reservations
  WHERE lower(status) IN ('confirmed','pending','seated') AND date = $1 AND time = '19:00'`, [DAY])).rows[0].s;
const whatsapp = (n, ext, phone) => h.pool.query(`SELECT public.book_whatsapp_reservation($1::uuid, $2, $3, $4::date, '19:00'::time, $5, 'Cliente WhatsApp', $6, NULL, NULL) AS r`,
  [h.R, 'wa:v1:' + require('crypto').createHash('sha256').update(ext).digest('hex'), `RES-20261111-${ext.replace(/[^A-Za-z0-9]/g, '').padEnd(12, 'W').slice(0, 12)}`, DAY, n, phone]).then(x => x.rows[0].r);
const voice = (n, phone) => tools.createReservation(h.R, restaurant, { date: DAY, time: '19:00', party_size: n,
  customer_name: 'Cliente Voz', customer_phone: phone });

(async () => {
  const out = [];
  await fixture();
  const w = await whatsapp(8, 'wa-ext-0001', '+5511960000001');
  const v = await voice(4, '+5511970000002');
  out.push({ case: 'R4a WhatsApp 8 seats, then voice 4', expected: 'voice refused, 8 seats',
    observed: `whatsapp=${JSON.stringify(w).slice(0,60)} voice=${v.success ? 'ACCEPTED' : v.error} seats@19:00=${await seats()} of 8` });
  await fixture();
  const v2 = await voice(8, '+5511970000003');
  const w2 = await whatsapp(4, 'wa-ext-0002', '+5511960000004');
  out.push({ case: 'R4b control: voice 8 seats, then WhatsApp 4', expected: 'whatsapp refused, 8 seats',
    observed: `voice=${v2.success} whatsapp=${w2.status} seats@19:00=${await seats()} of 8` });
  console.table(out);
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
