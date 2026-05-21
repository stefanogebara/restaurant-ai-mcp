/**
 * Phase Y.3 — ElevenLabs voice agent contract surface.
 *
 * The voice agent is the second biggest delivery channel (after WhatsApp)
 * for inbound reservations. It's exposed through five endpoints that all
 * carry security weight:
 *
 *   /api/elevenlabs-signed-url   — JWT-gated, issues ephemeral WebRTC URL
 *                                  scoped to the caller's own agent_id.
 *                                  Cross-tenant attempts must 403.
 *   /api/elevenlabs-kb-sync      — JWT-gated, regenerates the per-tenant
 *                                  knowledge-base attached to the agent.
 *   /api/elevenlabs-agent-cleanup — JWT-gated, deletes the tenant's agent.
 *   /api/elevenlabs-webhook      — HMAC signature OR Bearer-token gate
 *                                  for conversation-completed events.
 *   /api/elevenlabs-voices       — public voice listing (read-only safe).
 *
 * What we lock here is the negative path: every gate must reject the
 * caller when the gate condition isn't satisfied. The happy path is
 * harder to test without minted JWTs (same constraint as Phase X.3).
 */

import { test, expect } from '@playwright/test';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';

test.describe('Phase Y.3 — signed-url endpoint auth + method gates', () => {
  test('GET without JWT → 401', async ({ request }) => {
    const res = await request.get(`${PROD}/api/elevenlabs-signed-url`);
    expect(res.status()).toBe(401);
  });

  test('GET with garbage Bearer → 401', async ({ request }) => {
    const res = await request.get(`${PROD}/api/elevenlabs-signed-url`, {
      headers: { authorization: 'Bearer obviously-wrong' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST → 405 (GET-only endpoint)', async ({ request }) => {
    const res = await request.post(`${PROD}/api/elevenlabs-signed-url`);
    expect(res.status()).toBe(405);
  });

  test('OPTIONS preflight returns 200/204 (CORS works)', async ({ request }) => {
    const res = await request.fetch(`${PROD}/api/elevenlabs-signed-url`, {
      method: 'OPTIONS',
    });
    expect([200, 204]).toContain(res.status());
  });

  test('401 response body does not leak agent_id or restaurant_id hints', async ({ request }) => {
    const res = await request.get(
      `${PROD}/api/elevenlabs-signed-url?agent_id=any-guess`,
    );
    expect(res.status()).toBe(401);
    const body = await res.json();
    const serialised = JSON.stringify(body).toLowerCase();
    expect(serialised).toMatch(/auth/);
    // Must not echo the agent_id guess back to the caller.
    expect(serialised).not.toContain('any-guess');
  });
});

test.describe('Phase Y.3 — KB sync endpoint auth + method gates', () => {
  test('POST without JWT → 401', async ({ request }) => {
    const res = await request.post(`${PROD}/api/elevenlabs-kb-sync`, {
      data: {},
    });
    expect(res.status()).toBe(401);
  });

  test('GET → 405 (POST-only)', async ({ request }) => {
    const res = await request.get(`${PROD}/api/elevenlabs-kb-sync`);
    expect(res.status()).toBe(405);
  });
});

test.describe('Phase Y.3 — agent-cleanup endpoint auth', () => {
  test('POST without JWT → 401/403', async ({ request }) => {
    const res = await request.post(`${PROD}/api/elevenlabs-agent-cleanup`, {
      data: {},
    });
    // The handler returns auth.status which could be 401 or 403 depending
    // on whether the token was missing or invalid.
    expect([401, 403]).toContain(res.status());
  });

  test('GET → 405 (POST-only)', async ({ request }) => {
    const res = await request.get(`${PROD}/api/elevenlabs-agent-cleanup`);
    expect(res.status()).toBe(405);
  });
});

test.describe('Phase Y.3 — webhook signature/token gate', () => {
  // The webhook accepts EITHER an x-elevenlabs-signature HMAC OR a Bearer
  // token. Without either, the handler must 403 (Authentication failed).
  test('POST without signature or token → 403', async ({ request }) => {
    const res = await request.post(`${PROD}/api/elevenlabs-webhook`, {
      data: {
        type: 'conversation.completed',
        conversation_id: 'probe',
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('POST with junk signature → 403 (no work done)', async ({ request }) => {
    const res = await request.post(`${PROD}/api/elevenlabs-webhook`, {
      data: {
        type: 'conversation.completed',
        conversation_id: 'probe',
      },
      headers: {
        'x-elevenlabs-signature': 'sha256=' + 'a'.repeat(64),
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('POST with wrong Bearer token → 403', async ({ request }) => {
    const res = await request.post(`${PROD}/api/elevenlabs-webhook`, {
      data: {
        type: 'conversation.completed',
        conversation_id: 'probe',
      },
      headers: {
        authorization: 'Bearer not-the-real-secret',
      },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe('Phase Y.3 — public voice listing is unchanged + safe', () => {
  test('GET /api/elevenlabs-voices does NOT echo the ELEVENLABS_API_KEY', async ({ request }) => {
    const res = await request.get(`${PROD}/api/elevenlabs-voices`);
    // 200 is the happy path (listing voices). Other codes acceptable if the
    // upstream rate-limited us. Whatever the status, the response must not
    // contain the words "xi-api-key" or look like an API key was leaked.
    const body = await res.text().catch(() => '');
    expect(body.toLowerCase()).not.toContain('xi-api-key');
    expect(body).not.toMatch(/sk-[A-Za-z0-9]{20,}/); // OpenAI-style
    expect(body).not.toMatch(/xi_[A-Za-z0-9]{20,}/); // ElevenLabs-style
  });
});
