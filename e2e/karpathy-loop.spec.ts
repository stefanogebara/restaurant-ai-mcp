/**
 * Karpathy Autoresearch Loop — E2E Tests
 *
 * Tests the full cycle:
 *   1. Human writes strategy doc (program.md)
 *   2. AI executes using strategy as context
 *   3. AI suggests improvements from real metrics
 *   4. Human applies suggestions + saves → repeat
 *
 * Test groups:
 *   A. API auth guards         — no auth required
 *   B. UI redirect guards      — no auth required
 *   C. API authenticated loop  — requires auth-state.json (run auth.setup.ts first)
 *   D. UI authenticated loop   — requires auth-state.json + deployed changes
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE = 'https://seatable.one';
const AUTH_STATE = path.join(__dirname, 'auth-state.json');
const hasAuthState = fs.existsSync(AUTH_STATE);

// Helper to get auth token from storage state
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

test.describe('A. API — auth guards', () => {
  test('GET /api/ai-strategy?action=get → 401 without token', async ({ request }) => {
    const res = await request.get(`${BASE}/api/ai-strategy?action=get`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('PATCH /api/ai-strategy?action=update → 401 without token', async ({ request }) => {
    const res = await request.patch(`${BASE}/api/ai-strategy?action=update`, {
      data: { strategy_doc: 'test' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('POST /api/ai-strategy?action=suggest → 401 without token', async ({ request }) => {
    const res = await request.post(`${BASE}/api/ai-strategy?action=suggest`, { data: {} });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ─── B. UI redirect guards ────────────────────────────────────────────────────

test.describe('B. UI — protected route redirects to login', () => {
  test('/host-dashboard/voice-settings redirects unauthenticated users', async ({ page }) => {
    await page.goto('/host-dashboard/voice-settings');
    await page.waitForTimeout(3000);

    const url = page.url();
    const isProtected =
      url.includes('/login') ||
      (!url.includes('voice-settings'));
    expect(isProtected).toBe(true);
  });

  test('/analytics redirects unauthenticated users', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForTimeout(3000);
    const url = page.url();
    expect(url).not.toContain('/analytics');
  });
});

// ─── C. API authenticated loop ────────────────────────────────────────────────
// Tests the full Karpathy loop via the production API with a real JWT.

const skipReason = 'Run `node e2e/generate-auth-state.js` first (requires SUPABASE_SERVICE_ROLE_KEY)';

test.describe('C. Karpathy Loop — API authenticated cycle', () => {
  let token: string | null;

  test.beforeAll(() => {
    token = getAuthToken();
  });

  test('GET strategy doc — returns current doc and metadata', async ({ request }) => {
    if (!token) test.skip(true, skipReason);

    const res = await request.get(`${BASE}/api/ai-strategy?action=get`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      strategy_doc: expect.any(String),
      restaurant_name: expect.any(String),
    });
  });

  test('PATCH strategy doc — saves and returns updated doc', async ({ request }) => {
    if (!token) test.skip(true, skipReason);

    const testDoc = `KARPATHY LOOP E2E — ${new Date().toISOString()}\n\nFOCUS AREAS:\n- Increase weekday covers via lunch promotion\n- Target no-show rate below 5%`;

    const res = await request.patch(`${BASE}/api/ai-strategy?action=update`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { strategy_doc: testDoc },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.strategy_doc).toBe(testDoc);
    expect(body.data.updated_at).toBeTruthy();
  });

  test('PATCH validates doc length — rejects over 10,000 chars', async ({ request }) => {
    if (!token) test.skip(true, skipReason);

    const tooLong = 'x'.repeat(10001);
    const res = await request.patch(`${BASE}/api/ai-strategy?action=update`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { strategy_doc: tooLong },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too long/i);
  });

  test('PATCH validates missing field — rejects non-string strategy_doc', async ({ request }) => {
    if (!token) test.skip(true, skipReason);

    const res = await request.patch(`${BASE}/api/ai-strategy?action=update`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { strategy_doc: 42 },
    });
    expect(res.status()).toBe(400);
  });

  test('POST suggest — generates AI suggestions from real metrics (Karpathy step 3)', async ({ request }) => {
    if (!token) test.skip(true, skipReason);

    const res = await request.post(`${BASE}/api/ai-strategy?action=suggest`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {},
      timeout: 30000,
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Response shape: { success, data: { suggestions: string } }
    expect(typeof body.data.suggestions).toBe('string');
    expect(body.data.suggestions.length).toBeGreaterThan(50);
    // Should contain at least one of these typical strategy sections
    const text = body.data.suggestions.toLowerCase();
    const hasStrategyContent = text.includes('focus') || text.includes('goal') ||
      text.includes('suggest') || text.includes('recommend') ||
      text.includes('reservation') || text.includes('cover');
    expect(hasStrategyContent).toBe(true);
  });

  test('full Karpathy loop: save doc → generate suggestions → verify persistence', async ({ request }) => {
    if (!token) test.skip(true, skipReason);

    // Step 1: Write strategy
    const strategy = `FOCUS: Reduce no-shows using deposit requests for large parties\nGOAL: <5% no-show rate`;
    const saveRes = await request.patch(`${BASE}/api/ai-strategy?action=update`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { strategy_doc: strategy },
    });
    expect(saveRes.status()).toBe(200);

    // Step 2: Generate AI suggestions (reads saved strategy + current metrics)
    const suggestRes = await request.post(`${BASE}/api/ai-strategy?action=suggest`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {},
      timeout: 30000,
    });
    expect(suggestRes.status()).toBe(200);
    const suggestBody = await suggestRes.json();
    expect(suggestBody.data.suggestions.length).toBeGreaterThan(50);

    // Step 3: Apply suggestions to doc and save again
    const combined = strategy + '\n\n--- AI SUGGESTIONS ---\n' + suggestBody.data.suggestions;
    const applyRes = await request.patch(`${BASE}/api/ai-strategy?action=update`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { strategy_doc: combined },
    });
    expect(applyRes.status()).toBe(200);

    // Step 4: Re-fetch and verify persistence
    const getRes = await request.get(`${BASE}/api/ai-strategy?action=get`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getBody = await getRes.json();
    expect(getBody.data.strategy_doc).toContain('--- AI SUGGESTIONS ---');
    expect(getBody.data.strategy_doc).toContain('FOCUS: Reduce no-shows');
    expect(getBody.data.updated_at).toBeTruthy();
  });
});

// ─── D. UI authenticated loop ─────────────────────────────────────────────────
// Requires: (1) auth-state.json AND (2) VoiceSettingsPage fix deployed to Vercel.
// The fix (show AIStrategyPanel even without agent_id) is committed locally;
// run after deploy: npx playwright test e2e/karpathy-loop.spec.ts --grep "D\."

test.describe('D. UI — Voice Settings + AI Strategy panel', () => {
  test.use(hasAuthState ? { storageState: AUTH_STATE } : {});

  test('voice-settings page loads for authenticated user', async ({ page }) => {
    if (!hasAuthState) test.skip(true, skipReason);

    await page.goto('/host-dashboard/voice-settings', { waitUntil: 'domcontentloaded' });

    // URL must stay at voice-settings (not redirected to login)
    await page.waitForURL('**/voice-settings', { timeout: 10000 });
    expect(page.url()).toContain('voice-settings');
  });

  test('AI Strategy Document panel visible after deploy', async ({ page }) => {
    if (!hasAuthState) test.skip(true, skipReason);

    await page.goto('/host-dashboard/voice-settings', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/voice-settings', { timeout: 10000 });

    // After deploying the VoiceSettingsPage fix, panel should be visible
    // even if no ElevenLabs agent_id is configured.
    await expect(page.getByText('AI Strategy Document')).toBeVisible({ timeout: 15000 });
  });

  test('textarea edit → Save & Apply → toast confirmation', async ({ page }) => {
    if (!hasAuthState) test.skip(true, skipReason);

    await page.goto('/host-dashboard/voice-settings', { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/voice-settings', { timeout: 10000 });

    await expect(page.getByText('AI Strategy Document')).toBeVisible({ timeout: 15000 });

    const textarea = page.locator('textarea').first();
    await textarea.fill(`UI LOOP TEST ${Date.now()}\n\nFOCUS: Test strategy`);

    await expect(page.getByRole('button', { name: /save.*apply/i })).toBeEnabled();
    await page.getByRole('button', { name: /save.*apply/i }).click();
    await expect(page.getByText(/strategy saved/i)).toBeVisible({ timeout: 20000 });
  });
});
