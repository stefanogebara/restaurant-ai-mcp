'use strict';
// R5 — Google Booking and the partner booking webhook, the last two endpoints
// that wrote reservations outside the shared rule. Real handlers, disposable
// Postgres. Restaurant: two tables of 4 (8 seats), São Paulo, open 18:00-23:00,
// a date 7 days ahead. Expected outcomes (written before running):
//   G1 Google books 4 when 8 of 8 seats are taken      -> refused (SLOT_UNAVAILABLE), 8 seats
//   G2 Google books 19:00 São Paulo sent as an instant  -> stored as 19:00, not 22:00 (UTC)
//   G3 the same idempotency_token twice                 -> one row, same booking_id
//   G4 Google UpdateBooking on a WhatsApp booking's id  -> refused, booking unchanged
//   G5 Google UpdateBooking onto a full sitting         -> refused (SLOT_UNAVAILABLE), unchanged
//   G6 Google UpdateBooking to a free time, as instant  -> moved, stored in local time
//   P1 partner webhook with a valid key                 -> authenticates and imports (201)
//   P2 partner import when the room is full             -> imported anyway (a booking already
//                                                          confirmed on the partner; by decision)
const crypto = require('crypto');
process.env.GOOGLE_BOOKING_SECRET = 'audit-google-secret-0001';
const h = require('./harness.cjs');
const google = h.load('api/google-booking/server.js');
const partner = h.load('api/external-booking-webhook.js');

const T2 = '22222222-2222-4222-8222-222222222222';
const DAY = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const API_KEY = 'sk_audit_partner_key_0001';
const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, open_time: '18:00', close_time: '23:00' }]));

async function fixture({ full = false } = {}) {
  await h.pool.query(`CREATE TABLE IF NOT EXISTS restaurant.api_keys (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id uuid NOT NULL, key_hash text NOT NULL, key_prefix text NOT NULL, name text NOT NULL,
    permissions text[] NOT NULL DEFAULT '{}', is_active boolean DEFAULT true, last_used_at timestamptz,
    created_at timestamptz DEFAULT now(), expires_at timestamptz)`);
  await h.pool.query('GRANT ALL ON restaurant.api_keys TO service_role');
  await h.pool.query('TRUNCATE public.reservations, public.tables, restaurant.restaurant_config, restaurant.api_keys CASCADE');
  await h.pool.query(`INSERT INTO restaurant.restaurant_config (id, business_hours, timezone) VALUES ($1, $2::jsonb, 'America/Sao_Paulo')`,
    [h.R, JSON.stringify(hours)]);
  await h.pool.query(`INSERT INTO public.tables (id, table_number, capacity, restaurant_id) VALUES ($1,1,4,$3), ($2,2,4,$3)`, [h.T1, T2, h.R]);
  await h.pool.query(`INSERT INTO restaurant.api_keys (restaurant_id, key_hash, key_prefix, name, permissions) VALUES ($1, $2, 'sk_audit', 'audit', '{*}')`,
    [h.R, crypto.createHash('sha256').update(API_KEY).digest('hex')]);
  // A WhatsApp guest at 21:00 (a booking that is not Google's).
  await h.pool.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, party_size, date, time, status,
    table_ids, restaurant_id, source) VALUES ('RES-R5-WHATSAPP0','Wanda Zap','+5511960000000',2,$1,'21:00','confirmed','{}',$2,'whatsapp_ai')`, [DAY, h.R]);
  if (full) {
    await h.pool.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, party_size, date, time, status,
      table_ids, restaurant_id, source) VALUES ('RES-R5-FULL00001','Lotado Um','+5511960000001',8,$1,'19:00','confirmed','{}',$2,'voice_ai')`, [DAY, h.R]);
  }
}
const seatsAt = async time => (await h.pool.query(`SELECT coalesce(sum(party_size),0)::int s FROM public.reservations
  WHERE lower(status) IN ('confirmed','pending','seated') AND (date + time) < ($1::date + $2::time) + interval '90 minutes'
  AND (date + time) + interval '90 minutes' > ($1::date + $2::time)`, [DAY, time])).rows[0].s;
const row = async where => (await h.pool.query(`SELECT id, source, to_char(time,'HH24:MI') AS time, party_size, status
  FROM public.reservations WHERE ${where}`)).rows;
const auth = { authorization: `Bearer ${process.env.GOOGLE_BOOKING_SECRET}` };
const create = (startTime, token, party = 4) => h.call(google, { method: 'POST', query: { action: 'CreateBooking' }, headers: auth,
  body: { idempotency_token: token, slot: { merchant_id: h.R, start_time: startTime, resources: { party_size: party } },
    user_information: { given_name: 'Gil', family_name: 'Google', telephone: '+5511970000099', email: 'gil@example.test' } } });
const update = booking => h.call(google, { method: 'POST', query: { action: 'UpdateBooking' }, headers: auth, body: { booking } });
const verdict = r => (r.body?.booking ? `booked(${r.body.booking.status})` : r.body?.booking_failure ? `refused(${r.body.booking_failure.cause})` : `${r.statusCode} ${JSON.stringify(r.body).slice(0, 40)}`);
const importBooking = (externalId, time, party) => h.call(partner, { method: 'POST', headers: { 'x-api-key': API_KEY },
  body: { source: 'opentable', external_id: externalId, guest_name: 'Olga Table', guest_phone: '+5511980000001',
    party_size: party, reservation_date: DAY, reservation_time: time } });

(async () => {
  const out = [];
  await fixture({ full: true });
  const g1 = await create(`${DAY}T19:00:00`, 'tok-g1');
  out.push({ case: 'G1 Google books 4, room full (8 of 8)', expected: 'refused, 8 seats', observed: `${verdict(g1)} seats@19:00=${await seatsAt('19:00')} of 8` });

  await fixture();
  const g2 = await create(`${DAY}T19:00:00-03:00`, 'tok-g2');
  const [r2] = await row(`source = 'google'`);
  out.push({ case: 'G2 Google 19:00 São Paulo sent as instant', expected: 'stored 19:00', observed: `${verdict(g2)} stored=${r2?.time ?? '-'}` });

  const g3 = await create(`${DAY}T19:00:00-03:00`, 'tok-g2');
  const n3 = (await row(`source = 'google'`)).length;
  out.push({ case: 'G3 same idempotency_token again', expected: 'one row, same booking_id', observed: `${verdict(g3)} rows=${n3} same_id=${g3.body?.booking?.booking_id === g2.body?.booking?.booking_id}` });

  const [wa] = await row(`source = 'whatsapp_ai'`);
  const g4 = await update({ booking_id: wa.id, start_time: `${DAY}T19:30:00-03:00` });
  const [wa2] = await row(`id = '${wa.id}'`);
  out.push({ case: "G4 UpdateBooking on a WhatsApp booking's id", expected: 'refused, unchanged', observed: `${verdict(g4)} whatsapp_time=${wa2.time}` });

  if (!r2) {
    out.push({ case: 'G5/G6 UpdateBooking on a Google booking', expected: 'refused onto full / moved to free', observed: 'no Google booking exists (CreateBooking failed)' });
  } else {
    await h.pool.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, party_size, date, time, status,
      table_ids, restaurant_id, source) VALUES ('RES-R5-FULL00002','Lotado Dois','+5511960000002',6,$1,'21:30','confirmed','{}',$2,'voice_ai')`, [DAY, h.R]);
    const g5 = await update({ booking_id: r2.id, start_time: `${DAY}T21:30:00-03:00` });
    const [r5] = await row(`id = '${r2.id}'`);
    out.push({ case: 'G5 UpdateBooking onto a full sitting (21:30)', expected: 'refused, still 19:00', observed: `${verdict(g5)} stored=${r5.time} seats@21:30=${await seatsAt('21:30')} of 8` });

    const g6 = await update({ booking_id: r2.id, start_time: `${DAY}T18:30:00-03:00` });
    const [r6] = await row(`id = '${r2.id}'`);
    out.push({ case: 'G6 UpdateBooking to 18:30 São Paulo, as instant', expected: 'moved, stored 18:30', observed: `${verdict(g6)} stored=${r6.time}` });
  }

  await fixture();
  const p1 = await importBooking('OT-1', '19:00', 4);
  out.push({ case: 'P1 partner webhook, valid key', expected: '201 imported', observed: `${p1.statusCode} ${p1.body?.action ?? p1.body?.error}` });

  await fixture({ full: true });
  const p2 = await importBooking('OT-2', '19:00', 4);
  out.push({ case: 'P2 partner import, room full', expected: 'imported (by decision)', observed: `${p2.statusCode} ${p2.body?.action ?? p2.body?.error} seats@19:00=${await seatsAt('19:00')} of 8` });

  console.table(out);
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
