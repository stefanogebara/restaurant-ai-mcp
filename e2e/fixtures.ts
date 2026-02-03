import { test as base, expect } from '@playwright/test';

// Extend base test with authenticated page
export const test = base.extend<{ authenticatedPage: any }>({
  authenticatedPage: async ({ page }, use) => {
    // Navigate to app - will redirect to login if not authenticated
    await page.goto('/host-dashboard');

    // Check if we need to login
    const loginButton = page.getByRole('button', { name: /Continue with Google|Sign in with Google/i });

    if (await loginButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Manual auth required - for CI, use stored auth state
      // For local dev, we'll handle this interactively
      console.log('Authentication required - please login manually');
    }

    // Wait for dashboard to load
    await page.waitForSelector('text=Floor Plan', { timeout: 30000 });

    await use(page);
  },
});

export { expect };
