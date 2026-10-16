'use strict';

// Integration test against a DISPOSABLE local Postgres initialized with the
// migration and minimal table fixtures. Never point this at Supabase or prod.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

if (!process.env.PGHOST?.startsWith('/tmp/stb-booking-') || process.env.PGDATABASE !== 'postgres') {
  throw new Error('Requires disposable /tmp/stb-booking-* socket and PGDATABASE=postgres');
}

const hours = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map(day => [day, { is_open: true, open_time: '09:00', close_time: '23:00' }])
);
const call = `SELECT public.book_whatsapp_reservation(
  $1::uuid,$2::text,$3::text,$4::date,$5::time,$6::integer,
  $7::text,$8::text,$9::text,$10::text
) AS result`;

async function main() {
  const admin = new Client({ application_name: 'booking-integrity-admin' });
  const a = new Client({ application_name: 'booking-integrity-a' });
  const b = new Client({ application_name: 'booking-integrity-b' });
  await Promise.all([admin.connect(), a.connect(), b.connect()]);
  const createdRestaurants = [];
  try {
    const grants = await admin.query(`SELECT
      has_function_privilege('anon','public.book_whatsapp_reservation(uuid,text,text,date,time without time zone,integer,text,text,text,text)','EXECUTE') AS anon,
      has_function_privilege('authenticated','public.book_whatsapp_reservation(uuid,text,text,date,time without time zone,integer,text,text,text,text)','EXECUTE') AS authenticated,
      has_function_privilege('service_role','public.book_whatsapp_reservation(uuid,text,text,date,time without time zone,integer,text,text,text,text)','EXECUTE') AS service_role`);
    assert.deepEqual(grants.rows[0], { anon: false, authenticated: false, service_role: true });
    await Promise.all([a.query('SET ROLE service_role'), b.query('SET ROLE service_role')]);

    async function restaurant() {
      const id = randomUUID();
      createdRestaurants.push(id);
      await admin.query(`INSERT INTO restaurant.restaurant_config
        (id,is_active,timezone,business_hours,average_dining_duration_minutes,reservation_settings)
        VALUES ($1,true,'Europe/Madrid',$2::jsonb,90,'{"max_party_size":8}')`, [id, JSON.stringify(hours)]);
      await admin.query('INSERT INTO public.tables (restaurant_id,capacity,is_active) VALUES ($1,2,true)', [id]);
      return id;
    }
    const args = (id, key, reservationId, guest = 'Alice', phone = '5511999999999') => [
      id, `wa:v1:${key.repeat(64)}`, reservationId, '2099-01-01', '19:00', 2, guest, phone, null, '',
    ];
    const book = async (client, parameters) => (await client.query(call, parameters)).rows[0].result;

    for (const [first, second] of [[a, b], [b, a]]) {
      const id = await restaurant();
      await first.query('BEGIN');
      const winning = await book(first, args(id, 'a', `RES-${randomUUID()}`, 'Alice'));
      assert.equal(winning.status, 'created');

      let settled = false;
      const losingPromise = book(second, args(id, 'b', `RES-${randomUUID()}`, 'Bob', '5511888888888'))
        .finally(() => { settled = true; });
      const secondName = second === a ? 'booking-integrity-a' : 'booking-integrity-b';
      let locked = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const observed = await admin.query(
          `SELECT wait_event_type FROM pg_stat_activity WHERE application_name=$1 AND state='active'`,
          [secondName]
        );
        if (observed.rows.some(row => row.wait_event_type === 'Lock')) { locked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(locked, true, 'second booking must block on restaurant row');
      assert.equal(settled, false);
      await first.query('COMMIT');
      const losing = await losingPromise;
      assert.equal(losing.status, 'unavailable');
      const count = await admin.query('SELECT count(*)::integer AS count FROM public.reservations WHERE restaurant_id=$1', [id]);
      assert.equal(count.rows[0].count, 1);

      const replay = await book(first, args(id, 'a', 'RES-REPLAY'));
      assert.equal(replay.status, 'existing');
      assert.equal(replay.reservation_id, winning.reservation_id);
      assert.equal(replay.time, '19:00');
      const modelDrift = args(id, 'a', 'RES-CHANGED-DETAILS');
      modelDrift[4] = '20:00';
      const driftReplay = await book(first, modelDrift);
      assert.equal(driftReplay.status, 'existing');
      assert.equal(driftReplay.reservation_id, winning.reservation_id);
      assert.equal(driftReplay.time, '19:00');
      const repeatedAction = await book(first, args(id, 'c', 'RES-DUPLICATE'));
      assert.equal(repeatedAction.status, 'existing');
      assert.equal(repeatedAction.reservation_id, winning.reservation_id);
      await admin.query('UPDATE public.reservations SET status=$1 WHERE restaurant_id=$2', ['cancelled', id]);
      assert.equal((await book(first, args(id, 'a', 'RES-OLD-KEY'))).status, 'cancelled_intent');
      assert.equal((await book(first, args(id, 'd', `RES-${randomUUID()}`))).status, 'created');
      assert.equal((await book(first, [id, `wa:v1:${'e'.repeat(64)}`, 'RES-CLOSED', '2099-01-01', '23:30', 1, 'Charlie', '5511777777777', null, ''])).status, 'outside_hours');
      assert.equal((await book(first, [id, `wa:v1:${'f'.repeat(64)}`, 'RES-LATE', '2099-01-01', '22:00', 1, 'Charlie', '5511777777777', null, ''])).status, 'too_late');
      await admin.query(`UPDATE restaurant.restaurant_config
        SET reservation_settings=reservation_settings || '{"advance_booking_days":1}'::jsonb
        WHERE id=$1`, [id]);
      assert.equal((await book(first, [id, `wa:v1:${'1'.repeat(64)}`, 'RES-FAR', '2099-01-02', '19:00', 1, 'Charlie', '5511777777777', null, ''])).status, 'too_far');
      await admin.query(`UPDATE restaurant.restaurant_config
        SET reservation_settings=reservation_settings - 'advance_booking_days' WHERE id=$1`, [id]);
      const legacyHours = Object.keys(hours).map(day => ({ day, is_open: true, open: '09:00', close: '23:00' }));
      await admin.query('UPDATE restaurant.restaurant_config SET business_hours=$2::jsonb WHERE id=$1',
        [id, JSON.stringify(legacyHours)]);
      assert.equal((await book(first, [id, `wa:v1:${'2'.repeat(64)}`, `RES-${randomUUID()}`, '2099-01-01', '10:00', 1, 'Charlie', '5511777777777', null, ''])).status, 'created');
    }
    console.log('PASS: grants, two lock orderings, capacity, replay, cancellation, hours formats, last seating, advance limit');
  } finally {
    await Promise.allSettled([a.query('ROLLBACK'), b.query('ROLLBACK')]);
    for (const id of createdRestaurants) {
      await admin.query('DELETE FROM public.reservations WHERE restaurant_id=$1', [id]);
      await admin.query('DELETE FROM public.tables WHERE restaurant_id=$1', [id]);
      await admin.query('DELETE FROM restaurant.restaurant_config WHERE id=$1', [id]);
    }
    await Promise.all([a.end(), b.end(), admin.end()]);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
