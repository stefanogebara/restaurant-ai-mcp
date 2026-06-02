/**
 * E2E for onboarding Step 0 — Google Places + website-fallback prefill.
 *
 * Covers:
 *   - Fresh signup lands on Step 0 (no "Step X of N" counter visible)
 *   - Search disabled until both inputs filled
 *   - Top-hit confirm → wizard with the ✨ Google-Maps banner + prefilled
 *     restaurant name on Step 1
 *   - "Search again" resets the top-hit card
 *   - 0 hits → no-match hint → website URL fallback → wizard with banner
 *   - "Skip — fill manually" → wizard with empty form, no banner
 *
 * Strategy: stub /api/scrape-restaurant and /api/enrich-restaurant at the
 * Playwright route layer so the spec is deterministic and doesn't burn
 * Google Places quota / Anthropic tokens on every run.
 *
 * Auth: reuses e2e/auth-state.json — /onboarding is behind ProtectedRoute.
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_STATE = path.join(__dirname, 'auth-state.json');
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'audit-onboarding-step0');

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

test.use({ storageState: AUTH_STATE });

// Force English for every page load — the production auth-state.json was
// captured with pt-BR set, but the test assertions are written against the
// canonical English copy. Seed BEFORE any app script runs so i18n picks 'en'
// on first paint.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try { window.localStorage.setItem('seatable-user-lang', 'en'); } catch { /* private mode */ }
  });
});

interface ScrapeHit {
  name?: string | null;
  address?: string | null;
  cuisine_type?: string | null;
  phone?: string | null;
  rating?: number | null;
  review_count?: number;
  website?: string | null;
  business_hours?: Record<string, { open_time: string | null; close_time: string | null; is_open: boolean }> | null;
}

const SAMPLE_HIT: ScrapeHit = {
  name: 'Cantina Bella',
  address: 'Rua das Flores 123, São Paulo',
  cuisine_type: 'Italian',
  phone: '+55 11 5555 1234',
  rating: 4.6,
  review_count: 412,
  website: 'https://cantinabella.example',
  business_hours: {
    monday:    { open_time: '12:00', close_time: '23:00', is_open: true },
    tuesday:   { open_time: '12:00', close_time: '23:00', is_open: true },
    wednesday: { open_time: '12:00', close_time: '23:00', is_open: true },
    thursday:  { open_time: '12:00', close_time: '23:00', is_open: true },
    friday:    { open_time: '12:00', close_time: '23:30', is_open: true },
    saturday:  { open_time: '13:00', close_time: '23:30', is_open: true },
    sunday:    { open_time: '13:00', close_time: '17:00', is_open: true },
  },
};

async function stubScrape(context: BrowserContext, results: ScrapeHit[]) {
  await context.route('**/api/scrape-restaurant', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ results }),
    }),
  );
}

async function stubEnrich(context: BrowserContext, body: Record<string, unknown>) {
  await context.route('**/api/enrich-restaurant', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, ...body }),
    }),
  );
}

/**
 * Some integrations (Posthog, Sentry init) cause `networkidle` to never
 * resolve on this app. Wait for a known on-screen element instead.
 */
async function waitForStep0(page: Page) {
  await page.getByTestId('step0-search').waitFor({ state: 'visible', timeout: 15_000 });
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false });
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Onboarding Step 0 — initial state', () => {
  test('fresh signup lands on Step 0, not Step 1; step counter hidden', async ({ page, context }) => {
    await stubScrape(context, []);
    await page.goto('/onboarding');
    await waitForStep0(page);

    await expect(page.getByText(/Find your restaurant/i)).toBeVisible();
    await expect(page.getByLabel(/Restaurant name/i)).toBeVisible();
    await expect(page.getByLabel(/City/i)).toBeVisible();
    // The wizard's "Step X of 6" counter must NOT be visible while we're on
    // the discovery screen — Step 0 isn't a numbered step.
    await expect(page.getByText(/Step\s+\d+\s+of\s+\d+/i)).toHaveCount(0);
    await screenshot(page, 'step0-initial');
  });

  test('search disabled until both name and city are filled', async ({ page, context }) => {
    await stubScrape(context, []);
    await page.goto('/onboarding');
    await waitForStep0(page);

    const cta = page.getByRole('button', { name: /Search Google Maps/i });
    await expect(cta).toBeDisabled();

    await page.getByLabel(/Restaurant name/i).fill('Cantina Bella');
    await expect(cta).toBeDisabled();

    await page.getByLabel(/City/i).fill('São Paulo');
    await expect(cta).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Onboarding Step 0 — Google hit path', () => {
  test('single hit renders one candidate card with all metadata; pick advances to Step 1 with banner + prefilled name', async ({ page, context }) => {
    await stubScrape(context, [SAMPLE_HIT]);
    await page.goto('/onboarding');
    await waitForStep0(page);

    await page.getByLabel(/Restaurant name/i).fill('Cantina Bella');
    await page.getByLabel(/City/i).fill('São Paulo');
    await page.getByRole('button', { name: /Search Google Maps/i }).click();

    const candidates = page.getByTestId('step0-candidates');
    await expect(candidates).toBeVisible();
    await expect(candidates).toContainText(/Found one match/i);
    const card0 = page.getByTestId('step0-candidate-0');
    await expect(card0).toBeVisible();
    await expect(card0).toContainText(/Rua das Flores 123, São Paulo/i);
    await expect(card0).toContainText(/Italian/i);
    await expect(card0).toContainText(/4\.6 \(412\)/);
    await expect(card0).toContainText(/\+55 11 5555 1234/);
    // Only one candidate — no #1 card
    await expect(page.getByTestId('step0-candidate-1')).toHaveCount(0);
    await screenshot(page, 'step0-candidates-single');

    await page.getByTestId('step0-pick-0').click();

    // Step 1 (Welcome) is now visible — the wizard header + step counter return
    await expect(page.getByText(/Step\s+1\s+of\s+\d+/i)).toBeVisible({ timeout: 10_000 });
    // The Google-Maps prefill banner is showing
    await expect(page.getByText(/pulled from Google Maps/i)).toBeVisible();
    // Restaurant name input is prefilled with the scraped value
    await expect(page.getByLabel(/Restaurant Name/i)).toHaveValue('Cantina Bella');
    await screenshot(page, 'step1-after-prefill');
  });

  test('3 hits render a picker; user can pick candidate #2 (Lisbon) and that value is what prefills', async ({ page, context }) => {
    await stubScrape(context, [
      { ...SAMPLE_HIT, address: 'Rua das Flores 123, São Paulo' },
      { ...SAMPLE_HIT, address: 'Rua Visconde 45, Rio de Janeiro' },
      { ...SAMPLE_HIT, name: 'Cantina Bella Lisbon', address: 'Rua Garrett 9, Lisbon' },
      { ...SAMPLE_HIT, address: 'Av. Corrientes, Buenos Aires' }, // 4th, sliced off
    ]);
    await page.goto('/onboarding');
    await waitForStep0(page);

    await page.getByLabel(/Restaurant name/i).fill('Cantina Bella');
    await page.getByLabel(/City/i).fill('São Paulo');
    await page.getByRole('button', { name: /Search Google Maps/i }).click();

    await expect(page.getByTestId('step0-candidate-0')).toBeVisible();
    await expect(page.getByTestId('step0-candidate-1')).toBeVisible();
    await expect(page.getByTestId('step0-candidate-2')).toBeVisible();
    await expect(page.getByTestId('step0-candidate-3')).toHaveCount(0);
    await expect(page.getByText(/Which one is yours\?/i)).toBeVisible();
    await screenshot(page, 'step0-candidates-multi');

    await page.getByTestId('step0-pick-2').click();

    await expect(page.getByText(/Step\s+1\s+of\s+\d+/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/Restaurant Name/i)).toHaveValue('Cantina Bella Lisbon');
  });

  test('"None of these — got a website?" surfaces the website fallback without leaving Step 0', async ({ page, context }) => {
    await stubScrape(context, [SAMPLE_HIT, SAMPLE_HIT]);
    await page.goto('/onboarding');
    await waitForStep0(page);

    await page.getByLabel(/Restaurant name/i).fill('Cantina Bella');
    await page.getByLabel(/City/i).fill('São Paulo');
    await page.getByRole('button', { name: /Search Google Maps/i }).click();

    await expect(page.getByTestId('step0-candidates')).toBeVisible();
    await expect(page.getByPlaceholder(/your-restaurant\.com/i)).toHaveCount(0);

    await page.getByTestId('step0-none-of-these').click();
    await expect(page.getByPlaceholder(/your-restaurant\.com/i)).toBeVisible();
    // Candidates remain visible — user can still change their mind and pick one
    await expect(page.getByTestId('step0-candidates')).toBeVisible();
  });

  test('"Search again" hides the candidates and re-enables the search form', async ({ page, context }) => {
    await stubScrape(context, [SAMPLE_HIT]);
    await page.goto('/onboarding');
    await waitForStep0(page);

    await page.getByLabel(/Restaurant name/i).fill('Cantina Bella');
    await page.getByLabel(/City/i).fill('São Paulo');
    await page.getByRole('button', { name: /Search Google Maps/i }).click();
    await expect(page.getByTestId('step0-candidates')).toBeVisible();

    await page.getByRole('button', { name: /Search again/i }).click();
    await expect(page.getByTestId('step0-candidates')).toHaveCount(0);
    // Inputs still hold the previous values so the user can tweak + re-search
    await expect(page.getByLabel(/Restaurant name/i)).toHaveValue('Cantina Bella');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Onboarding Step 0 — no-match + website fallback', () => {
  test('0 hits → no-match hint + website URL input visible', async ({ page, context }) => {
    await stubScrape(context, []);
    await page.goto('/onboarding');
    await waitForStep0(page);

    await page.getByLabel(/Restaurant name/i).fill('Brand New Place');
    await page.getByLabel(/City/i).fill('Lisbon');
    await page.getByRole('button', { name: /Search Google Maps/i }).click();

    const noMatch = page.getByTestId('step0-no-match');
    await expect(noMatch).toBeVisible();
    await expect(noMatch).toContainText(/couldn't find your restaurant/i);
    await expect(page.getByPlaceholder(/your-restaurant\.com/i)).toBeVisible();
    await screenshot(page, 'step0-no-match');
  });

  test('website fallback hits /enrich-restaurant and advances to Step 1 with banner', async ({ page, context }) => {
    await stubScrape(context, []);
    await stubEnrich(context, {
      menu: {
        contact: { phone: '+351 21 555 1234', address: 'Rua Garrett, Lisbon', email: null },
        business_hours: null,
        menu_items: [],
        popular_dishes: [],
        social_handles: {},
        hours_text: null,
      },
      insights: null,
    });
    await page.goto('/onboarding');
    await waitForStep0(page);

    await page.getByLabel(/Restaurant name/i).fill('Brand New Place');
    await page.getByLabel(/City/i).fill('Lisbon');
    await page.getByRole('button', { name: /Search Google Maps/i }).click();
    await expect(page.getByTestId('step0-no-match')).toBeVisible();

    await page.getByPlaceholder(/your-restaurant\.com/i).fill('https://brandnew.example');
    await page.getByTestId('step0-enrich-cta').click();

    // Wizard mounts with the banner + the search-stage name prefilled
    await expect(page.getByText(/Step\s+1\s+of\s+\d+/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/pulled from Google Maps/i)).toBeVisible();
    await expect(page.getByLabel(/Restaurant Name/i)).toHaveValue('Brand New Place');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Onboarding Step 0 — skip path', () => {
  test('"Skip — I\'ll fill it in manually" goes to Step 1 with empty form, no banner', async ({ page, context }) => {
    // Stub so an accidental search doesn't hit prod
    await stubScrape(context, []);
    await page.goto('/onboarding');
    await waitForStep0(page);

    await page.getByTestId('step0-skip').click();

    await expect(page.getByText(/Step\s+1\s+of\s+\d+/i)).toBeVisible({ timeout: 10_000 });
    // No prefill banner — the skip path means "user is typing from scratch"
    await expect(page.getByText(/pulled from Google Maps/i)).toHaveCount(0);
    // Restaurant name input is empty (the skip path means "user is typing from scratch")
    await expect(page.getByLabel(/Restaurant Name/i)).toHaveValue('');
    await screenshot(page, 'step1-after-skip');
  });
});
