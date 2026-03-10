/**
 * Auth setup — run once to capture a logged-in session.
 *
 * Usage:
 *   npx playwright test e2e/auth.setup.ts --headed
 *
 * Opens the app in a real browser, waits for you to complete Google OAuth,
 * then saves the session to e2e/auth-state.json.
 * Subsequent authenticated test runs load that state automatically.
 */
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const AUTH_STATE_PATH = path.join(__dirname, 'auth-state.json');

setup('authenticate via Google OAuth', async ({ page }) => {
  await page.goto('/host-dashboard');

  // Already authenticated? Save immediately.
  const isDashboard = await page.locator('text=Floor Plan').isVisible({ timeout: 5000 }).catch(() => false);
  if (isDashboard) {
    await page.context().storageState({ path: AUTH_STATE_PATH });
    console.log('Already logged in — auth state saved to', AUTH_STATE_PATH);
    return;
  }

  // Wait for Google login button
  await expect(page.getByRole('button', { name: /Continue with Google|Sign in with Google/i }))
    .toBeVisible({ timeout: 10000 });

  console.log('\n⚠️  Please log in via Google in the browser window that opened.');
  console.log('   Waiting up to 60 seconds for authentication...\n');

  // Wait for dashboard to appear after manual login
  await page.waitForSelector('text=Floor Plan', { timeout: 60000 });

  await page.context().storageState({ path: AUTH_STATE_PATH });
  console.log('✅ Auth state saved to', AUTH_STATE_PATH);
});
