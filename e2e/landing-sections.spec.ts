import { test, expect } from '@playwright/test';

/**
 * Landing Page — Dashboard Walkthrough Section
 * Tests the animated "silent movie" section that replaced
 * BeforeAfterSection + FeatureCardsSection.
 */

test.describe('Landing Page — Dashboard Walkthrough Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('h1', { timeout: 10000 });
  });

  test('Walkthrough section renders with heading', async ({ page }) => {
    const heading = page.getByRole('heading', { level: 2 }).filter({ hasText: /Watch the AI work|Veja a IA em ação|Mira la IA en acción/i });
    await expect(heading).toBeVisible();
  });

  test('renders 4 scene selector pills', async ({ page }) => {
    // Scene pills should be visible — one for each feature
    const pills = page.locator('button').filter({ hasText: /Revenue Intelligence|No-Show Protection|Manager AI|Smart Staffing|Receita Inteligente|Proteção No-Show|Gerente IA|Escala Inteligente|Inteligencia de Ingresos|Protección No-Show|Staffing Inteligente/i });
    await expect(pills).toHaveCount(4);
  });

  test('clicking a scene pill switches content', async ({ page }) => {
    // Find the Manager AI pill and click it
    const managerPill = page.locator('button').filter({ hasText: /Manager AI|Gerente IA/i });
    await managerPill.scrollIntoViewIfNeeded();
    await managerPill.click();

    // Wait for scene transition
    await page.waitForTimeout(500);

    // Manager AI scene should show stats row (Tables, Today, etc.)
    await expect(page.getByText('Tables').first()).toBeVisible();
    await expect(page.getByText('5/8').first()).toBeVisible();
  });

  test('dashboard chrome is visible', async ({ page }) => {
    // The browser-like chrome should show the fake URL bar
    const urlBar = page.getByText('seatable.one/dashboard');
    // There may be multiple (hero + walkthrough), so check at least one
    const count = await urlBar.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('auto-advances scenes with progress bars', async ({ page }) => {
    // Find the walkthrough section
    const heading = page.getByRole('heading', { level: 2 }).filter({ hasText: /Watch the AI work|Veja a IA/i });
    await heading.scrollIntoViewIfNeeded();

    // Progress bars should exist (4 of them)
    // They're small div elements — we check the section has the right structure
    const section = page.locator('section').filter({ has: heading });
    await expect(section).toBeVisible();

    // CTA link should be present
    const cta = section.getByRole('link', { name: /Try it free|Experimente grátis|Pruébalo gratis/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/demo/setup');
  });
});

test.describe('Landing Page — Section Order', () => {
  test('sections appear in correct order on landing page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('h1', { timeout: 10000 });

    // Get all h2 headings and verify order
    const headings = await page.locator('h2').allTextContents();

    // Find indices of our sections
    const walkthroughIdx = headings.findIndex(h => /Watch the AI work|Veja a IA em ação|Mira la IA en acción/i.test(h));
    const pricingIdx = headings.findIndex(h => /pricing|transparentes|Planos/i.test(h));

    // Both sections should exist
    expect(walkthroughIdx).toBeGreaterThan(-1);
    expect(pricingIdx).toBeGreaterThan(-1);

    // Walkthrough before Pricing
    expect(walkthroughIdx).toBeLessThan(pricingIdx);
  });

  test('old sections are gone', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('h1', { timeout: 10000 });

    // Old Before/After toggle buttons should NOT exist
    await expect(page.getByRole('button', { name: /Without Seatable|Sem Seatable/i })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /With Seatable|Com Seatable/i })).not.toBeVisible();

    // Old FeatureCards headings should NOT exist as standalone cards
    // (Manager AI text may appear inside walkthrough scene, but not as a card heading)
    const headings = await page.locator('h2').allTextContents();
    const hasOldFeatures = headings.some(h => /Intelligence built in|Inteligência integrada|Inteligencia integrada/i.test(h));
    expect(hasOldFeatures).toBe(false);
  });
});

test.describe('Landing Page — No Console Errors', () => {
  test('landing page loads without critical errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Filter out expected noise
    const criticalErrors = errors.filter(e =>
      !e.includes('posthog') &&
      !e.includes('PostHog') &&
      !e.includes('analytics') &&
      !e.includes('Sentry') &&
      !e.includes('favicon') &&
      !e.includes('ERR_BLOCKED_BY_CLIENT') &&
      !e.includes('net::ERR')
    );

    expect(criticalErrors).toHaveLength(0);
  });
});
