'use strict';

// SQL integration harness. Creates fixtures ONLY in a fresh disposable cluster.
// This is not part of Jest: running it writes the disposable database. Never
// use a Supabase URL, production schema, or a shared development database.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync, realpathSync } = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const host = process.env.PGHOST;
if (!host || !/^\/tmp\/stb-mutations-[A-Za-z0-9_-]+$/.test(host) ||
    process.env.PGDATABASE !== 'postgres' || process.env.PGHOSTADDR || process.env.PGSERVICE ||
    !realpathSync(host).startsWith('/private/tmp/stb-mutations-') && !realpathSync(host).startsWith('/tmp/stb-mutations-')) {
  throw new Error('Requires a fresh disposable /tmp/stb-mutations-* Unix socket, PGDATABASE=postgres, no PGHOSTADDR/PGSERVICE');
}
const options = { host, database: 'postgres', port: process.env.PGPORT || 5432,
  user: process.env.PGUSER, ssl: false, connectionTimeoutMillis: 3000, query_timeout: 10000 };
const admin = new Client({ ...options, application_name: 'guest-mutations-admin' });
const a = new Client({ ...options, application_name: 'guest-mutations-a' });
const b = new Client({ ...options, application_name: 'guest-mutations-b' });
const signature = 'public.mutate_guest_reservation(uuid,text,text,text,jsonb)';
const query = 'SELECT public.mutate_guest_reservation($1::uuid,$2::text,$3::text,$4::text,$5::jsonb) AS result';
const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const hours = Object.fromEntries(weekdays.map(day => [day, { is_open: true, open_time: '09:00', close_time: '23:00' }]));
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const rpc = async (client, row, action, changes = {}, proof = {}) => (await client.query(query, [
  proof.restaurantId || row.restaurant_id, proof.phone || '15555550101',
  proof.code || row.reservation_id, action, JSON.stringify(changes),
])).rows[0].result;
const full = async id => (await admin.query('SELECT to_jsonb(r) AS row FROM public.reservations r WHERE id=$1', [id])).rows[0].row;
const without = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
const refused = (result, code) => assert.deepEqual(result, { success: false, changed: false, reservation: null, error: { code } });

async function fixture({ capacity = 2, status = 'confirmed' } = {}) {
  const tenant = randomUUID();
  const row = { id: randomUUID(), restaurant_id: tenant, reservation_id: `RES-20990101-${randomUUID()}` };
  await admin.query(`INSERT INTO restaurant.restaurant_config VALUES ($1,true,'Europe/Madrid',$2,90,'{"max_party_size":8}')`, [tenant, JSON.stringify(hours)]);
  await admin.query('INSERT INTO public.tables VALUES ($1,$2,true)', [tenant, capacity]);
  await admin.query(`INSERT INTO public.reservations
    (id,restaurant_id,reservation_id,customer_name,customer_phone,date,time,party_size,status,table_ids,special_requests,source,external_id)
    VALUES ($1,$2,$3,'Guest','+1 (555) 555-0101','2099-01-01','19:00',2,$4,'{old-table}','Window','whatsapp','protected-external-key')`,
  [row.id, tenant, row.reservation_id, status]);
  return row;
}

async function main() {
  await admin.connect();
  try {
    const state = (await admin.query(`SELECT inet_server_addr() IS NULL AS local,
      to_regclass('public.reservations') IS NULL AND to_regclass('restaurant.restaurant_config') IS NULL
      AND to_regclass('public.tables') IS NULL AND to_regprocedure($1) IS NULL AS fresh`, [signature])).rows[0];
    assert.deepEqual(state, { local: true, fresh: true }, 'Refusing any non-fresh/shared database');
    // Minimal fixture schema deliberately includes protected fields to catch
    // accidental row recreation or unrelated data rewrites.
    await admin.query(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA restaurant;
      CREATE TABLE restaurant.restaurant_config (id uuid PRIMARY KEY, is_active boolean, timezone text,
        business_hours jsonb, average_dining_duration_minutes integer, reservation_settings jsonb);
      CREATE TABLE public.tables (restaurant_id uuid, capacity integer, is_active boolean);
      CREATE TABLE public.reservations (id uuid PRIMARY KEY, restaurant_id uuid, reservation_id text,
        customer_name text, customer_phone text, date date, time time, party_size integer, status text,
        table_ids text[], special_requests text, source text, external_id text, created_at timestamptz DEFAULT now());
      GRANT USAGE ON SCHEMA public, restaurant TO service_role, anon, authenticated;
      GRANT SELECT, UPDATE ON restaurant.restaurant_config, public.reservations TO service_role;
      GRANT SELECT ON public.tables TO service_role;
    `);
    await admin.query(readFileSync(path.join(__dirname, '../supabase/migrations/20261110174209_guest_reservation_mutations.sql'), 'utf8'));
    await Promise.all([a.connect(), b.connect()]);
    await Promise.all([a.query('SET ROLE service_role'), b.query('SET ROLE service_role')]);

    await check('only service_role has EXECUTE', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const result = await admin.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS allowed', [role, signature]);
        assert.equal(result.rows[0].allowed, role === 'service_role');
      }
    });
    const owned = await fixture();
    for (const role of ['anon', 'authenticated']) await check(`${role} invocation is denied`, async () => {
      await admin.query(`SET ROLE ${role}`);
      try { await assert.rejects(rpc(admin, owned, 'cancel'), error => error.code === '42501'); }
      finally { await admin.query('RESET ROLE'); }
    });
    for (const proof of [{ phone: '15555550999' }, { restaurantId: randomUUID() },
      { code: owned.reservation_id.toLowerCase() }, { code: owned.reservation_id.slice(0, -1) }]) {
      await check('tenant/phone/full exact code cannot be substituted', async () => {
        const before = await full(owned.id);
        const result = await rpc(a, owned, 'cancel', {}, proof);
        // An absent restaurant reveals no guest; no foreign reservation DTO.
        refused(result, proof.restaurantId ? 'restaurant_unavailable' : 'verification_failed');
        assert.deepEqual(await full(owned.id), before);
      });
    }
    for (const changes of [null, [], 'date', 2, { status: 'cancelled' }]) {
      await check('direct malformed JSON refuses without mutation', async () => {
        const before = await full(owned.id);
        refused(await rpc(a, owned, 'modify', changes), 'invalid_input');
        assert.deepEqual(await full(owned.id), before);
      });
    }
    for (const [changes, code] of [[{ date: '2027-02-29' }, 'invalid_date'],
      [{ date: '2020-01-01' }, 'past_slot'], [{ time: '20:60' }, 'invalid_time'],
      [{ party_size: 2.5 }, 'invalid_party_size'], [{ party_size: '2people' }, 'invalid_party_size'],
      [{ party_size: -1 }, 'invalid_party_size'], [{ party_size: 0 }, 'invalid_party_size']]) {
      await check(`direct ${code} shape/clock guard`, async () => {
        const before = await full(owned.id);
        refused(await rpc(a, owned, 'modify', changes), code);
        assert.deepEqual(await full(owned.id), before);
      });
    }
    await check('self-exclusion succeeds at full capacity and releases stale table IDs', async () => {
      const before = await full(owned.id);
      const result = await rpc(a, owned, 'modify', { time: '19:30', party_size: '02' });
      assert.equal(result.success, true); assert.equal(result.changed, true);
      assert.equal(result.reservation.id, owned.id); assert.deepEqual(result.reservation.table_ids, []);
      assert.deepEqual(without(await full(owned.id), ['time', 'table_ids']), without(before, ['time', 'table_ids']));
      const committed = await full(owned.id);
      assert.equal((await rpc(a, owned, 'modify', { time: '19:30' })).changed, false);
      assert.deepEqual(await full(owned.id), committed);
    });
    await check('capacity refusal leaves the entire original row intact', async () => {
      await admin.query(`INSERT INTO public.reservations (id,restaurant_id,reservation_id,customer_phone,date,time,party_size,status)
        VALUES ($1,$2,'occupied','15555550999','2099-01-02','20:00',2,'confirmed')`, [randomUUID(), owned.restaurant_id]);
      const before = await full(owned.id);
      refused(await rpc(a, owned, 'modify', { date: '2099-01-02', time: '20:00' }), 'unavailable');
      assert.deepEqual(await full(owned.id), before);
    });
    for (const status of ['completed', 'seated', 'no_show', 'cancelled']) {
      await check(`terminal ${status} cannot reschedule`, async () => {
        const row = await fixture({ status }); const before = await full(row.id);
        refused(await rpc(a, row, 'modify', { time: '20:00' }), 'invalid_status');
        assert.deepEqual(await full(row.id), before);
        if (status !== 'cancelled') refused(await rpc(a, row, 'cancel'), 'invalid_status');
      });
    }
    await check('pending cancellation changes once and preserves protected fields', async () => {
      const row = await fixture({ status: 'pending' }); const before = await full(row.id);
      assert.equal((await rpc(a, row, 'cancel')).changed, true);
      const after = await full(row.id);
      assert.equal(after.status, 'cancelled'); assert.deepEqual(after.table_ids, []);
      assert.deepEqual(without(after, ['status', 'table_ids']), without(before, ['status', 'table_ids']));
      const retry = await rpc(a, row, 'cancel'); assert.equal(retry.success, true); assert.equal(retry.changed, false);
      assert.deepEqual(await full(row.id), after);
    });
    await check('legacy array hours, split gaps, overnight service and last seating', async () => {
      const row = await fixture();
      const legacy = weekdays.map(day => ({ day, is_open: true, periods: [
        { open: '12:00', close: '15:00' }, { open: '18:00', close: '03:00' },
      ] }));
      await admin.query('UPDATE restaurant.restaurant_config SET business_hours=$2 WHERE id=$1', [row.restaurant_id, JSON.stringify(legacy)]);
      refused(await rpc(a, row, 'modify', { time: '16:00' }), 'outside_hours');
      refused(await rpc(a, row, 'modify', { time: '14:00' }), 'too_late');
      assert.equal((await rpc(a, row, 'modify', { date: '2099-01-02', time: '00:30' })).success, true);
      refused(await rpc(a, row, 'modify', { time: '02:00' }), 'too_late');
      await admin.query("UPDATE restaurant.restaurant_config SET timezone='invalid/zone' WHERE id=$1", [row.restaurant_id]);
      refused(await rpc(a, row, 'modify', { time: '00:45' }), 'timezone_unavailable');
    });
    for (const [first, second, secondName] of [[a, b, 'guest-mutations-b'], [b, a, 'guest-mutations-a']]) {
      await check(`same-owner concurrent partial reschedules serialize (${secondName} waits)`, async () => {
        const row = await fixture(); const before = await full(row.id);
        await first.query('BEGIN');
        let pending;
        try {
          assert.equal((await rpc(first, row, 'modify', { date: '2099-01-03' })).success, true);
          let settled = false;
          pending = rpc(second, row, 'modify', { time: '20:00' }).finally(() => { settled = true; });
          // Attach rejection handler immediately; the awaited assertion below
          // still sees it, while cleanup can always release the first lock.
          pending.catch(() => {});
          let locked = false;
          for (let attempt = 0; attempt < 40; attempt++) {
            const state = await admin.query("SELECT wait_event_type FROM pg_stat_activity WHERE application_name=$1 AND state='active'", [secondName]);
            if (state.rows.some(value => value.wait_event_type === 'Lock')) { locked = true; break; }
            await new Promise(resolve => setTimeout(resolve, 25));
          }
          assert.equal(locked, true, 'second request must wait for the restaurant row lock');
          assert.equal(settled, false);
          await first.query('COMMIT');
          assert.equal((await pending).success, true);
          const after = await full(row.id);
          assert.equal(after.date, '2099-01-03'); assert.equal(after.time, '20:00:00');
          assert.deepEqual(without(after, ['date', 'time', 'table_ids']), without(before, ['date', 'time', 'table_ids']));
          assert.equal((await admin.query('SELECT count(*)::integer AS n FROM public.reservations WHERE restaurant_id=$1', [row.restaurant_id])).rows[0].n, 1);
        } finally { await first.query('ROLLBACK'); if (pending) await pending.catch(() => {}); }
      });
    }
    console.log(`PASS ${checks} SQL integration cases. Aggregate seats only; voice direct-create concurrency is not covered.`);
  } finally {
    await Promise.allSettled([a.end(), b.end(), admin.end()]);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
