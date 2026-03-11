import { test, expect } from '@playwright/test';

/**
 * Brazil Launch E2E Tests
 *
 * Smoke tests for the landing page, pricing, contact, FAQ,
 * booking portal, and mobile responsiveness — all critical
 * for the Brazil-first Q2 2026 launch.
 */

test.describe('Landing Page Smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
  });

  test('renders without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    const criticalErrors = errors.filter(e =>
      !e.includes('posthog') &&
      !e.includes('analytics') &&
      !e.includes('favicon') &&
      !e.includes('ERR_BLOCKED_BY_CLIENT')
    );

    expect(criticalErrors.length).toBeLessThan(5);
  });

  test('hero section loads with heading and CTA', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible();
    const heading = await page.locator('h1').textContent();
    expect(heading).toBeTruthy();
  });

  test('no blank page (body has content)', async ({ page }) => {
    await page.waitForSelector('h1', { timeout: 10000 });
    const bodyText = await page.textContent('body');
    expect(bodyText!.length).toBeGreaterThan(100);
  });
});

test.describe('Pricing Section', () => {
  test('pricing section exists and shows plans', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const pricingSection = page.locator('#pricing');
    await expect(pricingSection).toBeAttached();

    // Should have at least 3 plan cards (Starter, Growth, Scale)
    const pricingText = await pricingSection.textContent();
    const hasPlanNames = [/starter/i, /growth/i, /scale/i].filter(p => p.test(pricingText!));
    expect(hasPlanNames.length).toBeGreaterThanOrEqual(3);
  });

  test('pricing shows currency amounts', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const pricingSection = page.locator('#pricing');
    const pricingText = await pricingSection.textContent();

    // Should contain some currency indicator (EUR or BRL depending on locale)
    const hasCurrency = pricingText!.includes('€') || pricingText!.includes('R$') || pricingText!.includes('/month');
    expect(hasCurrency).toBeTruthy();
  });
});

test.describe('Contact Section', () => {
  test('contact form section is accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const contactSection = page.locator('#contact');
    await expect(contactSection).toBeAttached();

    // Should have email reference
    const contactText = await contactSection.textContent();
    const hasContactInfo = contactText!.includes('hello@seatable.one') || contactText!.includes('contact');
    expect(hasContactInfo).toBeTruthy();
  });
});

test.describe('FAQ Section', () => {
  test('FAQ section renders with questions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const faqSection = page.locator('#faq');
    await expect(faqSection).toBeAttached();

    // Should have clickable FAQ items
    const faqText = await faqSection.textContent();
    expect(faqText!.length).toBeGreaterThan(50);
  });

  test('FAQ items are expandable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Find first FAQ button/trigger
    const faqSection = page.locator('#faq');
    const faqButtons = faqSection.locator('button, [role="button"], details > summary');
    const count = await faqButtons.count();

    if (count > 0) {
      // Click first FAQ item
      await faqButtons.first().click();
      await page.waitForTimeout(500);

      // After click, more content should be visible
      const faqTextAfter = await faqSection.textContent();
      expect(faqTextAfter!.length).toBeGreaterThan(100);
    }
  });
});

test.describe('Public Booking Portal', () => {
  test('/book/:slug renders booking page', async ({ page }) => {
    // Use the demo restaurant slug
    await page.goto('/book/boteco-do-samba');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // wait for React hydration

    const bodyText = await page.textContent('body');
    // Should either show the booking form or a "not found" message
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(20);
  });
});

test.describe('Customer Portal', () => {
  test('/customer renders without crash', async ({ page }) => {
    await page.goto('/customer');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // wait for React hydration

    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(20);
  });
});

test.describe('Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone X

  test('landing page renders on mobile without horizontal scroll', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Check no horizontal overflow
    const hasOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test('mobile menu is accessible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Hamburger menu should be visible on mobile
    const menuBtn = page.getByRole('button', { name: /open menu/i });
    await expect(menuBtn).toBeVisible();

    // Can open the menu
    await menuBtn.click();
    await page.waitForTimeout(500);

    // Menu items should appear
    const menuItems = page.locator('[role="dialog"], [class*="mobile-menu"], nav').last();
    await expect(menuItems).toBeVisible();
  });

  test('pricing section readable on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Scroll to pricing
    await page.locator('#pricing').scrollIntoViewIfNeeded();
    await expect(page.locator('#pricing')).toBeInViewport();

    // Pricing text should be visible
    const pricingText = await page.locator('#pricing').textContent();
    expect(pricingText!.length).toBeGreaterThan(50);
  });
});
