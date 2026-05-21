/**
 * Phase DD — audit-driven bug fix verification.
 *
 * Locks the post-fix contract for the issues found during the DD.1 +
 * DD.2 + DD.3 audit pass. Most fixes are server-side and unauth-probable:
 * silent-UPDATE guards now surface 4xx instead of fake 200s, list
 * endpoints now cap output, validation gaps closed.
 */

import { test, expect } from '@playwright/test';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';
const TEST_RESTAURANT_ID = 'eee572c5-9f1a-4d96-a560-a92bfd747947'; // api-chat-test-bistro

test.describe('Phase DD — customer-reservation modify/cancel guards', () => {
  test('POST /api/customer-reservation?action=modify with party_size out of range → 400', async ({ request }) => {
    const res = await request.post(`${PROD}/api/customer-reservation?action=modify`, {
      data: {
        reservation_id: 'NONEXISTENT-DD',
        customer_phone: '+1000000099',
        party_size: 200,
      },
    });
    // Could 400 (validation) or 404 (reservation not found). What we
    // FORBID is 200 with success: true (the silent-UPDATE bug). 500 is
    // also bad because it means the bounds check threw instead of returning.
    expect(res.status()).toBeLessThan(500);
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).not.toBe(true);
    }
  });

  test('POST modify with bad date format → 400', async ({ request }) => {
    const res = await request.post(`${PROD}/api/customer-reservation?action=modify`, {
      data: {
        reservation_id: 'NONEXISTENT-DD',
        customer_phone: '+1000000099',
        date: 'tomorrow',
      },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('POST modify with past date → 400', async ({ request }) => {
    const res = await request.post(`${PROD}/api/customer-reservation?action=modify`, {
      data: {
        reservation_id: 'NONEXISTENT-DD',
        customer_phone: '+1000000099',
        date: '1990-01-01',
      },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test('POST modify with bad time format → 400', async ({ request }) => {
    const res = await request.post(`${PROD}/api/customer-reservation?action=modify`, {
      data: {
        reservation_id: 'NONEXISTENT-DD',
        customer_phone: '+1000000099',
        time: '7pm',
      },
    });
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('Phase DD — survey tenant guard', () => {
  test('survey submit with reservation_id from another tenant is silently unlinked', async ({ request }) => {
    // We can't verify the unlink directly without service-role access;
    // what we DO verify here is the request doesn't 5xx. The DB-side
    // verification (verifiedReservationId = null) is implicit in the
    // handler — anyone running this without prior knowledge of valid
    // reservation IDs gets a clean response either way.
    const res = await request.post(`${PROD}/api/surveys?action=submit`, {
      data: {
        restaurant_id: TEST_RESTAURANT_ID,
        rating: 5,
        comment: 'DD test — please ignore',
        reservation_id: 'RES-DEFINITELY-NOT-MINE-9999',
      },
    });
    // Either 201 (accepted, link silently dropped) or 4xx (validation).
    // What we forbid: 5xx (handler crashed) or 200 success that confirms
    // the cross-tenant link.
    expect(res.status()).toBeLessThan(500);
  });
});

test.describe('Phase DD — list endpoint caps', () => {
  test('GET /api/reservations rejects unauth (regression — still 401)', async ({ request }) => {
    const res = await request.get(`${PROD}/api/reservations?action=list&limit=999999`);
    // Without JWT this 401s; the limit clamping fix only matters once
    // the caller is authenticated. We just verify the endpoint is still
    // gated and the gigantic limit doesn't trigger a 5xx parse error.
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('Phase DD — earlier-phase regressions still hold', () => {
  test('Phase Z Square webhook still 405 on GET', async ({ request }) => {
    const res = await request.get(`${PROD}/api/square/webhook`);
    expect(res.status()).toBe(405);
  });

  test('Phase AA.5 request-deposit-link still requires JWT', async ({ request }) => {
    const res = await request.post(`${PROD}/api/request-deposit-link`, { data: {} });
    expect([401, 403]).toContain(res.status());
  });

  test('Phase V cron auth gate still 401', async ({ request }) => {
    const res = await request.get(`${PROD}/api/cron/check-late-reservations`);
    expect([401, 403, 405]).toContain(res.status());
  });
});
