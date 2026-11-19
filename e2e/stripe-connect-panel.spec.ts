/**
 * StripeConnectPanel E2E
 *
 * Exercises the panel on /host-dashboard/integrations → Payments tab:
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

async function gotoPaymentsTab(page: Page) {
  await page.goto('/host-dashboard/integrations');
  await page.waitForLoadState('networkidle');
  // The Payments tab is in a SettingsTabs strip. Click by visible label.
  await page.getByRole('tab', { name: /Payments/ }).click();
}

test.describe('StripeConnectPanel', () => {
  test('not connected → renders "Connect Stripe" CTA, no status pill', async ({ page }) => {
    await stubStatus(page, { success: true, connected: false });
    await gotoPaymentsTab(page);

    await expect(page.getByRole('heading', { name: /Stripe for booking deposits/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Connect Stripe/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Set up deposits' })).toHaveCount(0);
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
    await gotoPaymentsTab(page);

    await expect(page.getByText(/pending/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue onboarding/i })).toBeVisible();
    await expect(page.getByText(/Finish setting up your account/i)).toBeVisible();
  });

  test('active → green pill and a link to configure deposits', async ({ page }) => {
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
    await gotoPaymentsTab(page);

    await expect(page.getByText(/active/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Set up deposits' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Stripe' })).toBeVisible();
  });

  test('revoked → red pill, "Connect again" CTA', async ({ page }) => {
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
    await gotoPaymentsTab(page);

    await expect(page.getByText(/revoked/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Connect again/i })).toBeVisible();
  });

  test('click Connect Stripe posts onboarding and follows the hosted link', async ({ page }) => {
    const STUB_URL = 'https://connect.stripe.com/setup/s/seatable-browser-fixture';
    await page.route(STUB_URL, route => route.fulfill({ status: 200, body: 'Stripe fixture' }));
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

    await gotoPaymentsTab(page);
    await Promise.all([
      page.waitForURL(STUB_URL, { timeout: 15_000 }),
      page.getByRole('button', { name: /Connect Stripe/i }).click(),
    ]);
    expect(onboardingPostHit).toBe(true);
    expect(onboardingMethod).toBe('POST');
    expect(page.url()).toBe(STUB_URL);
  });

  test('Stripe return waits for verification and keeps incomplete onboarding pending', async ({ page }) => {
    let refreshed = false;
    await page.route('**/api/stripe-connect-status', route => {
      refreshed ||= route.request().method() === 'POST';
      return route.fulfill({ json: { success: true, connected: true, status: 'pending' } });
    });
    await page.goto('/host-dashboard/integrations?stripe_connect=ok#integrations:pos');
    await expect(page.getByRole('button', { name: /Continue onboarding/i })).toBeVisible();
    expect(refreshed).toBe(true);
    await expect(page).toHaveURL(/\/host-dashboard\/integrations#integrations:payments$/);
  });
});
