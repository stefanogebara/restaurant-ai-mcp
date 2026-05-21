/**
 * Phase Y.2 — WhatsApp Meta Cloud inbound webhook contract.
 *
 * Locks down the rules that protect /api/whatsapp-webhook from being
 * abused by anyone who isn't Meta. The webhook is the entry point for
 * every inbound customer message → eventually a reservation row.
 * Before Y.2 nothing automated checked the boundary conditions.
 *
 * What we lock here:
 *   1. GET verification rejects wrong verify_token (401 / no challenge).
 *   2. GET verification with the wrong hub.mode never echoes the challenge.
 *   3. POST without an X-Hub-Signature-256 header is rejected.
 *   4. POST with a syntactically valid but wrong signature is rejected.
 *   5. Method PUT/DELETE/PATCH all 405.
 *   6. OPTIONS preflight returns 200 (CORS).
 *
 * What we DON'T do here:
 *   - We don't synthesize a valid signature. That would require knowing
 *     the production WHATSAPP_APP_SECRET, which would be a far worse
 *     leak than anything we'd test. Y.2's value is the negative path.
 *   - We don't actually trigger reservation creation. The Jest suite
 *     (whatsapp-meta-booking.test.js) covers the happy path with mocked
 *     signatures; this spec covers production network behaviour only.
 */

import { test, expect } from '@playwright/test';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';
const WEBHOOK_PATH = '/api/whatsapp-webhook';

test.describe('Phase Y.2 — Meta verification handshake', () => {
  test('GET with wrong verify_token does NOT echo the challenge', async ({ request }) => {
    const res = await request.get(
      `${PROD}${WEBHOOK_PATH}?hub.mode=subscribe&hub.verify_token=obviously-wrong&hub.challenge=expected-challenge-123`,
    );
    // Spec: Meta expects 200 + challenge body when token matches, anything
    // else when it doesn't. Two valid implementations: 403 / 200 with no
    // body / 401. Whatever we return, the challenge MUST NOT come back.
    if (res.status() === 200) {
      const body = await res.text();
      expect(body).not.toContain('expected-challenge-123');
    } else {
      expect([401, 403]).toContain(res.status());
    }
  });

  test('GET with missing hub.mode is rejected', async ({ request }) => {
    const res = await request.get(
      `${PROD}${WEBHOOK_PATH}?hub.verify_token=anything&hub.challenge=x`,
    );
    expect(res.status()).not.toBe(200);
  });

  test('GET with hub.mode != subscribe does not echo challenge', async ({ request }) => {
    const res = await request.get(
      `${PROD}${WEBHOOK_PATH}?hub.mode=unsubscribe&hub.verify_token=anything&hub.challenge=x`,
    );
    if (res.status() === 200) {
      const body = await res.text();
      expect(body).not.toContain('x');
    }
  });
});

test.describe('Phase Y.2 — POST signature gate', () => {
  // Minimal valid-shape Meta Cloud payload (the verifier inspects bytes, not
  // structure, so this exists mostly to keep the request realistic).
  const inboundPayload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'TEST',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '+1', phone_number_id: 'TEST' },
              contacts: [{ profile: { name: 'Y2-Test' }, wa_id: '10000000099' }],
              messages: [
                {
                  from: '10000000099',
                  id: 'wamid.TEST',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: 'Y2-probe: ignore — never make it past the signature gate' },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  test('POST without X-Hub-Signature-256 header is rejected (no work performed)', async ({ request }) => {
    const res = await request.post(`${PROD}${WEBHOOK_PATH}`, {
      data: inboundPayload,
      headers: { 'Content-Type': 'application/json' },
    });
    // Handler may either reject with 4xx, or return 200 with body indicating
    // signature failure (Meta still gets a 200 so it doesn't retry-storm).
    // Either way, the response MUST NOT indicate that the message was
    // processed end-to-end.
    if (res.status() === 200) {
      const body = await res.json().catch(() => ({}));
      // Reject any body that looks like a successful processing receipt.
      const serialised = JSON.stringify(body).toLowerCase();
      expect(serialised).not.toMatch(/processed|reserved|reservation_id/);
    } else {
      expect([400, 401, 403]).toContain(res.status());
    }
  });

  test('POST with a syntactically-valid but wrong signature is rejected', async ({ request }) => {
    const res = await request.post(`${PROD}${WEBHOOK_PATH}`, {
      data: inboundPayload,
      headers: {
        'Content-Type': 'application/json',
        // Deliberate wrong HMAC; 64 hex chars to match SHA-256 length.
        'X-Hub-Signature-256': 'sha256=' + 'a'.repeat(64),
      },
    });
    if (res.status() === 200) {
      const body = await res.json().catch(() => ({}));
      const serialised = JSON.stringify(body).toLowerCase();
      expect(serialised).not.toMatch(/processed|reserved|reservation_id/);
    } else {
      expect([400, 401, 403]).toContain(res.status());
    }
  });

  test('POST with malformed signature header is rejected', async ({ request }) => {
    const res = await request.post(`${PROD}${WEBHOOK_PATH}`, {
      data: inboundPayload,
      headers: {
        'Content-Type': 'application/json',
        'X-Hub-Signature-256': 'not-even-close',
      },
    });
    if (res.status() === 200) {
      const body = await res.json().catch(() => ({}));
      const serialised = JSON.stringify(body).toLowerCase();
      expect(serialised).not.toMatch(/processed|reserved|reservation_id/);
    } else {
      expect([400, 401, 403]).toContain(res.status());
    }
  });
});

test.describe('Phase Y.2 — method routing', () => {
  const methods: Array<'put' | 'delete' | 'patch'> = ['put', 'delete', 'patch'];
  for (const m of methods) {
    test(`${m.toUpperCase()} ${WEBHOOK_PATH} → 405`, async ({ request }) => {
      const res = await (request[m] as typeof request.post)(`${PROD}${WEBHOOK_PATH}`, {
        data: {},
      });
      expect(res.status()).toBe(405);
    });
  }

  test('OPTIONS preflight returns 200', async ({ request }) => {
    const res = await request.fetch(`${PROD}${WEBHOOK_PATH}`, { method: 'OPTIONS' });
    expect(res.status()).toBe(200);
  });
});

test.describe('Phase Y.2 — Twilio webhook also gates auth', () => {
  test('POST /api/twilio-whatsapp-webhook without Twilio auth is rejected', async ({ request }) => {
    const res = await request.post(`${PROD}/api/twilio-whatsapp-webhook`, {
      form: { From: 'whatsapp:+10000000099', Body: 'probe' },
    });
    // Twilio handler may either 4xx outright, or 200 with no work done.
    if (res.status() === 200) {
      const body = await res.text().catch(() => '');
      expect(body.toLowerCase()).not.toMatch(/processed|reservation/);
    } else {
      expect([400, 401, 403]).toContain(res.status());
    }
  });
});
