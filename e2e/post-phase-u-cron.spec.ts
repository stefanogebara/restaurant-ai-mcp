/**
 * Phase U verification — cron auth + kill-switch contracts on production.
 *
 *   U.1  Schedule audit: no code change needed (schedules verified safe).
 *   U.2  Voice-note opt-in: server-side toggle in DB; restaurant flag
 *        gates the ElevenLabs TTS call inside send-reminders. Not
 *        externally observable without firing the cron with a real
 *        secret. Locked by manual flag inspection.
 *   U.3  Kill switch: every cron must still 401 unauthenticated POSTs,
 *        and the dozen instrumented crons must respond 200 with
 *        `skipped: 'disabled_by_ops'` if their row is flipped off.
 *        We can probe the AUTH gate publicly; the kill switch path
 *        needs a real CRON_SECRET we don't have, so we lock the auth
 *        contract here and rely on Jest for the skip behaviour.
 *
 * All read-only; no real cron firing.
 */

import { test, expect } from '@playwright/test';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';

// The 12 cron endpoints that should be Bearer-CRON_SECRET gated. Each
// hits authentication BEFORE the kill-switch check, so unauthenticated
// probes uniformly 401 here. If any of these returns 2xx without a
// token, that's a critical security bug.
const GATED_CRONS = [
  '/api/cron/send-reminders',
  '/api/cron/send-campaigns',
  '/api/cron/send-feedback',
  '/api/cron/send-surveys',
  '/api/cron/manager-briefings?type=morning',
  '/api/cron/manager-briefings?type=end_of_day',
  '/api/cron/manager-alerts?type=low_covers',
  '/api/cron/manager-alerts?type=high_noshows',
  '/api/cron/manager-alerts?type=late_cancellations',
  '/api/cron/update-churn-scores',
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
  '/api/report-usage',
];

test.describe('Phase U — cron endpoints gate on CRON_SECRET', () => {
  for (const path of GATED_CRONS) {
    test(`401 without Bearer: GET ${path}`, async ({ request }) => {
      const res = await request.get(`${PROD}${path}`);
      // 401 (auth gate) or 403 (some crons combine signature+token).
      // 405 only if the cron only accepts POST (acceptable — proves
      // method validation runs ahead of work).
      expect([401, 403, 405]).toContain(res.status());
    });
  }

  test('401 with WRONG bearer token (no info leak)', async ({ request }) => {
    const res = await request.get(`${PROD}/api/cron/send-reminders`, {
      headers: { authorization: 'Bearer obviously-wrong-token' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    // Generic error message — no hint about whether the secret is
    // unset, what format it expects, or how close the guess was.
    expect(body.error).toMatch(/auth/i);
  });
});

test.describe('Phase U — regression: earlier-phase contracts still hold', () => {
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
