/**
 * Phase Q verification — Manager AI surface against production.
 *
 *   Q.1  Manager phone collision: partial unique index +
 *        explicit 409 mapping. We can't trigger the verify flow
 *        without two real JWTs, but we CAN assert the endpoint
 *        exists, gates on auth, and responds with the right
 *        shape when called without credentials.
 *
 *   Q.2  Briefing channel-fallback to text: server-side change
 *        in api/_lib/briefing-sender.js. Can't fault-inject
 *        ElevenLabs/Storage from outside, so this spec only
 *        confirms the manager-briefings cron endpoint exists +
 *        gates on CRON_SECRET.
 *
 *   Q.3  ManagerAIChatPage retry button + aria-live: verified by
 *        bundle-grep — the new i18n keys (managerAI.retry,
 *        managerAI.conversationLabel) must ship in the deployed
 *        lazy chunk.
 *
 * Each test is read-only. No DB writes, no demo creation.
 */

import { test, expect } from '@playwright/test';

const PROD = process.env.PW_BASE_URL || 'https://seatable.one';

test.describe('Phase Q — Manager AI endpoints gate on auth', () => {
  test('Q.1 — manager-whatsapp-verify rejects unauthenticated requests', async ({ request }) => {
    const res = await request.post(`${PROD}/api/manager-whatsapp-verify`, {
      data: { action: 'confirm', code: '123456' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/authentication required/i);
  });

  test('Q.1 — manager-whatsapp-verify rejects non-POST', async ({ request }) => {
    const res = await request.get(`${PROD}/api/manager-whatsapp-verify`);
    expect(res.status()).toBe(405);
  });

  test('Q.2 — manager-briefings cron endpoint gates on CRON_SECRET (401 without)', async ({ request }) => {
    // Hitting the cron endpoint without a Bearer should be rejected.
    const res = await request.get(`${PROD}/api/cron/manager-briefings?type=morning`);
    // 401 is the expected gate. Some routers return 405 for GET on a
    // POST-only handler — both prove the endpoint isn't blindly
    // accepting public traffic.
    expect([401, 403, 405]).toContain(res.status());
  });

  test('Q.2 — manager-alerts cron endpoint gates on CRON_SECRET', async ({ request }) => {
    const res = await request.get(`${PROD}/api/cron/manager-alerts?type=low_covers`);
    expect([401, 403, 405]).toContain(res.status());
  });

  test('manager-chat requires JWT (no anonymous access)', async ({ request }) => {
    const res = await request.post(`${PROD}/api/manager-chat`, {
      data: { message: 'hello' },
    });
    expect(res.status()).toBe(401);
  });

  test('manager-preferences requires JWT', async ({ request }) => {
    const res = await request.patch(`${PROD}/api/manager-preferences`, {
      data: { briefing_channel: 'text' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('Phase Q — UI strings present in deployed bundle', () => {
  test('Q.3 — managerAI.retry + managerAI.conversationLabel in deployed lazy chunk', async ({ request }) => {
    // Walk: index bundle → find ManagerAIChatPage lazy chunk → fetch it.
    const home = await request.get(`${PROD}/`);
    const html = await home.text();
    const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    expect(m).not.toBeNull();
    const idxUrl = `${PROD}${m![0]}`;
    const idx = await (await request.get(idxUrl)).text();

    // The Manager chat is lazy-loaded — find its chunk.
    const chunkName = idx.match(/ManagerAIChatPage-[A-Za-z0-9_-]+\.js/);
    expect(chunkName, 'ManagerAIChatPage lazy chunk must exist').not.toBeNull();

    const chunk = await (await request.get(`${PROD}/assets/${chunkName![0]}`)).text();

    // Phase Q.3 keys
    expect(chunk).toMatch(/managerAI\.retry/);
    expect(chunk).toMatch(/managerAI\.conversationLabel/);
    // aria-live="polite" should be in the same chunk (we wired it to the
    // messages container)
    expect(chunk).toMatch(/aria-live/);
  });
});

test.describe('Phase Q — regression: existing N+O+P contracts still hold', () => {
  test('portal slug regex still 400s malicious payloads (N.5 regression check)', async ({ request }) => {
    const res = await request.get(
      `${PROD}/api/portal?action=restaurant&slug=${encodeURIComponent("x'; DROP TABLE--")}`,
    );
    expect(res.status()).toBe(400);
  });

  test('elevenlabs-signed-url still 401s without JWT (P.2 regression check)', async ({ request }) => {
    const res = await request.get(`${PROD}/api/elevenlabs-signed-url`);
    expect(res.status()).toBe(401);
  });

  test('contact form still rejects 6000-char message (N.6 regression check)', async ({ request }) => {
    const res = await request.post(`${PROD}/api/contact`, {
      data: { name: 'Q', email: 'q@q.com', message: 'x'.repeat(6000) },
    });
    expect(res.status()).toBe(400);
  });
});
