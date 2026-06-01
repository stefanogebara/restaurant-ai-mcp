/**
 * End-to-end audit of the Stripe Connect rollout surface.
 *
 *   - StripeConnectStatusBadge on /host-dashboard/simple (each state)
 *   - StripeConnectNudgeBanner on /host-dashboard/simple (gating matrix)
 *   - StripeConnectPanel on /host-dashboard/voice-settings POS tab
 *   - Cross-surface click-through: nudge banner → panel → onboarding URL
 *
 * Strategy: stub /api/stripe-connect-status, /api/stripe-connect-onboarding,
 * and /api/deposit-config at the Playwright route layer so each spec runs
 * deterministically without touching real Stripe or relying on the test
 * bistro's actual DB state. Captures screenshots per visible state so a
 * human reviewer can eyeball the design once.
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_STATE = path.join(__dirname, 'auth-state.json');
const SCREENSHOTS_DIR = path.join(__dirname, '..', 'audit-stripe-connect');

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

test.use({ storageState: AUTH_STATE });

type Status =
  | 'pending'
  | 'active'
  | 'restricted'
  | 'disabled'
  | 'revoked';

interface StatusBody {
  success: boolean;
  connected: boolean;
  account_id?: string;
  status?: Status;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  default_currency?: string | null;
  country?: string;
}

async function stubAll(
  context: BrowserContext,
  opts: {
    connectStatus?: StatusBody;
    depositEnabled?: boolean;
    onboardingUrl?: string;
  },
) {
  if (opts.connectStatus !== undefined) {
    await context.route('**/api/stripe-connect-status', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.connectStatus) }),
    );
  }
  if (opts.depositEnabled !== undefined) {
    await context.route('**/api/deposit-config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ deposit_config: { enabled: opts.depositEnabled, type: 'flat', amount: 50 } }),
      }),
    );
  }
  if (opts.onboardingUrl) {
    await context.route('**/api/stripe-connect-onboarding', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, url: opts.onboardingUrl, account_id: 'acct_audit_stub', status: 'pending' }),
      }),
    );
  }
}

async function screenshot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard surface
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dashboard — StripeConnectStatusBadge', () => {
  test('active → badge hidden (no clutter)', async ({ page, context }) => {
    await stubAll(context, {
      connectStatus: { success: true, connected: true, status: 'active', charges_enabled: true, payouts_enabled: true, details_submitted: true, account_id: 'acct_a' },
      depositEnabled: false,
    });
    await page.goto('/host-dashboard/simple');
    // Wait for the dashboard header to be present rather than networkidle
    // — this dashboard has long-polling queries that never let networkidle
    // resolve, causing 30s timeouts on otherwise-passing assertions.
    await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible', timeout: 15_000 });
    // Brief settle so the React Query for connect-status has resolved.
    await page.waitForTimeout(500);
    expect(await page.locator('[data-testid="stripe-connect-status-badge"]').count()).toBe(0);
  });

  for (const { status, tone, copy } of [
    { status: 'pending'    as Status, tone: 'amber', copy: /Finish Stripe onboarding/i },
    { status: 'restricted' as Status, tone: 'amber', copy: /Stripe needs attention/i },
    { status: 'disabled'   as Status, tone: 'red',   copy: /Stripe disabled/i },
    { status: 'revoked'    as Status, tone: 'red',   copy: /Stripe disconnected/i },
  ]) {
    test(`${status} → badge visible (${tone}) with correct copy + link`, async ({ page, context }) => {
      await stubAll(context, {
        connectStatus: { success: true, connected: true, status, charges_enabled: false, payouts_enabled: false, details_submitted: false, account_id: 'acct_x' },
        depositEnabled: false,
      });
      await page.goto('/host-dashboard/simple');
      const badge = page.locator('[data-testid="stripe-connect-status-badge"]');
      await expect(badge).toBeVisible();
      await expect(badge).toContainText(copy);
      expect(await badge.getAttribute('href')).toBe('/host-dashboard/voice-settings#tab=pos');
      const expectedToneClass = tone === 'amber' ? 'bg-amber-50' : 'bg-red-50';
      await expect(badge).toHaveClass(new RegExp(expectedToneClass));
      await screenshot(page, `dashboard-badge-${status}`);
    });
  }
});

test.describe('Dashboard — StripeConnectNudgeBanner', () => {
  test('deposits OFF + not connected → banner hidden', async ({ page, context }) => {
    await stubAll(context, {
      connectStatus: { success: true, connected: false },
      depositEnabled: false,
    });
    await page.goto('/host-dashboard/simple');
    await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(await page.locator('[data-testid="stripe-connect-nudge-banner"]').count()).toBe(0);
  });

  test('deposits ON + connected (any status) → banner hidden (badge owns messaging)', async ({ page, context }) => {
    await stubAll(context, {
      connectStatus: { success: true, connected: true, status: 'revoked', account_id: 'acct_x' },
      depositEnabled: true,
    });
    await page.goto('/host-dashboard/simple');
    await page.getByRole('heading', { level: 1 }).first().waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(await page.locator('[data-testid="stripe-connect-nudge-banner"]').count()).toBe(0);
  });

  test('deposits ON + not connected → banner visible with CTA', async ({ page, context }) => {
    await stubAll(context, {
      connectStatus: { success: true, connected: false },
      depositEnabled: true,
    });
    await page.goto('/host-dashboard/simple');
    const banner = page.locator('[data-testid="stripe-connect-nudge-banner"]');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(/Connect your Stripe account/i);
    await expect(banner).toContainText(/currently routed through Seatable/i);
    const cta = banner.getByRole('link', { name: /Connect Stripe/i });
    expect(await cta.getAttribute('href')).toBe('/host-dashboard/voice-settings#tab=pos');
    await screenshot(page, 'dashboard-nudge-banner');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cross-surface: nudge banner click → panel → onboarding redirect
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Cross-surface — dashboard nudge → panel → Stripe redirect', () => {
  test('clicks through end-to-end without leaving voice-settings until final redirect', async ({ page, context }) => {
    const STUB_URL = 'https://seatable.one/host-dashboard?audit_redirect_stub=1';
    await stubAll(context, {
      connectStatus: { success: true, connected: false },
      depositEnabled: true,
      onboardingUrl: STUB_URL,
    });

    // 1. Land on dashboard, see nudge banner
    await page.goto('/host-dashboard/simple');
    await expect(page.locator('[data-testid="stripe-connect-nudge-banner"]')).toBeVisible();

    // 2. Click the banner CTA → goes to voice settings
    await page.getByRole('link', { name: /Connect Stripe/i }).first().click();
    await page.waitForURL(/voice-settings/);

    // 3. POS tab content rendered
    await page.getByRole('tab', { name: /POS/ }).click();
    await expect(page.getByRole('heading', { name: /Stripe \(receive bookings\)/i })).toBeVisible();

    // 4. Click panel's "Connect Stripe" button → navigates away from voice-settings
    let onboardingPostHit = false;
    await page.route('**/api/stripe-connect-onboarding', (route) => {
      onboardingPostHit = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, url: STUB_URL, account_id: 'acct_audit_stub', status: 'pending' }),
      });
    });

    await Promise.all([
      page.waitForURL((u) => !u.pathname.endsWith('/voice-settings'), { timeout: 15_000 }),
      page.getByRole('button', { name: /Connect Stripe/i }).click(),
    ]);
    expect(onboardingPostHit).toBe(true);
    expect(page.url()).not.toContain('/voice-settings');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Panel — every CTA label per state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Panel — CTA label per state', () => {
  for (const { status, cta } of [
    { status: 'not_connected' as const, cta: /Connect Stripe/i           },
    { status: 'pending'       as const, cta: /Continue onboarding/i      },
    { status: 'active'        as const, cta: /Edit Stripe details/i      },
    { status: 'restricted'    as const, cta: /Fix Stripe issues/i        },
    { status: 'disabled'      as const, cta: /Fix Stripe issues/i        },
    { status: 'revoked'       as const, cta: /Fix Stripe issues/i        },
  ]) {
    test(`status=${status} → CTA "${cta.source.slice(1, -2)}"`, async ({ page, context }) => {
      const body: StatusBody = status === 'not_connected'
        ? { success: true, connected: false }
        : { success: true, connected: true, status: status as Status, charges_enabled: false, payouts_enabled: false, details_submitted: false, account_id: 'acct_x' };
      await stubAll(context, { connectStatus: body, depositEnabled: false });
      await page.goto('/host-dashboard/voice-settings');
      await page.waitForLoadState('networkidle');
      await page.getByRole('tab', { name: /POS/ }).click();
      await expect(page.getByRole('button', { name: cta })).toBeVisible();
      await screenshot(page, `panel-${status}`);
    });
  }
});
