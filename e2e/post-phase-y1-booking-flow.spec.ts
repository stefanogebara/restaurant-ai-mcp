/**
 * Phase Y.1 — Real booking flow end-to-end against production.
 *
 * The whole money-making path: a customer lands on /book/<slug>, picks a
 * date + time + party size, fills name + phone, submits. The server
 * inserts a row into restaurant.reservations + public.reservations and
 * the dashboard picks it up via realtime.
 *
 * Until this spec existed, NONE of that was covered by automated tests.
 * The Phase O–X work proved auth gates and RLS; nothing proved that the
 * core thing the business actually sells still works end-to-end.
 *
 * Tests run against the dedicated `api-chat-test-bistro` restaurant
 * (slug stable, designed for repeat testing). Each test reservation uses
 * a phone in the +10000000000 range with a Y1- prefix on the customer
 * name so cleanup is trivial.
 *
 * If SUPABASE_SERVICE_ROLE_KEY is set, the spec also probes the DB to
 * verify the row landed AND cleans up after itself. Without it, the
 * spec still locks the API contract.
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';
const SUPABASE_URL = 'https://ckforlwdhewexyqljsaf.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const TEST_RESTAURANT = {
  id: 'eee572c5-9f1a-4d96-a560-a92bfd747947',
  slug: 'api-chat-test-bistro',
  name: 'API Chat Test Bistrô',
};

// Today + 1 day, formatted YYYY-MM-DD.
function tomorrowISODate(): string {
  const d = new Date(Date.now() + 86400000);
  return d.toISOString().split('T')[0];
}

// All test reservations get the same Y1- prefix so cleanup is easy.
function freshTestId(): string {
  return `Y1-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// Try to construct the admin client AND verify the key works. A stale key
// in .env.local returns 401 on every probe — without this check the spec
// would fail noisily on env churn even when the API contract is fine.
let adminClient: ReturnType<typeof createClient> | null = SERVICE_ROLE
  ? createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
  : null;

async function adminClientValid(): Promise<boolean> {
  if (!adminClient) return false;
  const { error } = await adminClient.from('reservations').select('id').limit(1);
  if (error?.message?.toLowerCase()?.includes('invalid api key')) {
    adminClient = null;
    return false;
  }
  return true;
}

test.describe('Phase Y.1 — public booking API contract', () => {
  test('GET /api/portal?action=restaurant&slug=… resolves the test bistro', async ({ request }) => {
    const res = await request.get(
      `${PROD}/api/portal?action=restaurant&slug=${TEST_RESTAURANT.slug}`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(TEST_RESTAURANT.id);
    expect(body.data.business_hours).toBeTruthy();
  });

  test('GET availability returns at least one open slot for tomorrow', async ({ request }) => {
    const res = await request.get(
      `${PROD}/api/portal?action=availability&restaurant_id=${TEST_RESTAURANT.id}&date=${tomorrowISODate()}&party_size=2`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.slots)).toBe(true);
    const available = body.slots.filter((s: { available: boolean }) => s.available);
    expect(available.length).toBeGreaterThan(0);
  });

  test('GET /api/portal?action=reserve returns 405 (POST-only)', async ({ request }) => {
    const res = await request.get(`${PROD}/api/portal?action=reserve`);
    expect(res.status()).toBe(405);
  });
});

test.describe('Phase Y.1 — input validation', () => {
  const validPayload = (overrides: Record<string, unknown> = {}) => ({
    restaurant_id: TEST_RESTAURANT.id,
    customer_name: 'Y1-validation',
    customer_phone: '+5511999990001',
    party_size: 2,
    date: tomorrowISODate(),
    time: '19:00',
    ...overrides,
  });

  test('400 on missing required fields', async ({ request }) => {
    const res = await request.post(`${PROD}/api/portal?action=reserve`, {
      data: { restaurant_id: TEST_RESTAURANT.id },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/required/i);
  });

  test('400 on too-short phone', async ({ request }) => {
    const res = await request.post(`${PROD}/api/portal?action=reserve`, {
      data: validPayload({ customer_phone: '+551234' }),
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/phone/i);
  });

  test('400 on past date', async ({ request }) => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const res = await request.post(`${PROD}/api/portal?action=reserve`, {
      data: validPayload({ date: yesterday }),
    });
    expect(res.status()).toBe(400);
  });

  test('400 on bad date format', async ({ request }) => {
    const res = await request.post(`${PROD}/api/portal?action=reserve`, {
      data: validPayload({ date: '21/05/2026' }),
    });
    expect(res.status()).toBe(400);
  });

  test('400 on bad time format', async ({ request }) => {
    const res = await request.post(`${PROD}/api/portal?action=reserve`, {
      data: validPayload({ time: '7pm' }),
    });
    expect(res.status()).toBe(400);
  });

  test('400 on party_size out of range', async ({ request }) => {
    const tooLarge = await request.post(`${PROD}/api/portal?action=reserve`, {
      data: validPayload({ party_size: 50 }),
    });
    expect(tooLarge.status()).toBe(400);

    const zero = await request.post(`${PROD}/api/portal?action=reserve`, {
      data: validPayload({ party_size: 0 }),
    });
    expect(zero.status()).toBe(400);
  });

  test('404 on unknown restaurant_id', async ({ request }) => {
    const res = await request.post(`${PROD}/api/portal?action=reserve`, {
      data: validPayload({ restaurant_id: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status()).toBe(404);
  });
});

test.describe('Phase Y.1 — happy path E2E', () => {
  // Track every reservation_id we create so afterAll can clean up.
  const createdReservationIds: string[] = [];
  let canProbeDB = false;

  test.beforeAll(async () => {
    canProbeDB = await adminClientValid();
  });

  test.afterAll(async () => {
    if (!adminClient || createdReservationIds.length === 0) return;
    await adminClient
      .from('reservations')
      .delete()
      .in('reservation_id', createdReservationIds);
  });

  test('POST /api/portal?action=reserve creates a reservation and returns 200', async ({ request }) => {
    const customerName = freshTestId();
    const phone = `+551199999${Math.floor(1000 + Math.random() * 8999)}`;

    const res = await request.post(`${PROD}/api/portal?action=reserve`, {
      data: {
        restaurant_id: TEST_RESTAURANT.id,
        customer_name: customerName,
        customer_phone: phone,
        party_size: 2,
        date: tomorrowISODate(),
        time: '19:00',
        special_requests: 'E2E test — safe to delete',
      },
    });
    // POST returns 201 Created (per REST convention) — accept 200 too in
    // case the convention slides back.
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.reservation).toBeTruthy();
    // The handler returns the human-formatted reservation code on `.id`
    // (e.g. `RES-20260521-lm4nIBfdixmK`). That's the value stored in the
    // `reservation_id` column of public.reservations.
    expect(body.reservation.id).toMatch(/^RES-/);
    expect(body.reservation.party_size).toBe(2);
    createdReservationIds.push(body.reservation.id);

    // Optional DB probe: confirm the row actually exists with the right tenant scope.
    if (canProbeDB && adminClient) {
      const { data, error } = await adminClient
        .from('reservations')
        .select('restaurant_id, customer_name, customer_phone, party_size, date, time, status')
        .eq('reservation_id', body.reservation.id)
        .single();
      expect(error).toBeNull();
      expect(data?.restaurant_id).toBe(TEST_RESTAURANT.id);
      expect(data?.customer_name).toBe(customerName);
      expect(data?.party_size).toBe(2);
    }
  });

  test('XSS payload in customer_name is sanitized before write', async ({ request }) => {
    test.skip(!canProbeDB, 'Need a valid SUPABASE_SERVICE_ROLE_KEY to verify the stored value');

    const customerName = `${freshTestId()}-<script>alert(1)</script>`;
    const phone = `+551199998${Math.floor(1000 + Math.random() * 8999)}`;

    const res = await request.post(`${PROD}/api/portal?action=reserve`, {
      data: {
        restaurant_id: TEST_RESTAURANT.id,
        customer_name: customerName,
        customer_phone: phone,
        party_size: 2,
        date: tomorrowISODate(),
        time: '19:30',
      },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    createdReservationIds.push(body.reservation.id);

    const { data } = await adminClient!
      .from('reservations')
      .select('customer_name')
      .eq('reservation_id', body.reservation.id)
      .single();
    expect(data?.customer_name).not.toMatch(/<script>/i);
  });

  test('booking page renders the form shell after hydration', async ({ page }) => {
    await page.goto(`${PROD}/book/${TEST_RESTAURANT.slug}`, { waitUntil: 'networkidle' });
    // Don't pin to the restaurant name — i18n + special chars (ô) make that
    // brittle. Instead wait for any form field labelled "guest"/"reservation"-
    // adjacent, which every public booking page exposes regardless of locale.
    const phoneInputs = page.locator('input[type="tel"]');
    await expect(phoneInputs.first()).toBeVisible({ timeout: 15000 });
    // The form needs at least one date selector button (each day is a button).
    const dateButtons = page.getByRole('button', { name: /\d/ });
    expect(await dateButtons.count()).toBeGreaterThan(0);
  });
});

test.describe('Phase Y.1 — regression: tenant lookup + portal contract', () => {
  test('unknown slug → 404 (no info leak)', async ({ request }) => {
    const res = await request.get(
      `${PROD}/api/portal?action=restaurant&slug=this-slug-definitely-does-not-exist-12345`,
    );
    expect([404, 400]).toContain(res.status());
  });

  test('Phase N.5 portal slug regex still 400s SQL-style payloads', async ({ request }) => {
    const res = await request.get(
      `${PROD}/api/portal?action=restaurant&slug=${encodeURIComponent("'; DROP TABLE--")}`,
    );
    expect(res.status()).toBe(400);
  });
});
