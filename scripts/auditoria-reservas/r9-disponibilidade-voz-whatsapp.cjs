'use strict';
// R9 — voice and WhatsApp availability agree with the booking. For a grid of
// candidate starts, each channel's check_availability answer is compared with
// the real booking function (book_guest_reservation) run in a transaction that
// is rolled back. Restaurant: São Paulo, lunch 12:00-15:00 and dinner
// 19:00-23:00, two tables of 4 (8 seats), advance_booking_days 10,
// max_party_size 6; a 'Seated' party of 8 holds day+2 at 20:00; table 1 is
// occupied right now (a walk-in). Grid: day+1, day+2 and day+11, 11:00-23:30
// every 30 minutes, party of 2; plus day+1 19:00 for 7 guests.
// Expected outcomes (written before running):
//   V9/W9 false "available" (booking refuses)  -> 0, for voice and for WhatsApp
//   V9/W9 false "not available" (booking accepts) -> 0, for voice and for WhatsApp
//   V9a voice alternatives the booking refuses -> 0
const h = require('./harness.cjs');
const { Client } = require('pg');
const voiceTools = h.load('api/_lib/tool-handlers.js');
const { getRestaurantById } = h.load('api/_lib/restaurant-loader.js');
const whatsapp = h.load('api/_services/whatsapp/reservation-tools.js');
const T2 = '22222222-2222-4222-8222-222222222222';
const settings = { advance_booking_days: 10, max_party_size: 6 };
const hours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, periods: [{ open: '12:00', close: '15:00' }, { open: '19:00', close: '23:00' }] }]));
const localDay = n => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

async function fixture() {
  await h.pool.query('TRUNCATE public.reservations, public.tables, restaurant.restaurant_config CASCADE');
  await h.pool.query(`INSERT INTO restaurant.restaurant_config (id, business_hours, timezone, reservation_settings)
    VALUES ($1, $2::jsonb, 'America/Sao_Paulo', $3::jsonb)`, [h.R, JSON.stringify(hours), JSON.stringify(settings)]);
  await h.pool.query(`INSERT INTO public.tables (id, table_number, capacity, restaurant_id, status) VALUES ($1,1,4,$3,'occupied'), ($2,2,4,$3,'available')`, [h.T1, T2, h.R]);
  await h.pool.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, party_size, date, time, status,
    table_ids, restaurant_id, source) VALUES ('RES-R9-SEATED001','Mesa Cheia','+5511960000001',8,$1,'20:00','Seated','{}',$2,'manual')`,
    [localDay(2), h.R]);
}

(async () => {
  await fixture();
  const restaurant = { ...(await getRestaurantById(h.R)), whatsapp_enabled: false };
  const session = { restaurant: { id: h.R, average_dining_duration_minutes: 90 } };
  const inbound = { timezone: 'America/Sao_Paulo', averageDiningDurationMinutes: 90, reservationSettings: settings };
  const probe = new Client({ host: process.env.AUDIT_SOCK, port: 55441, user: 'postgres', database: 'audit' }); await probe.connect();
  let n = 0;
  const bookable = async (date, time, party) => {
    await probe.query('BEGIN');
    const { rows: [{ r }] } = await probe.query(`SELECT public.book_guest_reservation(p_restaurant_id => $1::uuid, p_source => 'online_portal',
      p_external_id => NULL, p_reservation_id => $2, p_date => $3::date, p_time => $4::time, p_party_size => $5,
      p_customer_name => 'Prova', p_customer_phone => '+5511900000000') AS r`, [h.R, `RES-R9-PROBE${String(++n).padStart(5, '0')}`, date, time, party]);
    await probe.query('ROLLBACK');
    return r.status === 'created';
  };

  const grid = [];
  for (const d of [1, 2, 11]) for (let m = 11 * 60; m <= 23 * 60 + 30; m += 30) {
    grid.push({ date: localDay(d), time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, party: 2 });
  }
  grid.push({ date: localDay(1), time: '19:00', party: 7 });

  const tally = { voice: { yes: 0, falseYes: [], falseNo: [] }, whatsapp: { yes: 0, falseYes: [], falseNo: [] } };
  const alternatives = { offered: 0, refused: [] };
  for (const g of grid) {
    const truth = await bookable(g.date, g.time, g.party);
    const v = await voiceTools.checkAvailability(h.R, restaurant, { date: g.date, time: g.time, party_size: g.party });
    const w = await whatsapp.executeTool('check_availability', { date: g.date, time: g.time, party_size: g.party }, session, inbound);
    for (const [name, r] of [['voice', v], ['whatsapp', w]]) {
      const said = r.available === true;
      if (said) tally[name].yes++;
      if (said && !truth) tally[name].falseYes.push(`${g.date.slice(5)} ${g.time} x${g.party}`);
      if (!said && truth) tally[name].falseNo.push(`${g.date.slice(5)} ${g.time} x${g.party}`);
    }
    for (const alt of v.alternative_times || []) {
      alternatives.offered++;
      if (!(await bookable(g.date, alt.time, g.party))) alternatives.refused.push(`${g.date.slice(5)} ${alt.time}`);
    }
  }
  await probe.end();
  const show = list => `${list.length}${list.length ? ` e.g. ${list.slice(0, 4).join(', ')}` : ''}`;
  const out = [];
  for (const name of ['voice', 'whatsapp']) {
    out.push({ case: `${name}: false "available"`, expected: '0', observed: `${show(tally[name].falseYes)} (of ${tally[name].yes} available, ${grid.length} asked)` });
    out.push({ case: `${name}: false "not available"`, expected: '0', observed: show(tally[name].falseNo) });
  }
  out.push({ case: 'voice: alternatives the booking refuses', expected: '0', observed: `${show(alternatives.refused)} (of ${alternatives.offered} suggested)` });
  console.table(out);
  await h.pool.end();
})().catch(e => { console.error(e); process.exit(2); });
