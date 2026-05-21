/**
 * Phase CC — memory-compression cron contract.
 *
 * Locks the auth gate on the new cron endpoint and the kill-switch
 * regression for the broader fleet.
 */

import { test, expect } from '@playwright/test';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';

test.describe('Phase CC — compress-memories cron auth gate', () => {
  test('GET → 401 (no auth)', async ({ request }) => {
    const res = await request.get(`${PROD}/api/cron/compress-memories`);
    expect([401, 403, 405]).toContain(res.status());
  });

  test('GET with wrong Bearer → 401', async ({ request }) => {
    const res = await request.get(`${PROD}/api/cron/compress-memories`, {
      headers: { authorization: 'Bearer obviously-wrong' },
    });
    expect(res.status()).toBe(401);
  });

  test('error response does NOT echo CRON_SECRET state', async ({ request }) => {
    const res = await request.get(`${PROD}/api/cron/compress-memories`);
    const body = await res.text();
    const lower = body.toLowerCase();
    expect(lower).not.toMatch(/cron[-_ ]?secret/);
    expect(lower).not.toMatch(/disabled_by_ops/);
  });
});

test.describe('Phase CC — fleet kill-switch regression', () => {
  // Sample 3 already-wired crons to make sure nothing in CC broke the
  // existing pattern.
  for (const path of [
    '/api/cron/check-late-reservations',
    '/api/cron/update-churn-scores',
    '/api/cron/sync-conversation-data',
  ]) {
    test(`${path} still 401 without Bearer`, async ({ request }) => {
      const res = await request.get(`${PROD}${path}`);
      expect([401, 403, 405]).toContain(res.status());
    });
  }
});
