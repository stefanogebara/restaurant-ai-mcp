/**
 * Phase V verification — production contracts for the cron hardening pass.
 *
 *   V.1  manager-briefings shuffle + hard cap (server-internal, not
 *        externally observable without firing the cron — locked by
 *        Jest tests).
 *   V.2  check-late-reservations timezone-aware filtering. Same caveat:
 *        without a real CRON_SECRET we can't fire the cron from a
 *        Playwright runner; we lock the AUTH gate publicly here.
 *   V.3  update-churn-scores per-restaurant revenue. Pure compute,
 *        Jest-locked.
 *   V.4  demo-nurture claim-then-send dedup. Pure DB-side semantics,
 *        Jest-locked.
 *   V.5  kill-switch fan-out: every cron we just wired must still 401
 *        on unauthenticated POST/GET. Any 2xx without a token is a
 *        critical regression (we'd be doing work for free or, worse,
 *        letting strangers nudge sends).
 *
 * Also regresses the earlier-phase contracts so this single run
 * doubles as a smoke check across O–U.
 */

import { test, expect } from '@playwright/test';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';

// V.5 wired isCronEnabled() into these 11 crons (manager-briefings
// already had it from Phase U). All 22 cron endpoints below must
// 401 unauthenticated — the kill switch sits AFTER the auth check
// so a malicious caller never reaches it.
const PHASE_V_WIRED_CRONS = [
  // V.5 fan-out
  '/api/cron/generate-reflections',
  '/api/cron/proactive-comms',
  '/api/cron/pre-reservation-upsell',
  '/api/cron/demo-nurture',
  '/api/cron/cleanup-expired-demos',
  '/api/cron/cleanup-waitlist',
  '/api/cron/cleanup-whatsapp-dedup',
  '/api/cron/refresh-restaurant-profiles',
  '/api/cron/warm-seo-cache',
  '/api/cron/check-late-reservations',
  '/api/cron/update-churn-scores',
];

// Earlier-phase wired crons — included to catch regressions where the
// Phase V edits might have accidentally relaxed a neighbouring file.
const PHASE_U_WIRED_CRONS = [
  '/api/cron/send-reminders',
  '/api/cron/send-campaigns',
  '/api/cron/send-feedback',
  '/api/cron/send-surveys',
  '/api/cron/manager-briefings?type=morning',
  '/api/cron/manager-briefings?type=end_of_day',
  '/api/cron/manager-alerts?type=low_covers',
  '/api/cron/manager-alerts?type=high_noshows',
  '/api/cron/manager-alerts?type=late_cancellations',
  '/api/report-usage',
];

test.describe('Phase V — V.5 kill-switch fan-out keeps auth gate ahead of skip path', () => {
  for (const path of PHASE_V_WIRED_CRONS) {
    test(`401 without Bearer: GET ${path}`, async ({ request }) => {
      const res = await request.get(`${PROD}${path}`);
      // 401 (auth) or 403 (combined sig+token) or 405 (POST-only) all
      // acceptable — what matters is the cron never does work for an
      // unauthenticated caller and never reveals the kill-switch state.
      expect([401, 403, 405]).toContain(res.status());
    });
  }

  test('kill-switch response is never reachable without auth', async ({ request }) => {
    // The `skipped: 'disabled_by_ops'` payload should never appear to
    // an unauthenticated caller — the auth guard returns first.
    const res = await request.get(`${PROD}/api/cron/demo-nurture`);
    expect(res.status()).not.toBe(200);
    const body = await res.text();
    expect(body).not.toMatch(/disabled_by_ops/i);
  });
});

test.describe('Phase V — earlier-phase contracts still hold (regression sweep)', () => {
  for (const path of PHASE_U_WIRED_CRONS) {
    test(`401 without Bearer: GET ${path}`, async ({ request }) => {
      const res = await request.get(`${PROD}${path}`);
      expect([401, 403, 405]).toContain(res.status());
    });
  }

  test('S.3 webhook still rejects unsigned POST', async ({ request }) => {
    const res = await request.post(`${PROD}/api/stripe-webhook`, {
      data: { type: 'customer.subscription.deleted' },
    });
    expect(res.status()).toBe(400);
  });

  test('R.1 create-checkout-session still 401 without JWT', async ({ request }) => {
    const res = await request.post(`${PROD}/api/create-checkout-session`, {
      data: { priceId: 'price_test_one_cent' },
    });
    expect(res.status()).toBe(401);
  });

  test('N.5 portal slug regex still 400s malicious payloads', async ({ request }) => {
    const res = await request.get(
      `${PROD}/api/portal?action=restaurant&slug=${encodeURIComponent("'; DROP TABLE--")}`,
    );
    expect(res.status()).toBe(400);
  });

  test('Q manager-whatsapp-verify still 401 without JWT', async ({ request }) => {
    const res = await request.post(`${PROD}/api/manager-whatsapp-verify`, {
      data: { action: 'confirm', code: '123456' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('Phase V — error responses do not leak kill-switch state', () => {
  test('wrong-token returns generic auth error, no hint about cron_config rows', async ({ request }) => {
    const res = await request.get(`${PROD}/api/cron/check-late-reservations`, {
      headers: { authorization: 'Bearer obviously-wrong-token' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/auth/i);
    // No mention of cron_config, kill switch, ops, disabled, etc.
    const serialized = JSON.stringify(body).toLowerCase();
    expect(serialized).not.toMatch(/cron_config|disabled_by_ops|kill[-_ ]?switch/);
  });
});
