'use strict';
// Shared audit harness: loads a real handler from the audited worktree with
// supabase-js replaced by the disposable-Postgres client, and seeds fixtures.
const path = require('path');
const Module = require('module');
const { Pool } = require('pg');
const { createFakeClient } = require('./fake-supabase.cjs');

const REPO = process.env.AUDIT_REPO || path.resolve(__dirname, '../..');
const SOCK = process.env.AUDIT_SOCK;
if (!SOCK) throw new Error('AUDIT_SOCK is required (see run.sh)');

const pool = new Pool({ host: SOCK, port: 55441, user: 'postgres', database: 'audit', max: 8 });
const fake = createFakeClient(pool);

Object.assign(process.env, {
  SUPABASE_URL: 'http://fake.local', SUPABASE_SERVICE_ROLE_KEY: 'fake-service', SUPABASE_ANON_KEY: 'fake-anon',
  NODE_ENV: 'test',
});
delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;

const realLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === '@supabase/supabase-js') return { createClient: () => fake };
  return realLoad.apply(this, arguments);
};

function load(rel) { return require(path.join(REPO, rel)); }

function call(handler, { method = 'POST', query = {}, body = {}, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200, headers: {}, body: undefined,
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      getHeader(k) { return this.headers[k.toLowerCase()]; },
      status(code) { this.statusCode = code; return this; },
      json(obj) { this.body = obj; resolve(this); return this; },
      send(obj) { this.body = obj; resolve(this); return this; },
      end(obj) { this.body = obj; resolve(this); return this; },
    };
    const req = { method, query, body, headers: { 'x-forwarded-for': '203.0.113.7', ...headers },
      socket: { remoteAddress: '203.0.113.7' }, connection: { remoteAddress: '203.0.113.7' } };
    Promise.resolve(handler(req, res)).then(() => { if (res.body === undefined) resolve(res); }, reject);
  });
}

const R = '0761e937-6eec-44be-b1d7-000000000001';
const T1 = '11111111-1111-4111-8111-111111111111';
const DAY = '2026-11-25';
const HOURS = JSON.stringify(Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  .map(d => [d, { is_open: true, open_time: '18:00', close_time: '23:00' }])));
const GUESTS = {
  A: { code: 'RES-20261111-AAAAAAAAAAAA', phone: '+5511911110000', name: 'Ana Prova', time: '19:00', status: 'confirmed', date: DAY },
  B: { code: 'RES-20261111-BBBBBBBBBBBB', phone: '+5511922220000', name: 'Bruno Prova', time: '21:00', status: 'confirmed', date: DAY },
  C: { code: 'RES-20261101-CCCCCCCCCCCC', phone: '+5511933330000', name: 'Carla Prova', time: '19:00', status: 'completed', date: '2026-11-01' },
};

async function reset() {
  await pool.query('TRUNCATE public.reservations, public.tables, restaurant.restaurant_config CASCADE');
  await pool.query(`INSERT INTO restaurant.restaurant_config (id, business_hours, timezone, elevenlabs_webhook_secret, elevenlabs_agent_id)
    VALUES ($1, $2::jsonb, 'America/Sao_Paulo', 'el_whsec_audit_secret_0001', 'agent_audit_0001')`, [R, HOURS]);
  await pool.query(`INSERT INTO public.tables (id, table_number, capacity, restaurant_id) VALUES ($1, 1, 4, $2)`, [T1, R]);
  for (const g of Object.values(GUESTS)) {
    await pool.query(`INSERT INTO public.reservations (reservation_id, customer_name, customer_phone, customer_email, party_size,
      date, time, status, table_ids, restaurant_id, source) VALUES ($1,$2,$3,$4,4,$5,$6,$7,ARRAY[$8]::text[],$9,'voice')`,
      [g.code, g.name, g.phone, `${g.name.split(' ')[0].toLowerCase()}@example.test`, g.date, g.time, g.status, T1, R]);
  }
}

async function snapshot() {
  const { rows } = await pool.query(`SELECT reservation_id, date::text, to_char(time,'HH24:MI') AS time, party_size, status,
    table_ids FROM public.reservations ORDER BY reservation_id`);
  return rows;
}

// Independent oracle: seats in use per table at any overlapping moment, from
// raw rows and the restaurant's 90-minute duration — not the code under test.
async function overbookedTables() {
  const { rows } = await pool.query(`
    WITH live AS (SELECT r.*, (r.date + r.time) AS s, (r.date + r.time) + interval '90 minutes' AS e
      FROM public.reservations r WHERE lower(r.status) IN ('confirmed','pending','seated'))
    SELECT a.reservation_id AS a, b.reservation_id AS b, t AS table_id
    FROM live a JOIN live b ON a.reservation_id < b.reservation_id AND a.s < b.e AND b.s < a.e
    CROSS JOIN LATERAL unnest(a.table_ids) AS t WHERE t = ANY(b.table_ids)`);
  return rows;
}

module.exports = { pool, fake, load, call, reset, snapshot, overbookedTables, R, T1, DAY, GUESTS };
