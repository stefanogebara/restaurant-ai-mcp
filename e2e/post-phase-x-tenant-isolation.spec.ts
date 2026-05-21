/**
 * Phase X.3 — Production cross-tenant isolation via Playwright.
 *
 * Mints two `authenticated`-role JWTs (Tenant A, Tenant B) with the Supabase
 * JWT secret and probes production /api/* endpoints. Catches any handler that
 * runs queries with `supabaseAdmin` and forgets to filter by restaurant_id —
 * a bug the DB-layer RLS can't catch (service_role bypasses RLS).
 *
 * Requires SUPABASE_JWT_SECRET in env. Skips gracefully when absent so CI
 * runs that don't carry the secret still pass.
 */

import { test, expect } from '@playwright/test';
import * as jwt from 'jsonwebtoken';

const PROD          = process.env.PW_BASE_URL || 'https://seatable.one';
const JWT_SECRET    = process.env.SUPABASE_JWT_SECRET || '';

const TENANT_A = {
  restaurant_id: 'a1eba1b2-d235-4472-854e-45899e4923fd',
  user_id:       'b460d5df-3254-4801-8ccd-0752c2eaf4b4',
};
const TENANT_B = {
  restaurant_id: 'e36998dd-ef53-493f-b42e-98f214c63774',
  user_id:       '4bc6295c-82e6-480a-84fc-f70c08e6cfa9',
};

function mintJwt(userId: string, restaurantId: string): string {
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

test.describe('Phase X.3 — production cross-tenant isolation', () => {
  test.skip(!JWT_SECRET, 'SUPABASE_JWT_SECRET env var required to mint test JWTs');

  let tokenA: string;
  let tokenB: string;

  test.beforeAll(() => {
    tokenA = mintJwt(TENANT_A.user_id, TENANT_A.restaurant_id);
    tokenB = mintJwt(TENANT_B.user_id, TENANT_B.restaurant_id);
  });

  test('GET /api/host-dashboard with Tenant A JWT returns only Tenant A rows', async ({ request }) => {
    const res = await request.get(`${PROD}/api/host-dashboard`, {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    // 200 OK with data, 404 if endpoint doesn't expose this path, or
    // 401 if the JWT shape isn't recognised by the handler. Any of those
    // is acceptable — what we forbid is leaking another tenant's data.
    expect([200, 401, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      const allRows = [
        ...(body?.reservations || []),
        ...(body?.activeParties || []),
        ...(body?.waitlist || []),
      ];
      const foreignRows = allRows.filter(
        (r: { restaurant_id?: string }) =>
          r.restaurant_id && r.restaurant_id !== TENANT_A.restaurant_id,
      );
      expect(foreignRows.length).toBe(0);
    }
  });

  test('GET /api/reservations with Tenant A JWT cannot read Tenant B reservation IDs', async ({ request }) => {
    // First, ask as Tenant B to discover ONE B-owned reservation ID.
    const bRes = await request.get(`${PROD}/api/reservations?limit=1`, {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    if (bRes.status() !== 200) {
      test.skip(true, `Skip: /api/reservations not reachable for Tenant B (${bRes.status()})`);
    }
    const bBody = await bRes.json();
    const bReservationId =
      bBody?.reservations?.[0]?.reservation_id ?? bBody?.data?.[0]?.reservation_id ?? null;
    if (!bReservationId) {
      test.skip(true, 'Tenant B has no reservations to probe');
    }

    // Then attempt to read that specific ID as Tenant A.
    const aRes = await request.get(
      `${PROD}/api/reservations?reservation_id=${encodeURIComponent(bReservationId!)}`,
      { headers: { authorization: `Bearer ${tokenA}` } },
    );
    expect([200, 404]).toContain(aRes.status());
    if (aRes.status() === 200) {
      const body = await aRes.json();
      const rows = body?.reservations ?? body?.data ?? [];
      expect(rows.length).toBe(0);
    }
  });

  test('Tenant A POST /api/reservations cannot specify a different restaurant_id', async ({ request }) => {
    const res = await request.post(`${PROD}/api/reservations`, {
      headers: { authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      data: {
        // The handler should derive restaurant_id from the JWT, not the body.
        // If a buggy handler accepts the body's restaurant_id, this would land
        // a row in Tenant B's data.
        restaurant_id: TENANT_B.restaurant_id,
        customer_name: 'X3-cross-tenant',
        customer_phone: '+10000000099',
        party_size: 2,
        date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        time: '19:00',
      },
    });
    // We accept either a clean rejection (400/403/422), or a success that
    // the handler scoped back to Tenant A's restaurant_id (we'd verify the
    // returned restaurant_id matches A, never B).
    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      const written = body?.reservation?.restaurant_id ?? body?.restaurant_id;
      expect(written).not.toBe(TENANT_B.restaurant_id);
    } else {
      expect([400, 401, 403, 404, 422]).toContain(res.status());
    }
  });
});

test.describe('Phase X.3 — auth-gate regression', () => {
  test('cron auth still 401 without bearer (regression check from V)', async ({ request }) => {
    const res = await request.get(`${PROD}/api/cron/check-late-reservations`);
    expect([401, 403, 405]).toContain(res.status());
  });
});
