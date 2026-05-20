/**
 * Phase S + T verification — billing-accuracy + downgrade-grace +
 * restaurant-currency hardening against production.
 *
 * Most of Phase S + T is server-side state that can't be triggered
 * externally without real JWTs / Stripe-signed events / a real cron
 * invocation. The Jest suite (40 tests) locks the business logic;
 * this Playwright spec covers what IS publicly observable:
 *
 *   S.3 Webhook raw-body hardening — unsigned POST → 400 (regression
 *       check: the new accept-rawBody-or-Buffer-or-string guard
 *       didn't accidentally let unsigned events through).
 *   S.4 Email-fallback observability — server-side log change, can't
 *       observe externally. Locked by Jest in stripe-webhook.test.js.
 *   S.1 Cancellation netting — the new metric ships via trackUsage()
 *       which is fire-and-forget; can't probe externally. Smoke-test
 *       the cancel endpoint shape instead.
 *   T.1 Downgrade grace + middleware hard-block — needs a real
 *       authenticated session + actual mid-cycle downgrade event to
 *       trigger. Locked by Jest. Probe limit endpoint shape here.
 *   T.2 UpgradePrompt restaurant-currency — bundle marker check on
 *       the UpgradePrompt-*.js lazy chunk: it must now import
 *       useSubscriptionData (the hook that returns subscription.currency).
 *
 * Read-only — no DB writes, no real Stripe calls.
 */

import { test, expect } from '@playwright/test';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';

test.describe('Phase S — Stripe webhook + cancel endpoint', () => {
  test('S.3 webhook STILL rejects unsigned POST (raw-body hardening regression)', async ({ request }) => {
    // The Phase S hardening removed `JSON.stringify(req.body)` fallback.
    // The endpoint must continue to 400 unsigned POSTs — anything 2xx
    // would mean we re-introduced the silent signature-bypass gap.
    const res = await request.post(`${PROD}/api/stripe-webhook`, {
      data: { type: 'customer.subscription.deleted', data: { object: {} } },
    });
    expect(res.status()).toBe(400);
  });

  test('S.3 webhook rejects POST with a malformed stripe-signature header', async ({ request }) => {
    const res = await request.post(`${PROD}/api/stripe-webhook`, {
      data: { type: 'invoice.payment_succeeded' },
      headers: { 'stripe-signature': 't=1,v1=garbage' },
    });
    // 400 is the contract on signature mismatch.
    expect(res.status()).toBe(400);
  });

  test('S.1 cancel endpoint still requires auth + correct shape (path exists)', async ({ request }) => {
    // The cancellation path is what fires trackUsage('reservation_cancelled').
    // Public unauthenticated probe must 400/401/405 — anything 2xx
    // would mean the endpoint shape regressed.
    const res = await request.post(`${PROD}/api/reservations?action=cancel`, {
      data: { reservation_id: 'RES-PROBE-1' },
    });
    // No JWT → either 401 (auth gate) or 400 (validation). Both prove
    // the cancel handler is reachable + gating correctly.
    expect([400, 401, 405]).toContain(res.status());
  });

  test('S.1 customer-reservation cancel endpoint still gated on POST', async ({ request }) => {
    const res = await request.get(`${PROD}/api/customer-reservation?action=cancel`);
    expect([400, 401, 405]).toContain(res.status());
  });
});

test.describe('Phase T — endpoint surface + UpgradePrompt bundle', () => {
  test('T.1 manager-chat still 401s (regression — middleware unchanged for auth path)', async ({ request }) => {
    // The middleware change in T.1 added a 402 hard-block path for
    // post-downgrade overage. The auth gate ahead of it must still
    // 401 unauthenticated requests — otherwise we exposed a
    // pre-middleware endpoint that bypasses the new enforcement.
    const res = await request.post(`${PROD}/api/manager-chat`, { data: { message: 'hi' } });
    expect(res.status()).toBe(401);
  });

  test('T.1 reservations creation endpoint still 401s without JWT', async ({ request }) => {
    // The downgrade-grace hard-block lives behind auth; verify the auth
    // gate is unchanged.
    const res = await request.post(`${PROD}/api/reservations?action=create`, {
      data: { date: '2026-06-01', time: '19:30', party_size: 2 },
    });
    // 401 (auth required) or 400 (missing fields). Both prove the
    // endpoint gates correctly.
    expect([400, 401]).toContain(res.status());
  });

  test('T.2 UpgradePrompt chunk imports the subscription-management hook', async ({ request }) => {
    // Walk: home → index bundle → discover UpgradePrompt-*.js chunk →
    // grep for stable markers that survive Vite minification.
    //
    // Named JS imports (`useSubscriptionData`) get renamed to single
    // letters by minifier; ONLY the import-source PATH stays as a
    // literal string (used at runtime for dynamic resolution). So
    // the chunk emits a line like:
    //   import{u as b}from"./useSubscriptionManage-XXXXX.js";
    // We assert the filename literal + the fallback shape
    // `?.currency??` (the inline `subscription?.currency ?? fallback`
    // pattern from UpgradePrompt's T.2 fix).
    const home = await request.get(`${PROD}/`);
    const html = await home.text();
    const idxMatch = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    expect(idxMatch).not.toBeNull();
    const idx = await (await request.get(`${PROD}${idxMatch![0]}`)).text();

    const chunkMatch = idx.match(/UpgradePrompt-[A-Za-z0-9_-]+\.js/);
    expect(chunkMatch, 'UpgradePrompt lazy chunk must exist').not.toBeNull();

    const chunk = await (await request.get(`${PROD}/assets/${chunkMatch![0]}`)).text();
    // Import-source filename — minification-stable.
    expect(chunk).toMatch(/useSubscriptionManage-[A-Za-z0-9_-]+\.js/);
    // `?.currency??` — the literal nullish-coalescing fallback from
    // UpgradePrompt.tsx's T.2 fix. If a future refactor reverts the
    // fix back to plain currencyFromLanguage, this regex stops matching.
    expect(chunk).toMatch(/\?\.currency\?\?/);
  });

  test('T.2 SubscriptionManage chunk still pulls currency from subscription', async ({ request }) => {
    // Regression: this surface was already correct pre-T but a
    // refactor could break it. Same minification-stable markers.
    const home = await request.get(`${PROD}/`);
    const html = await home.text();
    const idxMatch = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    const idx = await (await request.get(`${PROD}${idxMatch![0]}`)).text();
    const chunkMatch = idx.match(/SubscriptionManage-[A-Za-z0-9_-]+\.js/);
    expect(chunkMatch).not.toBeNull();
    const chunk = await (await request.get(`${PROD}/assets/${chunkMatch![0]}`)).text();
    expect(chunk).toMatch(/useSubscriptionManage-[A-Za-z0-9_-]+\.js/);
    // SubscriptionManage uses `subscription?.currency` with a cast +
    // language fallback (line 88 of source). The `?.currency` literal
    // survives.
    expect(chunk).toMatch(/\?\.currency/);
  });
});

test.describe('Phase S+T — regression: earlier-phase contracts still hold', () => {
  test('R.1 create-checkout-session priceId allowlist still 401s without JWT', async ({ request }) => {
    const res = await request.post(`${PROD}/api/create-checkout-session`, {
      data: { priceId: 'price_test_one_cent' },
    });
    expect(res.status()).toBe(401);
  });

  test('R.5 customer-portal still 401s without JWT', async ({ request }) => {
    const res = await request.post(`${PROD}/api/customer-portal`, { data: {} });
    expect(res.status()).toBe(401);
  });

  test('N.5 portal slug regex still 400s malicious payloads', async ({ request }) => {
    const res = await request.get(
      `${PROD}/api/portal?action=restaurant&slug=${encodeURIComponent("'; DROP TABLE--")}`,
    );
    expect(res.status()).toBe(400);
  });

  test('N.6 contact form still rejects 6000-char message', async ({ request }) => {
    const res = await request.post(`${PROD}/api/contact`, {
      data: { name: 'S', email: 's@s.com', message: 'x'.repeat(6000) },
    });
    expect(res.status()).toBe(400);
  });

  test('Q manager-whatsapp-verify still 401s without JWT', async ({ request }) => {
    const res = await request.post(`${PROD}/api/manager-whatsapp-verify`, {
      data: { action: 'confirm', code: '123456' },
    });
    expect(res.status()).toBe(401);
  });

  test('P.2 elevenlabs-signed-url still 401s without JWT', async ({ request }) => {
    const res = await request.get(`${PROD}/api/elevenlabs-signed-url`);
    expect(res.status()).toBe(401);
  });
});
