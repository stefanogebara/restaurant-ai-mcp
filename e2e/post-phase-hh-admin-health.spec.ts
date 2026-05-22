/**
 * Phase HH.1 — /api/admin-health endpoint contract.
 *
 * Locks the auth gate + method routing. Can't probe the JSON payload
 * structure without a valid CRON_SECRET (which would be a worse leak
 * than anything we'd verify), so we verify what's externally probe-able:
 *   - 401 without auth
 *   - 401 with garbage bearer
 *   - 405 on non-GET
 *   - Error responses never echo CRON_SECRET, db credentials, or
 *     internal stack traces
 */

import { test, expect } from '@playwright/test';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';

test.describe('Phase HH.1 — admin-health auth gate', () => {
  test('GET without auth → 401', async ({ request }) => {
    const res = await request.get(`${PROD}/api/admin-health`);
    expect(res.status()).toBe(401);
  });

  test('GET with garbage Bearer → 401', async ({ request }) => {
    const res = await request.get(`${PROD}/api/admin-health`, {
      headers: { authorization: 'Bearer obviously-wrong-token' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST → 405 (GET-only)', async ({ request }) => {
    const res = await request.post(`${PROD}/api/admin-health`);
    expect(res.status()).toBe(405);
  });

  test('error response leaks nothing sensitive', async ({ request }) => {
    const res = await request.get(`${PROD}/api/admin-health`);
    const body = await res.text();
    const lower = body.toLowerCase();
    expect(lower).not.toMatch(/cron[-_ ]?secret\s*[=:]/);
    expect(body).not.toMatch(/postgres:\/\//);
    expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]{30,}/);
    expect(body).not.toMatch(/sk_(test|live)_[A-Za-z0-9]/);
  });
});

test.describe('Phase HH.1 — cron/health timing-safe compare regression', () => {
  test('GET /api/cron/health without auth still 401', async ({ request }) => {
    const res = await request.get(`${PROD}/api/cron/health`);
    expect(res.status()).toBe(401);
  });

  test('GET /api/cron/health with garbage Bearer still 401', async ({ request }) => {
    const res = await request.get(`${PROD}/api/cron/health`, {
      headers: { authorization: 'Bearer not-the-real-secret' },
    });
    expect(res.status()).toBe(401);
  });
});
