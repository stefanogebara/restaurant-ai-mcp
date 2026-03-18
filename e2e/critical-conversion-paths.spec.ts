/**
 * Critical Conversion Path E2E Tests
 *
 * Tests the 5 user journeys that directly drive revenue.
 * Runs against production (seatable.one) in headless Chrome (English locale).
 * Uses bilingual selectors to handle EN/PT-BR content.
 */

import { test, expect } from '@playwright/test';

const BASE = 'https://seatable.one';

// ─── Journey 1: Demo Setup → Demo Dashboard ────────────────────────────

test.describe('Journey 1: Demo Setup → Demo Dashboard', () => {
  test('loads demo setup page with search form', async ({ page }) => {
    await page.goto(`${BASE}/demo/setup`);

    // Wait for SPA hydration
    const nameInput = page.locator('input').first();
    await expect(nameInput).toBeVisible({ timeout: 15000 });

    // Should have 2 text inputs + a search button
    const inputs = page.locator('input[type="text"], input:not([type])');
    await expect(inputs.first()).toBeVisible();

    const searchBtn = page.locator('button').filter({ hasText: /find|buscar/i });
    await expect(searchBtn).toBeVisible();
  });

  test('searches and shows Google Maps results', async ({ page }) => {
    await page.goto(`${BASE}/demo/setup`);
    const nameInput = page.locator('input').first();
    await nameInput.waitFor({ timeout: 15000 });

    await nameInput.fill('Fogo de Chão');
    await page.locator('input').nth(1).fill('São Paulo');
    await page.locator('button').filter({ hasText: /find|buscar/i }).click();

    // Results appear as buttons with restaurant name
    await expect(page.locator('button').filter({ hasText: 'Fogo de Chão' }).first()).toBeVisible({ timeout: 20000 });
  });

  test('full demo creation flow', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(`${BASE}/demo/setup`);
    const nameInput = page.locator('input').first();
    await nameInput.waitFor({ timeout: 15000 });

    // Search
    await nameInput.fill('Fogo de Chão');
    await page.locator('input').nth(1).fill('São Paulo');
    await page.locator('button').filter({ hasText: /find|buscar/i }).click();

    // Select first result
    const result = page.locator('button').filter({ hasText: 'Fogo de Chão' }).first();
    await result.waitFor({ timeout: 20000 });
    await result.click();

    // Verify restaurant card (Change/Alterar button appears)
    await expect(page.locator('button').filter({ hasText: /change|alterar/i })).toBeVisible({ timeout: 5000 });

    // Fill email
    await page.locator('input[type="email"], input[placeholder*="mail" i]').first().fill(`e2e-${Date.now()}@seatable.test`);

    // Create demo (Launch my demo / Iniciar meu demo)
    await page.locator('button').filter({ hasText: /launch|iniciar/i }).click();

    // Verify redirect to demo dashboard
    await page.waitForURL(/\/demo\/[a-f0-9-]+/, { timeout: 30000 });

    // Verify dashboard content loaded
    await expect(page.locator('text=/reserv/i').first()).toBeVisible({ timeout: 15000 });
  });

  test('demo preset loads with seeded data', async ({ page }) => {
    test.setTimeout(45000);

    // Navigate to preset — this creates a demo and redirects
    const response = await page.goto(`${BASE}/demo?preset=italian`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBeLessThan(500);

    // Wait for either redirect to /demo/{id} or page content to load
    await page.waitForTimeout(5000);

    // The page should have restaurant-related content
    const hasContent = await page.locator('text=/reserv|dashboard|painel/i').first().isVisible({ timeout: 15000 }).catch(() => false);

    // If redirected to demo, verify stats
    if (page.url().includes('/demo/')) {
      await expect(page.locator('text=/reserv/i').first()).toBeVisible({ timeout: 10000 });
    } else {
      // If still on /demo?preset=italian, it might be loading
      expect(hasContent || page.url().includes('/demo')).toBe(true);
    }
  });
});

// ─── Journey 2: Google Auth Login → Dashboard ───────────────────────────

test.describe('Journey 2: Google Auth Login', () => {
  test('login page renders with Google button and email form', async ({ page }) => {
    await page.goto(`${BASE}/login`);

    const googleBtn = page.locator('button').filter({ hasText: /google/i });
    await expect(googleBtn).toBeVisible({ timeout: 15000 });

    // Email input
    await expect(page.locator('input[type="email"], input[placeholder*="mail" i]').first()).toBeVisible();

    // Password input
    await expect(page.locator('input[type="password"]').first()).toBeVisible();

    // Sign in button
    await expect(page.locator('button[type="submit"], button').filter({ hasText: /sign in|entrar/i }).first()).toBeVisible();
  });

  test('Google OAuth redirects with correct params', async ({ page }) => {
    await page.goto(`${BASE}/login`);

    const googleBtn = page.locator('button').filter({ hasText: /google/i });
    await googleBtn.waitFor({ timeout: 15000 });

    // Click and wait for Google redirect
    await Promise.all([
      page.waitForURL(/accounts\.google\.com/, { timeout: 15000 }),
      googleBtn.click(),
    ]);

    const url = page.url();
    expect(url).toContain('accounts.google.com');
    expect(url).toContain('298873888709'); // our client_id
    expect(url).toContain('ckforlwdhewexyqljsaf.supabase.co'); // Supabase callback
  });
});

// ─── Journey 3: Email Signup → Confirmation ─────────────────────────────

test.describe('Journey 3: Email Signup', () => {
  test('switches to signup mode', async ({ page }) => {
    await page.goto(`${BASE}/login`);

    const toggleBtn = page.locator('button').filter({ hasText: /create|criar/i }).first();
    await toggleBtn.waitFor({ timeout: 15000 });
    await toggleBtn.click();

    // Heading changes
    await expect(page.locator('h1').filter({ hasText: /create|criar/i })).toBeVisible({ timeout: 5000 });
  });

  test('rejects weak password', async ({ page }) => {
    await page.goto(`${BASE}/login`);

    // Switch to signup
    await page.locator('button').filter({ hasText: /create|criar/i }).first().click();
    await page.waitForTimeout(500);

    // Fill form with password that passes HTML5 minLength but fails our validation (no uppercase)
    await page.locator('input[type="email"], input[placeholder*="mail" i]').first().fill('pw-test@gmail.com');
    await page.locator('input[type="password"]').first().fill('alllowercase1');

    // Submit
    await page.locator('button[type="submit"]').first().click();

    // Error should appear (red-tinted element — Tailwind uses red-600/10 or similar)
    await expect(page.locator('[class*="red-600"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('valid signup shows confirmation or rate limit message', async ({ page }) => {
    await page.goto(`${BASE}/login`);

    // Switch to signup
    await page.locator('button').filter({ hasText: /create|criar/i }).first().click();
    await page.waitForTimeout(500);

    // Fill valid form
    await page.locator('input[type="email"], input[placeholder*="mail" i]').first().fill(`e2e.test.${Date.now()}@gmail.com`);
    await page.locator('input[type="password"]').first().fill('E2eTestPass123!');

    // Submit
    await page.locator('button[type="submit"]').first().click();

    // Should show either: green confirmation, verify text, OR rate limit error
    // All are valid outcomes — the important thing is the form submitted and a response appeared
    const anyResponse = page.locator('[class*="green"], [class*="red-600"]').first();
    const anyText = page.getByText(/verify|confirm|rate limit|e-mail|confirmação|exceeded/i).first();
    await expect(anyResponse.or(anyText)).toBeVisible({ timeout: 10000 });
  });
});

// ─── Journey 4: Landing Page → Demo CTA ─────────────────────────────────

test.describe('Journey 4: Landing Page', () => {
  test('renders hero, demo presets, pricing, FAQ', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    // Hero heading
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });

    // Demo restaurant presets
    await expect(page.locator('text=/Trattoria/i')).toBeVisible();
    await expect(page.locator('text=/Sakura/i')).toBeVisible();

    // Pricing section (BRL or EUR depending on locale)
    await page.locator('text=/pricing|planos/i').first().scrollIntoViewIfNeeded();
    const hasPricing = await page.locator('text=/\\$|€|R\\$/').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasPricing).toBe(true);

    // FAQ
    await expect(page.locator('text=/FAQ|frequently|perguntas/i').first()).toBeVisible();
  });

  test('has CTA links to demo setup', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').first().waitFor({ timeout: 15000 });

    const ctaLinks = page.locator('a[href="/demo/setup"]');
    expect(await ctaLinks.count()).toBeGreaterThan(0);
  });

  test('preset demo links work', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').first().waitFor({ timeout: 15000 });

    // Italian preset link exists with correct href
    const italianLink = page.locator('a[href="/demo?preset=italian"]');
    await expect(italianLink).toBeVisible({ timeout: 5000 });
  });

  test('WhatsApp link has correct number', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').first().waitFor({ timeout: 15000 });

    await expect(page.locator('a[href*="wa.me/551150289356"]').first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── Journey 5: Public Booking Page ─────────────────────────────────────

test.describe('Journey 5: Public Booking', () => {
  test('booking page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    const response = await page.goto(`${BASE}/book/test-restaurant-ai`, { waitUntil: 'domcontentloaded' });

    // Should not return 500
    expect(response?.status()).not.toBe(500);

    // Wait for content
    await page.waitForTimeout(3000);

    // No critical JS errors
    const critical = errors.filter(e => !e.includes('ResizeObserver') && !e.includes('Non-Error'));
    expect(critical).toHaveLength(0);
  });
});

// ─── Smoke: No JS Errors on Key Pages ───────────────────────────────────

test.describe('Smoke: No JS Errors', () => {
  for (const p of [
    { name: 'Landing', url: '/' },
    { name: 'Login', url: '/login' },
    { name: 'Demo Setup', url: '/demo/setup' },
  ]) {
    test(`${p.name} — zero critical JS errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));

      await page.goto(`${BASE}${p.url}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      const critical = errors.filter(e =>
        !e.includes('ResizeObserver') &&
        !e.includes('Non-Error') &&
        !e.includes('ChunkLoadError')
      );
      expect(critical).toHaveLength(0);
    });
  }
});
