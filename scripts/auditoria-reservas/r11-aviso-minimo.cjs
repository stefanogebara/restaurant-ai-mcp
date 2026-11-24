'use strict';
// R11 — one hour of notice, the same on every guest channel. Until 16/11/2026
// the notice lived only in the JavaScript validator, which the booking page
// and voice ran before booking; WhatsApp, Google and the SQL rule had none. A
// time 30 minutes away was offered by every availability answer and then
// refused by the page and voice, but booked by WhatsApp and Google.
//
// For each channel: a start "soon" (10-40 minutes away) and a start "later"
// (100-130 minutes away), both on the half hour. The restaurant's zone is a
// fixed offset chosen so that it is about 10:00 there now (the test does not
// depend on the hour it runs); open all day, two tables of 4,
// advance_booking_days 10, max_party_size 6.
// Expected outcomes (written before running):
//   soon:  availability no, booking refused  -> on the page, voice, WhatsApp and Google
//   later: availability yes, booking created -> on the page, voice, WhatsApp and Google
const crypto = require('crypto');
const h = require('./harness.cjs');
process.env.GOOGLE_BOOKING_SECRET = 'audit-google-secret-0001';
const portal = h.load('api/_app/portal.js');
const voiceTools = h.load('api/_app/_lib/tool-handlers.js');
const { getRestaurantById } = h.load('api/_app/_lib/restaurant-loader.js');
const whatsapp = h.load('api/_app/_services/whatsapp/reservation-tools.js');
const google = h.load('api/_app/google-booking/server.js');
const T2 = '22222222-2222-4222-8222-222222222222';
const settings = { advance_booking_days: 10, max_party_size: 6 };
const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, open_time: '00:00', close_time: '23:59' }]));

// A whole-hour offset that puts the local clock near 10:00 (Etc/GMT signs are inverted).
let offset = 10 - new Date().getUTCHours();
if (offset < -12) offset += 24;
if (offset > 14) offset -= 24;
const ZONE = offset === 0 ? 'Etc/GMT' : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
const local = new Date(Date.now() + offset * 3600000);
const TODAY = local.toISOString().slice(0, 10);
const nowMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
let soonMinutes = Math.ceil((nowMinutes + 1) / 30) * 30;
if (soonMinutes - nowMinutes < 10) soonMinutes += 30;
const clock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const SOON = clock(soonMinutes);
const LATER = clock(soonMinutes + 90);

async function fixture() {
  await h.pool.query('ALTER TABLE restaurant.restaurant_config ADD COLUMN IF NOT EXISTS whatsapp_phone_number text');
  await h.pool.query('TRUNCATE public.reservations, public.tables, restaurant.restaurant_config CASCADE');
  await h.pool.query(`INSERT INTO restaurant.restaurant_config (id, business_hours, timezone, reservation_settings)
    VALUES ($1, $2::jsonb, $3, $4::jsonb)`, [h.R, JSON.stringify(hours), ZONE, JSON.stringify(settings)]);
  await h.pool.query(`INSERT INTO public.tables (id, table_number, capacity, restaurant_id) VALUES ($1,1,4,$3), ($2,2,4,$3)`, [h.T1, T2, h.R]);
}

let n = 0;
const tag = () => String(++n).padStart(4, '0');
const channels = {
  'booking page': {
    available: async time => {
      const r = await h.call(portal, { method: 'GET', query: { action: 'availability', restaurant_id: h.R, date: TODAY, party_size: '2' } });
      return (r.body?.slots || []).some(s => s.time === time && s.available === true);
    },
    book: async time => {
      const r = await h.call(portal, { method: 'POST', query: { action: 'reserve' },
        body: { restaurant_id: h.R, customer_name: 'Pagina Prova', customer_phone: `+551198000${tag()}`, party_size: 2, date: TODAY, time } });
      return r.statusCode === 201 ? 'created' : `refused(${r.statusCode} ${String(r.body?.message || '').slice(0, 48)})`;
    },
  },
  voice: {
    available: async time => (await voiceTools.checkAvailability(h.R, await restaurant(), { date: TODAY, time, party_size: 2 })).available === true,
    book: async time => {
      const r = await voiceTools.createReservation(h.R, await restaurant(), { date: TODAY, time, party_size: 2,
        customer_name: 'Voz Prova', customer_phone: `+551197000${tag()}` });
      return r.success ? 'created' : `refused(${r.error})`;
    },
  },
  WhatsApp: {
    available: async time => (await whatsapp.executeTool('check_availability', { date: TODAY, time, party_size: 2 },
      { restaurant: { id: h.R, average_dining_duration_minutes: 90 } },
      { timezone: ZONE, averageDiningDurationMinutes: 90, reservationSettings: settings })).available === true,
    book: async time => {
      const t = tag();
      const { rows: [{ r }] } = await h.pool.query(
        `SELECT public.book_whatsapp_reservation($1::uuid, $2, $3, $4::date, $5::time, 2, 'Cliente Zap', '+5511970000077', NULL, NULL) AS r`,
        [h.R, 'wa:v1:' + crypto.createHash('sha256').update(`r11-${t}`).digest('hex'), `RES-R11-ZAP${t}`, TODAY, time]);
      return r.status === 'created' ? 'created' : `refused(${r.status})`;
    },
  },
  Google: {
    available: async time => {
      const r = await h.call(google, { method: 'POST', query: { action: 'BatchAvailabilityLookup' },
        headers: { authorization: `Bearer ${process.env.GOOGLE_BOOKING_SECRET}` },
        body: { merchant_id: h.R, party_size: 2, slot_time_range: { start_date: TODAY, end_date: TODAY } } });
      return (r.body?.slots || []).some(s => s.start_time.startsWith(`${TODAY}T${time}`));
    },
    book: async time => {
      const r = await h.call(google, { method: 'POST', query: { action: 'CreateBooking' },
        headers: { authorization: `Bearer ${process.env.GOOGLE_BOOKING_SECRET}` },
        body: { idempotency_token: `r11-${tag()}`, slot: { merchant_id: h.R, start_time: `${TODAY}T${time}:00`, resources: { party_size: 2 } },
          user_information: { given_name: 'Gil', family_name: 'Google', telephone: '+5511970000099', email: 'gil@example.test' } } });
      return r.body?.booking ? 'created' : `refused(${r.body?.booking_failure?.cause || r.statusCode})`;
    },
  },
};
async function restaurant() { return { ...(await getRestaurantById(h.R)), whatsapp_enabled: false }; }

(async () => {
  const out = [];
  for (const [name, channel] of Object.entries(channels)) {
    const row = { channel: name };
    for (const [label, time] of [['soon', SOON], ['later', LATER]]) {
      await fixture();
      row[`${label} ${time}: available`] = (await channel.available(time)) ? 'yes' : 'no';
      await fixture();
      row[`${label} ${time}: booking`] = await channel.book(time);
    }
    out.push(row);
  }
  console.log(JSON.stringify({ zone: ZONE, local_now: clock(nowMinutes), soon: `${SOON} (${soonMinutes - nowMinutes} min away)`,
    later: `${LATER} (${soonMinutes + 90 - nowMinutes} min away)` }));
  console.table(out);
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
