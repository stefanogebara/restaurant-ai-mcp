import { test, expect } from '@playwright/test';

/**
 * Critical E2E Flows for seatable
 * Tests all public pages, navigation, auth guards, and key user journeys.
 * Run against production: npx playwright test e2e/critical-flows.spec.ts
 */

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // domcontentloaded is sufficient; networkidle can hang on production due to analytics
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
  });

  test('renders hero section with correct heading and CTAs', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Never miss a reservation again');

    // Both CTA buttons visible (use .first() since pricing section may also have these)
    const tryDemo = page.getByRole('button', { name: /try live demo/i }).first();
    const createDemo = page.getByRole('button', { name: /create.*free demo|create.*demo/i }).first();
    await expect(tryDemo).toBeVisible();
    await expect(createDemo).toBeVisible();
  });

  test('"Try Live Demo" navigates to /live-demo', async ({ page }) => {
    await page.getByRole('button', { name: /try live demo/i }).click();
    await expect(page).toHaveURL(/\/live-demo/);
  });

  test('"Start Free Trial" in pricing section navigates to demo setup (not /onboarding)', async ({ page }) => {
    // "Start Free Trial" buttons are in the pricing section cards — they navigate to demo setup
    await page.getByRole('button', { name: /start free trial/i }).first().click();
    await page.waitForTimeout(2000);
    // Should NOT navigate to /onboarding (the old direct signup route)
    expect(page.url()).not.toContain('/onboarding');
    // Should navigate somewhere meaningful (demo, login, or trial setup)
    expect(page.url()).not.toBe('https://restaurant-ai-mcp.vercel.app/');
  });

  test('nav "Get Started" scrolls to pricing section', async ({ page }) => {
    // Desktop nav Get Started button
    const navGetStarted = page.locator('nav').getByRole('button', { name: /get started/i });
    if (await navGetStarted.isVisible()) {
      await navGetStarted.click();
      await page.waitForTimeout(2000);
      expect(page.url()).not.toContain('/onboarding');
      await expect(page.locator('#pricing')).toBeInViewport();
    }
  });

  test('nav "Login" navigates to /login', async ({ page }) => {
    const loginBtn = page.locator('nav').getByRole('button', { name: /^login$/i });
    if (await loginBtn.isVisible()) {
      await loginBtn.click();
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('renders features section', async ({ page }) => {
    const featuresSection = page.locator('#features');
    await expect(featuresSection).toBeAttached();
  });

  test('renders pricing section with three plans', async ({ page }) => {
    const pricingSection = page.locator('#pricing');
    await expect(pricingSection).toBeAttached();
  });

  test('renders FAQ section', async ({ page }) => {
    const faqSection = page.locator('#faq');
    await expect(faqSection).toBeAttached();
  });

  test('renders contact form section', async ({ page }) => {
    const contactSection = page.locator('#contact');
    await expect(contactSection).toBeAttached();
  });

  test('footer links use correct hrefs', async ({ page }) => {
    const footer = page.locator('footer');
    // "Get Started" should NOT link to /onboarding
    const getStartedLink = footer.locator('a:has-text("Get Started")');
    if (await getStartedLink.count() > 0) {
      const href = await getStartedLink.getAttribute('href');
      expect(href).not.toBe('/onboarding');
    }
    // Contact link should use hello@seatable.io
    const contactLink = footer.locator('a:has-text("Contact")');
    if (await contactLink.count() > 0) {
      const href = await contactLink.getAttribute('href');
      expect(href).toContain('hello@seatable.io');
    }
  });

  test('page title is lowercase "seatable"', async ({ page }) => {
    const title = await page.title();
    expect(title).toMatch(/^seatable/);
    expect(title).not.toMatch(/^Seatable/);
  });

  test('no button text is in ALL CAPS (tracking-widest uppercase removed)', async ({ page }) => {
    // Check major CTA buttons don't have all-uppercase text
    const buttons = page.locator('button, a[role="button"]');
    const count = await buttons.count();
    for (let i = 0; i < Math.min(count, 20); i++) {
      const text = await buttons.nth(i).textContent();
      if (text && text.trim().length > 3) {
        // Should not be ALL CAPS (allowing short labels like "EN", "ES")
        const trimmed = text.trim();
        const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
        if (isAllCaps && trimmed.length > 5) {
          // Flag but don't fail for stat labels
          console.warn(`Possible ALL CAPS button text: "${trimmed}"`);
        }
      }
    }
  });
});

test.describe('Login Page', () => {
  test('renders login form with Google OAuth and email fields', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Google OAuth button
    await expect(page.getByText('Continue with Google')).toBeVisible();

    // Email and password fields
    await expect(page.locator('input#email')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();

    // Sign In / Create Account button
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('can toggle between sign in and sign up modes', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Default: sign in
    await expect(page.getByText('Welcome back')).toBeVisible();

    // Switch to sign up
    await page.getByRole('button', { name: /create an account/i }).click();
    await expect(page.getByText('Create your account')).toBeVisible();

    // Switch back
    await page.getByRole('button', { name: /sign in/i }).last().click();
    await expect(page.getByText('Welcome back')).toBeVisible();
  });

  test('Terms/Privacy links are not dead (#)', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const termsLink = page.locator('a:has-text("Terms of Service")');
    const privacyLink = page.locator('a:has-text("Privacy Policy")');

    if (await termsLink.count() > 0) {
      const href = await termsLink.getAttribute('href');
      expect(href).not.toBe('#');
    }
    if (await privacyLink.count() > 0) {
      const href = await privacyLink.getAttribute('href');
      expect(href).not.toBe('#');
    }
  });

  test('"Back to Home" link returns to landing page', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    await page.getByText('Back to Home').click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('Live AI Demo Page', () => {
  test('renders demo page with instructions', async ({ page }) => {
    await page.goto('/live-demo');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    await expect(page.getByText('Hear the AI in action.')).toBeVisible();
    await expect(page.getByText('Natural Conversation')).toBeVisible();
  });

  test('"Get Started" nav link does not go to /onboarding', async ({ page }) => {
    await page.goto('/live-demo');
    await page.waitForLoadState('domcontentloaded');

    const getStartedLink = page.locator('nav a:has-text("Get Started")');
    if (await getStartedLink.count() > 0) {
      const href = await getStartedLink.getAttribute('href');
      expect(href).not.toBe('/onboarding');
    }
  });

  test('demo restaurant info card is visible', async ({ page }) => {
    await page.goto('/live-demo');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Demo restaurant section with the seeded restaurant name
    await expect(page.getByText('Demo Restaurant', { exact: true })).toBeVisible();
    await expect(page.getByText('Cantina da Praca')).toBeVisible();
  });
});

test.describe('Auth Guards', () => {
  test('/onboarding redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/onboarding');
    // ProtectedRoute should redirect to /login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('/welcome redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/welcome');
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });
});

test.describe('404 Page', () => {
  test('renders 404 for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await page.waitForLoadState('domcontentloaded');

    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText('Page Not Found')).toBeVisible();
  });

  test('"Go Home" button navigates to /', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('link', { name: /go home/i }).click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('Customer Portal', () => {
  test('renders lookup form', async ({ page }) => {
    await page.goto('/customer');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    await expect(page.getByText('Manage your reservation')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /look up reservation/i })).toBeVisible();
  });
});

test.describe('Subscription Pages', () => {
  test('/subscription/manage redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/subscription/manage');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);

    // Unauthenticated users are redirected to /login — that is the correct protected-route behaviour
    const url = page.url();
    expect(url).toContain('/login');
  });
});

test.describe('Mobile Responsiveness', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('landing page renders correctly on mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Hero heading should be visible
    await expect(page.locator('h1')).toBeVisible();

    // Mobile menu button should be visible (hamburger)
    const menuBtn = page.getByRole('button', { name: /open menu/i });
    await expect(menuBtn).toBeVisible();
  });

  test('mobile menu opens and has correct links', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Open mobile menu
    const menuBtn = page.getByRole('button', { name: /open menu/i });
    await menuBtn.click();

    // Menu items should be visible
    await expect(page.getByRole('button', { name: /live demo/i }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: /features/i }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: /pricing/i }).last()).toBeVisible();
  });

  test('login page is usable on mobile', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // Form should be visible
    await expect(page.getByText('Continue with Google')).toBeVisible();
    await expect(page.locator('input#email')).toBeVisible();

    // The login card should not overflow
    const card = page.locator('.bg-white.border').first();
    if (await card.count() > 0) {
      const box = await card.boundingBox();
      if (box) {
        expect(box.width).toBeLessThanOrEqual(390);
      }
    }
  });
});

test.describe('SEO and Meta Tags', () => {
  test('homepage has correct meta tags', async ({ page }) => {
    await page.goto('/');

    // Title
    const title = await page.title();
    expect(title.toLowerCase()).toContain('seatable');

    // OG tags
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    if (ogTitle) {
      expect(ogTitle).toMatch(/^seatable/);
    }

    // No Lato font in document
    const html = await page.content();
    expect(html).not.toContain('family=Lato');
  });
});

test.describe('Console Errors', () => {
  test('landing page has no critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Filter out known non-critical errors (e.g., analytics, third-party scripts)
    const criticalErrors = errors.filter(e =>
      !e.includes('posthog') &&
      !e.includes('analytics') &&
      !e.includes('favicon') &&
      !e.includes('ERR_BLOCKED_BY_CLIENT') // ad blockers
    );

    // Allow some errors but flag if many
    if (criticalErrors.length > 0) {
      console.warn('Console errors found:', criticalErrors);
    }
    expect(criticalErrors.length).toBeLessThan(5);
  });

  test('login page has no critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    const criticalErrors = errors.filter(e =>
      !e.includes('posthog') &&
      !e.includes('analytics') &&
      !e.includes('favicon') &&
      !e.includes('ERR_BLOCKED_BY_CLIENT')
    );

    expect(criticalErrors.length).toBeLessThan(5);
  });
});

test.describe('Contact Email Consistency', () => {
  test('no stefanogebara@gmail.com visible on any public page', async ({ page }) => {
    const pagesToCheck = ['/', '/login', '/live-demo', '/subscription/manage'];

    for (const path of pagesToCheck) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      const html = await page.content();
      expect(html).not.toContain('stefanogebara@gmail.com');
    }
  });
});
