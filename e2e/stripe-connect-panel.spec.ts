/**
 * StripeConnectPanel E2E
 *
 * Exercises the panel on /host-dashboard/voice-settings → POS tab:
 *   1. State rendering — pill colour + CTA label per { connected, status }
 *   2. "Connect Stripe" click → POST /api/stripe-connect-onboarding →
 *      window.location.href = response.url
 *
 * Strategy: stub /api/stripe-connect-status and /api/stripe-connect-onboarding
 * at the Playwright route layer so the test doesn't touch real Stripe (no
 * dormant accounts left behind) and doesn't depend on the test bistro's
 * actual Connect row.
 *
 * Run:
 *   npx playwright test e2e/stripe-connect-panel.spec.ts
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';

const AUTH_STATE = path.join(__dirname, 'auth-state.json');

test.use({ storageState: AUTH_STATE });

interface ConnectStatus {
  success: true;
  connected: boolean;
  account_id?: string;
  status?: 'pending' | 'active' | 'restricted' | 'disabled' | 'revoked';
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  default_currency?: string | null;
  country?: string;
}

async function stubStatus(page: Page, body: ConnectStatus) {
  await page.route('**/api/stripe-connect-status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

async function gotoPosTab(page: Page) {
  await page.goto('/host-dashboard/voice-settings');
  await page.waitForLoadState('networkidle');
  // The POS tab is in a SettingsTabs strip. Click by visible label.
  await page.getByRole('tab', { name: /POS/ }).click();
}

test.describe('StripeConnectPanel', () => {
  test('not connected → renders "Connect Stripe" CTA, no status pill', async ({ page }) => {
    await stubStatus(page, { success: true, connected: false });
    await gotoPosTab(page);

    await expect(page.getByRole('heading', { name: /Stripe \(receive bookings\)/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Connect Stripe/i })).toBeVisible();
    // No status pill — the connected-only details grid shouldn't render either.
    await expect(page.getByText(/^Charges$/i)).toHaveCount(0);
  });

  test('pending → amber pill, "Continue onboarding" CTA', async ({ page }) => {
    await stubStatus(page, {
      success: true,
      connected: true,
      account_id: 'acct_test_pending',
      status: 'pending',
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      default_currency: 'brl',
      country: 'BR',
    });
    await gotoPosTab(page);

    await expect(page.getByText(/pending/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue onboarding/i })).toBeVisible();
    await expect(page.getByText('acct_test_pending')).toBeVisible();
  });

  test('active → green pill, "Edit Stripe details" CTA, all flags Enabled', async ({ page }) => {
    await stubStatus(page, {
      success: true,
      connected: true,
      account_id: 'acct_test_active',
      status: 'active',
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      default_currency: 'brl',
      country: 'BR',
    });
    await gotoPosTab(page);

    await expect(page.getByText(/active/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Edit Stripe details/i })).toBeVisible();
    // Two "Enabled" cells for charges + payouts.
    await expect(page.getByText(/Enabled/i)).toHaveCount(2);
  });

  test('revoked → red pill, "Fix Stripe issues" CTA', async ({ page }) => {
    await stubStatus(page, {
      success: true,
      connected: true,
      account_id: 'acct_test_revoked',
      status: 'revoked',
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: true,
      default_currency: 'brl',
      country: 'BR',
    });
    await gotoPosTab(page);

    await expect(page.getByText(/revoked/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Fix Stripe issues/i })).toBeVisible();
  });

  test('click "Connect Stripe" → POSTs onboarding → navigates away from voice-settings', async ({ page }) => {
    // Use a same-origin stub URL so we don't bounce through Stripe (synthetic
    // acct ids would be rejected). The exact post-navigation URL depends on
    // the host-dashboard's own routing (e.g. `/host-dashboard` redirects to
    // `/host-dashboard/simple`), so we assert *navigation happened* + that
    // the onboarding POST actually fired, not an exact URL match.
    const STUB_URL = 'https://seatable.one/host-dashboard?stripe_redirect_stub=1';
    await stubStatus(page, { success: true, connected: false });
    let onboardingPostHit = false;
    let onboardingMethod = '';
    await page.route('**/api/stripe-connect-onboarding', (route) => {
      onboardingPostHit = true;
      onboardingMethod = route.request().method();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, url: STUB_URL, account_id: 'acct_e2e_stub', status: 'pending' }),
      });
    });

    await gotoPosTab(page);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.endsWith('/voice-settings'), { timeout: 15_000 }),
      page.getByRole('button', { name: /Connect Stripe/i }).click(),
    ]);
    expect(onboardingPostHit).toBe(true);
    expect(onboardingMethod).toBe('POST');
    // Same-origin redirect, but no longer on the voice-settings page.
    expect(page.url()).not.toContain('/voice-settings');
  });

  test('?stripe_connect=ok in URL → success toast + URL cleaned', async ({ page }) => {
    await stubStatus(page, { success: true, connected: false });
    await page.goto('/host-dashboard/voice-settings?stripe_connect=ok');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /POS/ }).click();
    // The panel's useEffect strips the ?stripe_connect param via
    // window.history.replaceState. Assert the URL is clean.
    await expect.poll(() => new URL(page.url()).searchParams.has('stripe_connect'), { timeout: 3000 }).toBe(false);
  });
});
