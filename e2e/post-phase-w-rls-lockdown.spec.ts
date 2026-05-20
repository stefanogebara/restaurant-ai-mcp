/**
 * Phase W verification — RLS lockdown against production.
 *
 * Probe every newly-locked table through the public anon PostgREST endpoint
 * and assert it returns 0 rows (RLS denying) or an explicit auth/permission
 * error. Before Phase W, a caller holding the public anon key could read:
 *   - public.restaurant_registry  → per-tenant service-role keys
 *   - public.api_keys             → tenant API keys
 *   - public.pos_connections      → POS access_token + refresh_token
 *   - restaurant.reservations     → every tenant's bookings (PII)
 *   - public.guest_feedback       → every tenant's customer ratings
 *   - public.revenue_records      → every tenant's transactions
 * …and 12 more tables.
 *
 * The spec uses the same anon key Vercel ships to the browser bundle. A 200
 * with rows here means the lockdown regressed.
 */

import { test, expect } from '@playwright/test';

const PROD_URL = process.env.PW_BASE_URL || 'https://seatable.one';
const SUPABASE_URL = 'https://ckforlwdhewexyqljsaf.supabase.co';
// This is the published anon key — it lives in the production frontend bundle,
// so it is not a secret. Treating it as one would be cargo-cult security.
// Locking down what the anon key can read IS the security work.
const ANON_KEY = process.env.SEATABLE_ANON_KEY || '';

// Tables that should return empty arrays (RLS enabled, no policies for anon).
const LOCKED_PUBLIC_TABLES = [
  // W.1 — dropped or service-role-only
  'cron_config',
  'stripe_webhook_events_processed',
  // W.3 — sensitive tables that previously had RLS disabled
  'restaurant_registry', // contains supabase_service_role_key columns
  'guest_feedback',
  'whatsapp_sessions',
  'campaign_recipients',
  'customer_consent',
  'conversation_flags',
  'pos_menu_items',
  'revenue_records',
  'briefings_log',
  'waha_events',
];

test.describe('Phase W — public anon cannot read locked-down tables', () => {
  test.skip(!ANON_KEY, 'SEATABLE_ANON_KEY env var required for direct anon probes');

  for (const table of LOCKED_PUBLIC_TABLES) {
    test(`anon GET /rest/v1/${table} returns empty or 401/403`, async ({ request }) => {
      const res = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
      });
      // Accept either: 200 with empty array (RLS denied silently — Supabase
      // default), or 401/403 (REVOKE blocked access at the privilege layer).
      if (res.status() === 200) {
        const body = await res.json();
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBe(0);
      } else {
        expect([401, 403]).toContain(res.status());
      }
    });
  }

  test('W.1 zombies — public.api_keys + public.pos_connections are gone', async ({ request }) => {
    for (const table of ['api_keys', 'pos_connections']) {
      const res = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=count`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      });
      // PostgREST returns 404 for a missing table.
      expect([404, 401, 403]).toContain(res.status());
    }
  });
});

test.describe('Phase W — sensitive RPCs cannot be called by anon', () => {
  test.skip(!ANON_KEY, 'SEATABLE_ANON_KEY env var required');

  const LOCKED_RPCS = [
    { name: 'increment_usage',         payload: { p_restaurant_id: '00000000-0000-0000-0000-000000000000', p_metric_type: 'manager_ai_call', p_period: '2026-05-21' } },
    { name: 'retrieve_guest_memories', payload: { p_restaurant_id: '00000000-0000-0000-0000-000000000000', p_guest_phone: '+10000000000', p_query_embedding: Array(1536).fill(0) } },
    { name: 'match_manager_memories',  payload: { p_restaurant_id: '00000000-0000-0000-0000-000000000000', p_embedding: Array(1536).fill(0) } },
  ];

  for (const { name, payload } of LOCKED_RPCS) {
    test(`anon POST /rest/v1/rpc/${name} → 401/403/404`, async ({ request }) => {
      const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        data: payload,
      });
      // 401/403 from REVOKE EXECUTE; 404 if PostgREST decided it can't see it.
      // 400 is acceptable if the payload shape is rejected before auth.
      expect([400, 401, 403, 404]).toContain(res.status());
    });
  }
});

test.describe('Phase W — earlier phase contracts still hold', () => {
  test('Phase U/V cron auth gate still 401', async ({ request }) => {
    const res = await request.get(`${PROD_URL}/api/cron/check-late-reservations`);
    expect([401, 403, 405]).toContain(res.status());
  });

  test('Phase S Stripe webhook still rejects unsigned', async ({ request }) => {
    const res = await request.post(`${PROD_URL}/api/stripe-webhook`, {
      data: { type: 'customer.subscription.deleted' },
    });
    expect(res.status()).toBe(400);
  });

  test('Phase R checkout still 401 without JWT', async ({ request }) => {
    const res = await request.post(`${PROD_URL}/api/create-checkout-session`, {
      data: { priceId: 'price_test_one_cent' },
    });
    expect(res.status()).toBe(401);
  });
});
