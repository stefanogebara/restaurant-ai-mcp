/**
 * Phase Z — POS revenue ingestion contract.
 *
 * Locks the negative path on /api/square/webhook (the new endpoint) and
 * regresses /api/pos/service-completion (refactored to share the core).
 *
 * Z.1  audit (no test — desk work)
 * Z.2  square-webhook signature gate + method routing                 ← here
 * Z.3  reservation matcher is exercised by Jest unit tests, not E2E
 * Z.4  update-churn-scores prefers revenue_records — Jest covers it
 * Z.5  this spec
 */

import { test, expect } from '@playwright/test';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';
const SQUARE_WEBHOOK_PATH = '/api/square/webhook';

test.describe('Phase Z — Square webhook signature gate', () => {
  // Minimal-but-shape-valid Square payment.created payload.
  const payload = {
    type: 'payment.created',
    merchant_id: 'TEST_MERCHANT',
    event_id: `evt_${Date.now()}`,
    created_at: new Date().toISOString(),
    data: {
      type: 'payment',
      object: {
        payment: {
          id: `pmt_${Date.now()}`,
          status: 'COMPLETED',
          amount_money: { amount: 7500, currency: 'BRL' },
          source_type: 'CARD',
          buyer_phone_number: '+10000000099',
          created_at: new Date().toISOString(),
        },
      },
    },
  };

  test('POST without x-square-hmacsha256-signature → 401', async ({ request }) => {
    const res = await request.post(`${PROD}${SQUARE_WEBHOOK_PATH}`, {
      data: payload,
      headers: { 'Content-Type': 'application/json' },
    });
    // 401 — signature required, 503 — secret not configured.
    // Either is acceptable; both prove the gate runs before any DB write.
    expect([401, 503]).toContain(res.status());
  });

  test('POST with malformed signature → 401', async ({ request }) => {
    const res = await request.post(`${PROD}${SQUARE_WEBHOOK_PATH}`, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'x-square-hmacsha256-signature': 'not-a-valid-signature',
      },
    });
    expect([401, 503]).toContain(res.status());
  });

  test('POST with valid-shape but wrong-key signature → 401', async ({ request }) => {
    // 44-char base64 of 32 random bytes — looks like a valid HMAC-SHA256
    // but wasn't signed with the real key.
    const fakeSig = Buffer.from('a'.repeat(32)).toString('base64');
    const res = await request.post(`${PROD}${SQUARE_WEBHOOK_PATH}`, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'x-square-hmacsha256-signature': fakeSig,
      },
    });
    expect([401, 503]).toContain(res.status());
  });
});

test.describe('Phase Z — Square webhook method gates', () => {
  for (const method of ['get', 'put', 'delete', 'patch'] as const) {
    test(`${method.toUpperCase()} ${SQUARE_WEBHOOK_PATH} → 405`, async ({ request }) => {
      const res = await (request[method] as typeof request.post)(
        `${PROD}${SQUARE_WEBHOOK_PATH}`,
        { data: {} },
      );
      expect(res.status()).toBe(405);
    });
  }
});

test.describe('Phase Z — pos/service-completion still gates on API key', () => {
  test('POST without X-API-Key → 401', async ({ request }) => {
    const res = await request.post(`${PROD}/api/pos/service-completion`, {
      data: {
        customer_phone: '+10000000099',
        customer_name: 'Z-probe',
        party_size: 2,
        total_bill: 50,
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('POST with garbage X-API-Key → 401/403', async ({ request }) => {
    const res = await request.post(`${PROD}/api/pos/service-completion`, {
      data: {
        customer_phone: '+10000000099',
        customer_name: 'Z-probe',
        party_size: 2,
        total_bill: 50,
      },
      headers: { 'X-API-Key': 'sk_obviously_wrong' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('GET → 405 (POST-only)', async ({ request }) => {
    const res = await request.get(`${PROD}/api/pos/service-completion`);
    expect(res.status()).toBe(405);
  });
});

test.describe('Phase Z — revenue_records + pos_connections still RLS-locked (W regression)', () => {
  test.skip(!process.env.SEATABLE_ANON_KEY, 'Need SEATABLE_ANON_KEY for anon probe');

  const SUPABASE_URL = 'https://ckforlwdhewexyqljsaf.supabase.co';
  const ANON = process.env.SEATABLE_ANON_KEY || '';

  test('anon cannot GET /rest/v1/revenue_records (W.3 still holds)', async ({ request }) => {
    const res = await request.get(
      `${SUPABASE_URL}/rest/v1/revenue_records?select=*&limit=1`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
    );
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });

  test('anon cannot list pos_connections (sensitive tokens)', async ({ request }) => {
    // restaurant.* tables aren't exposed by default — expect 404 from PostgREST
    // (the schema is denied at the API layer too). Either way: not 200 with rows.
    const res = await request.get(
      `${SUPABASE_URL}/rest/v1/pos_connections?select=*&limit=1`,
      { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } },
    );
    if (res.status() === 200) {
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    } else {
      expect([401, 403, 404]).toContain(res.status());
    }
  });
});
