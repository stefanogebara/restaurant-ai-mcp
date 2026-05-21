/**
 * Phase X.2 — Tenant-isolation Jest spec.
 *
 * Mints two JWTs (one per tenant), instantiates Supabase JS clients with each,
 * and asserts that every cross-tenant CRUD attempt against public.reservations
 * is denied by RLS. Skipped when SUPABASE_JWT_SECRET isn't set (CI without
 * the secret can still run the rest of the suite).
 *
 * Why this exists when X.1 already proved the same thing in SQL:
 *   - X.1 ran inside the DB. This runs through PostgREST + supabase-js, the
 *     same path the real browser takes. If a future hand-rolled handler ever
 *     hits PostgREST with a JWT and forgets the restaurant_id filter, X.2
 *     catches it; X.1 cannot.
 *   - Lives next to the rest of the Jest suite, so `npx jest --forceExit`
 *     surfaces RLS regressions on every CI run.
 */

const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL    = process.env.SUPABASE_URL    || 'https://ckforlwdhewexyqljsaf.supabase.co';
const SUPABASE_ANON   = process.env.SUPABASE_ANON_KEY;
const JWT_SECRET      = process.env.SUPABASE_JWT_SECRET;
const SERVICE_ROLE    = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Real tenant pairs pulled from production restaurant_config. Both are
// long-lived, idle restaurants — using them avoids creating throwaway users.
const TENANT_A = {
  restaurant_id: 'a1eba1b2-d235-4472-854e-45899e4923fd',
  user_id:       'b460d5df-3254-4801-8ccd-0752c2eaf4b4',
};
const TENANT_B = {
  restaurant_id: 'e36998dd-ef53-493f-b42e-98f214c63774',
  user_id:       '4bc6295c-82e6-480a-84fc-f70c08e6cfa9',
};

function mintJwt(userId, restaurantId) {
  return jwt.sign(
    {
      sub:           userId,
      restaurant_id: restaurantId,
      role:          'authenticated',
      aud:           'authenticated',
      iat:           Math.floor(Date.now() / 1000),
      exp:           Math.floor(Date.now() / 1000) + 60 * 5,
    },
    JWT_SECRET,
    { algorithm: 'HS256' },
  );
}

function clientFor(jwtToken) {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    global: { headers: { Authorization: `Bearer ${jwtToken}` } },
    auth:   { persistSession: false, autoRefreshToken: false },
  });
}

const havePrereqs = SUPABASE_ANON && JWT_SECRET && SERVICE_ROLE;
const describeIf = havePrereqs ? describe : describe.skip;

describeIf('Phase X.2 — RLS isolation via supabase-js + minted JWTs', () => {
  const adminClient = SERVICE_ROLE
    ? createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
    : null;

  let tokenA;
  let tokenB;
  let clientA;
  let clientB;
  let testReservationId;

  beforeAll(() => {
    tokenA = mintJwt(TENANT_A.user_id, TENANT_A.restaurant_id);
    tokenB = mintJwt(TENANT_B.user_id, TENANT_B.restaurant_id);
    clientA = clientFor(tokenA);
    clientB = clientFor(tokenB);
    testReservationId = `TEST-X2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  afterAll(async () => {
    if (adminClient && testReservationId) {
      await adminClient.from('reservations').delete().eq('reservation_id', testReservationId);
    }
  });

  test('Tenant A can INSERT into own restaurant', async () => {
    const { data, error } = await clientA.from('reservations').insert({
      reservation_id: testReservationId,
      restaurant_id:  TENANT_A.restaurant_id,
      customer_name:  'X2-A',
      customer_phone: '+10000000002',
      party_size:     2,
      date:           new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      time:           '19:00',
      status:         'confirmed',
    }).select('id').single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  test('Tenant A CANNOT INSERT into Tenant B (WITH CHECK violation)', async () => {
    const { data, error } = await clientA.from('reservations').insert({
      reservation_id: `${testReservationId}-cross`,
      restaurant_id:  TENANT_B.restaurant_id, // <-- cross-tenant attempt
      customer_name:  'X2-A-cross',
      customer_phone: '+10000000003',
      party_size:     1,
      date:           new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      time:           '19:00',
      status:         'confirmed',
    }).select();
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  test('Tenant B cannot SEE Tenant A\'s reservation by ID', async () => {
    const { data, error } = await clientB
      .from('reservations')
      .select('id, customer_name')
      .eq('reservation_id', testReservationId);
    // Either empty array (RLS filtered) or error — both prove isolation.
    if (error) {
      // Acceptable — RLS may surface as an error.
    } else {
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    }
  });

  test('Tenant B\'s UPDATE targeting Tenant A row affects 0 rows', async () => {
    const { data, error } = await clientB
      .from('reservations')
      .update({ customer_name: 'HIJACKED' })
      .eq('reservation_id', testReservationId)
      .select();
    if (!error) {
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    }
    // Confirm via admin client that the row was not actually mutated.
    if (adminClient) {
      const { data: adminRow } = await adminClient
        .from('reservations')
        .select('customer_name')
        .eq('reservation_id', testReservationId)
        .single();
      expect(adminRow?.customer_name).toBe('X2-A');
    }
  });

  test('Tenant B\'s DELETE targeting Tenant A row affects 0 rows', async () => {
    const { data, error } = await clientB
      .from('reservations')
      .delete()
      .eq('reservation_id', testReservationId)
      .select();
    if (!error) {
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(0);
    }
    if (adminClient) {
      const { data: adminRow } = await adminClient
        .from('reservations')
        .select('id')
        .eq('reservation_id', testReservationId)
        .single();
      expect(adminRow?.id).toBeTruthy();
    }
  });

  test('Tenant A only sees own restaurant_id rows in unconstrained SELECT', async () => {
    const { data, error } = await clientA
      .from('reservations')
      .select('restaurant_id')
      .limit(100);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    const foreign = (data || []).filter((r) => r.restaurant_id !== TENANT_A.restaurant_id);
    expect(foreign.length).toBe(0);
  });
});
