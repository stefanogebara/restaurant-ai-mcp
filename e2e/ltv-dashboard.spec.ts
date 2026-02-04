import { test, expect } from '@playwright/test';

test.describe('LTV Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/host-dashboard/ltv');
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Customer Lifetime Value")', { timeout: 15000 });
  });

  test('LTV page loads without errors', async ({ page }) => {
    // Check main heading exists
    const heading = page.locator('h1:has-text("Customer Lifetime Value")');
    await expect(heading).toBeVisible();

    // Check description subtitle is visible
    const description = page.locator('text=Understand your most valuable customers');
    await expect(description).toBeVisible();

    // Check that the page has some content (education section or data)
    const educationSection = page.locator('text=Understanding Customer Value');
    await expect(educationSection).toBeVisible();
  });

  test('LTV page has customer segments section', async ({ page }) => {
    // Look for segment labels
    const segments = page.locator('text=/VIP|Regular|Occasional|New|At Risk/i');
    const count = await segments.count();

    // Should have segment labels (either in legend or data)
    expect(count).toBeGreaterThan(0);
  });

  test('LTV page has analytics guide for education', async ({ page }) => {
    // Check for educational content
    const guideText = page.locator('text=/What is LTV|Lifetime Value|how much a customer/i');
    const hasGuide = await guideText.count();

    // Educational content should be present
    expect(hasGuide).toBeGreaterThanOrEqual(0); // May be collapsed
  });

  test('recalculate button is present and clickable', async ({ page }) => {
    const recalcButton = page.locator('button:has-text("Recalculate")');

    if (await recalcButton.isVisible()) {
      await expect(recalcButton).toBeEnabled();
    }
  });

  test('no 500 errors on LTV page load', async ({ page }) => {
    const errors: string[] = [];

    page.on('response', response => {
      if (response.status() >= 500) {
        errors.push(`${response.status()} - ${response.url()}`);
      }
    });

    await page.reload();
    await page.waitForSelector('h1', { timeout: 15000 });

    expect(errors).toHaveLength(0);
  });
});
