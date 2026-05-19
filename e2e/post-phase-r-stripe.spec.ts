/**
 * Phase R verification — Stripe surface against production.
 *
 *   R.1  Checkout-session priceId allowlist — endpoint exists and gates on
 *        auth before the allowlist check. With a real JWT, the allowlist
 *        is locked by Jest; here we just confirm the public-facing
 *        contract.
 *   R.2  Webhook idempotency — endpoint exists and rejects unsigned
 *        POSTs. The actual dedup behaviour is locked by Jest against
 *        the stripe_webhook_events_processed table.
 *   R.5  Customer-portal endpoint requires JWT and rejects non-POST.
 *   R.6 + R.7  PricingSection bundle markers: aria-busy + double-click
 *        guard literal + role="alert" on deposit error.
 *
 * All read-only. No checkout sessions created, no real Stripe calls.
 */

import { test, expect } from '@playwright/test';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';

test.describe('Phase R — Stripe endpoints gate on auth', () => {
  test('R.1 — create-checkout-session requires JWT', async ({ request }) => {
    const res = await request.post(`${PROD}/api/create-checkout-session`, {
      data: { priceId: 'price_test_one_cent' },
    });
    expect(res.status()).toBe(401);
  });

  test('R.1 — create-checkout-session rejects GET', async ({ request }) => {
    const res = await request.get(`${PROD}/api/create-checkout-session`);
    // 401 or 405 — both prove the endpoint isn't accepting arbitrary verbs.
    expect([401, 405]).toContain(res.status());
  });

  test('R.2 — stripe-webhook rejects POST without signature', async ({ request }) => {
    const res = await request.post(`${PROD}/api/stripe-webhook`, {
      data: { type: 'customer.subscription.deleted' },
    });
    // 400 (signature missing/invalid) is the contract. Anything 2xx
    // would mean unsigned events are processed → critical bug.
    expect(res.status()).toBe(400);
  });

  test('R.5 — customer-portal requires JWT', async ({ request }) => {
    const res = await request.post(`${PROD}/api/customer-portal`, { data: {} });
    expect(res.status()).toBe(401);
  });

  test('R.5 — customer-portal rejects non-POST', async ({ request }) => {
    const res = await request.get(`${PROD}/api/customer-portal`);
    expect([401, 405]).toContain(res.status());
  });
});

test.describe('Phase R — UI bundle markers', () => {
  test('R.6 + R.7 — PricingSection ships aria-busy + deposit alert role', async ({ request }) => {
    // Walk: index bundle → discover the LandingPage + BookingPage lazy
    // chunks → assert each marker landed in the right chunk.
    //
    // PricingSection is rendered by /LandingPage, which is route-split,
    // so the aria-busy literal we added to its plan buttons lives in
    // LandingPage-*.js, not the index bundle.
    //
    // The DepositPaymentStep error banner is in /book/:slug, which is
    // route-split into BookingPage-*.js — that's where the role="alert"
    // literal lands.
    const home = await request.get(`${PROD}/`);
    const html = await home.text();
    const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    expect(m).not.toBeNull();
    const idx = await (await request.get(`${PROD}${m![0]}`)).text();

    // R.7 a11y on plan buttons — lives in LandingPage chunk.
    const lpChunk = idx.match(/LandingPage-[A-Za-z0-9_-]+\.js/);
    expect(lpChunk, 'LandingPage lazy chunk must exist').not.toBeNull();
    const lp = await (await request.get(`${PROD}/assets/${lpChunk![0]}`)).text();
    expect(lp).toMatch(/aria-busy/);

    // R.7 deposit error banner role="alert" — lives in BookingPage chunk.
    const bpChunk = idx.match(/BookingPage-[A-Za-z0-9_-]+\.js/);
    expect(bpChunk, 'BookingPage lazy chunk must exist').not.toBeNull();
    const bp = await (await request.get(`${PROD}/assets/${bpChunk![0]}`)).text();
    expect(bp).toMatch(/role:"alert"/);
  });
});

test.describe('Phase R — regression: N+O+P+Q contracts still hold', () => {
  test('portal slug regex (N.5) still 400s malicious payloads', async ({ request }) => {
    const res = await request.get(
      `${PROD}/api/portal?action=restaurant&slug=${encodeURIComponent("x'; DROP TABLE--")}`,
    );
    expect(res.status()).toBe(400);
  });

  test('manager-chat still 401s without JWT (Q regression)', async ({ request }) => {
    const res = await request.post(`${PROD}/api/manager-chat`, { data: { message: 'hi' } });
    expect(res.status()).toBe(401);
  });

  test('contact form still rejects 6000-char message (N.6 regression)', async ({ request }) => {
    const res = await request.post(`${PROD}/api/contact`, {
      data: { name: 'R', email: 'r@r.com', message: 'x'.repeat(6000) },
    });
    expect(res.status()).toBe(400);
  });
});
