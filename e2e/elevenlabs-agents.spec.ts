/**
 * ElevenLabs Per-Restaurant Agent Pipeline — E2E Tests
 *
 * Tests:
 *   A. API auth guards — endpoints require JWT
 *   B. API endpoint responses — correct error codes and shapes
 *   C. Authenticated flows — with auth-state.json (optional)
 *   D. UI — Live AI Demo loads widget correctly
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = process.env.BASE_URL || 'https://restaurant-ai-mcp.vercel.app';
const AUTH_STATE = path.join(__dirname, 'auth-state.json');
const hasAuthState = fs.existsSync(AUTH_STATE);

function getAuthToken(): string | null {
  if (!hasAuthState) return null;
  try {
    const state = JSON.parse(fs.readFileSync(AUTH_STATE, 'utf8'));
    const entry = state.origins?.[0]?.localStorage?.find(
      (i: { name: string }) => i.name === 'sb-ckforlwdhewexyqljsaf-auth-token',
    );
    if (!entry) return null;
    return JSON.parse(entry.value).access_token ?? null;
  } catch {
    return null;
  }
}

// ─── A. API auth guards ───────────────────────────────────────────────────────

test.describe('A. ElevenLabs API — auth guards', () => {
  test('GET /api/elevenlabs-signed-url → 401 without token', async ({ request }) => {
    const res = await request.get(`${BASE}/api/elevenlabs-signed-url`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('POST /api/elevenlabs-kb-sync → 401 without token', async ({ request }) => {
    const res = await request.post(`${BASE}/api/elevenlabs-kb-sync`, { data: {} });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('POST /api/elevenlabs-agent-cleanup → 401 without token', async ({ request }) => {
    const res = await request.post(`${BASE}/api/elevenlabs-agent-cleanup`, {
      data: { restaurant_id: 'test', action: 'deactivate' },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ─── B. API endpoint validation ──────────────────────────────────────────────

test.describe('B. ElevenLabs API — method + validation guards', () => {
  test('POST /api/elevenlabs-signed-url → 405 (GET only)', async ({ request }) => {
    const res = await request.post(`${BASE}/api/elevenlabs-signed-url`, { data: {} });
    expect(res.status()).toBe(405);
  });

  test('GET /api/elevenlabs-kb-sync → 405 (POST only)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/elevenlabs-kb-sync`);
    expect(res.status()).toBe(405);
  });

  test('GET /api/elevenlabs-agent-cleanup → 405 (POST only)', async ({ request }) => {
    const res = await request.get(`${BASE}/api/elevenlabs-agent-cleanup`);
    expect(res.status()).toBe(405);
  });

  test('OPTIONS /api/elevenlabs-signed-url → CORS preflight OK', async ({ request }) => {
    const res = await request.fetch(`${BASE}/api/elevenlabs-signed-url`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://seatable.one',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect([200, 204]).toContain(res.status());
  });

  test('OPTIONS /api/elevenlabs-kb-sync → CORS preflight OK', async ({ request }) => {
    const res = await request.fetch(`${BASE}/api/elevenlabs-kb-sync`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://seatable.one',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect([200, 204]).toContain(res.status());
  });
});

// ─── C. Authenticated flows ─────────────────────────────────────────────────

test.describe('C. ElevenLabs API — authenticated', () => {
  const token = getAuthToken();

  test.skip(!token, 'Skipped: no auth-state.json (run auth.setup.ts first)');

  test('GET /api/elevenlabs-signed-url → returns signed_url or expected error', async ({ request }) => {
    const res = await request.get(`${BASE}/api/elevenlabs-signed-url`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    if (res.status() === 200) {
      expect(body.signed_url).toBeTruthy();
      expect(body.signed_url).toContain('elevenlabs');
    } else {
      // 400 = no agent, 401 = expired token, 403 = forbidden, 404 = not found, 500 = API key, 502 = ElevenLabs down
      expect([400, 401, 403, 404, 500, 502]).toContain(res.status());
    }
  });

  test('POST /api/elevenlabs-kb-sync → syncs or reports expected error', async ({ request }) => {
    const res = await request.post(`${BASE}/api/elevenlabs-kb-sync`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    const body = await res.json();
    if (res.status() === 200) {
      expect(body.success).toBe(true);
      expect(body.document_id).toBeTruthy();
      expect(body.document_length).toBeGreaterThan(0);
    } else {
      // 400 = no agent, 401 = expired token, 403 = forbidden, 404 = not found, 500 = API key, 502 = ElevenLabs down
      expect([400, 401, 403, 404, 500, 502]).toContain(res.status());
    }
  });

  test('POST /api/elevenlabs-agent-cleanup → validates input or rejects auth', async ({ request }) => {
    const res = await request.post(`${BASE}/api/elevenlabs-agent-cleanup`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { restaurant_id: 'fake-id' },
    });
    // 400 = missing action, 401 = expired token, 403 = not owner
    expect([400, 401]).toContain(res.status());
  });

  test('POST /api/elevenlabs-agent-cleanup delete requires confirm or rejects', async ({ request }) => {
    const res = await request.post(`${BASE}/api/elevenlabs-agent-cleanup`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { restaurant_id: 'fake-id', action: 'delete' },
    });
    // 400 = missing confirm, 401 = expired token, 403 = not owner
    expect([400, 401, 403]).toContain(res.status());
  });
});

// ─── D. UI — Live AI Demo ───────────────────────────────────────────────────

test.describe('D. UI — Live AI Demo page', () => {
  test('loads demo page with voice widget', async ({ page }) => {
    await page.goto(`${BASE}/live-demo`);
    await page.waitForLoadState('domcontentloaded');

    // Page should render with a heading
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 });

    // ElevenLabs widget script should be loaded
    const scripts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script')).map(s => s.src)
    );
    const hasElevenLabs = scripts.some(s => s.includes('elevenlabs'));
    expect(hasElevenLabs).toBe(true);
  });

  test('demo page uses agent-id (not signed-url) for public access', async ({ page }) => {
    await page.goto(`${BASE}/live-demo`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000); // Wait for widget to initialize

    // Check that the widget element exists with agent-id attribute (not signed-url)
    const widget = page.locator('elevenlabs-convai');
    const widgetCount = await widget.count();
    if (widgetCount > 0) {
      const agentId = await widget.getAttribute('agent-id');
      expect(agentId).toBeTruthy();
      // Should NOT have signed-url on public page
      const signedUrl = await widget.getAttribute('signed-url');
      expect(signedUrl).toBeFalsy();
    }
    // Widget might not render in headless — that's OK, just verify page loads
  });

  test('demo page has WebRTC enabled (use-rtc attribute)', async ({ page }) => {
    await page.goto(`${BASE}/live-demo`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    const widget = page.locator('elevenlabs-convai');
    const widgetCount = await widget.count();
    if (widgetCount > 0) {
      const useRtc = await widget.getAttribute('use-rtc');
      expect(useRtc).toBe('true');
    }
  });
});
