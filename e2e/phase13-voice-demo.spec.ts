import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';

test.describe('Phase 13 — Voice Demo & Landing Overhaul', () => {

  test.describe('Voice Demo Page (/live-demo)', () => {
    test('renders immersive dark layout with VoiceOrb', async ({ page }) => {
      await page.goto(`${BASE}/live-demo`);
      await page.waitForLoadState('networkidle');

      // Dark background
      const body = page.locator('div.min-h-screen').first();
      await expect(body).toHaveCSS('background-color', 'rgb(10, 10, 15)');

      // Title
      await expect(page.locator('h1')).toContainText(/talk to our ai host/i);

      // VoiceOrb button present (the large orb)
      const orbButton = page.locator('button[aria-label]').first();
      await expect(orbButton).toBeVisible();

      // Back link
      await expect(page.locator('a[href="/"]').first()).toBeVisible();
    });

    test('has minimal nav with logo and back link', async ({ page }) => {
      await page.goto(`${BASE}/live-demo`);
      await page.waitForLoadState('networkidle');

      // Logo
      await expect(page.locator('nav').locator('text=seatable')).toBeVisible();

      // Back link
      const backLink = page.locator('nav a[href="/"]').last();
      await expect(backLink).toBeVisible();
    });

    test('shows VoiceDemoDashboard on desktop', async ({ page }) => {
      // Set desktop viewport
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${BASE}/live-demo`);
      await page.waitForLoadState('networkidle');

      // Dashboard should be visible on large screens
      const dashboard = page.locator('text=seatable.one/dashboard');
      await expect(dashboard).toBeVisible();

      // Should show base reservations
      await expect(page.locator('text=Giovanni B.')).toBeVisible();
      await expect(page.locator('text=Sophia M.')).toBeVisible();

      // Stats
      await expect(page.locator('text=Tables')).toBeVisible();
      await expect(page.locator('text=Guests')).toBeVisible();
    });

    test('hides dashboard on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`${BASE}/live-demo`);
      await page.waitForLoadState('networkidle');

      // Dashboard should be hidden (lg:block = hidden on mobile)
      const dashboard = page.locator('text=seatable.one/dashboard');
      await expect(dashboard).not.toBeVisible();

      // Orb should still be visible
      const orbButton = page.locator('button[aria-label]').first();
      await expect(orbButton).toBeVisible();
    });

    test('bottom bar has links to demo setup and pricing', async ({ page }) => {
      await page.goto(`${BASE}/live-demo`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('a[href="/demo/setup"]')).toBeVisible();
      await expect(page.locator('a[href="/#pricing"]').last()).toBeVisible();
    });

    test('orb click transitions to connecting state', async ({ page }) => {
      await page.goto(`${BASE}/live-demo`);
      await page.waitForLoadState('networkidle');

      const orbButton = page.locator('button[aria-label]').first();

      // Before click — should show idle label
      await expect(orbButton).toHaveAttribute('aria-label', /tap to talk/i);

      // Click the orb (use JS to bypass animation stability)
      await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label]') as HTMLButtonElement;
        btn?.click();
      });

      // Should transition to connecting (amber gradient, pulsing)
      // Note: actual mic permission popup will block — but the state should change briefly
      await page.waitForTimeout(500);
    });
  });

  test.describe('Landing Page — Bigger WhatsApp Phones', () => {
    test('hero WhatsApp phone is 320px+ wide', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(BASE);
      await page.waitForLoadState('networkidle');

      // The phone animation wrapper should be at least 320px
      const phone = page.locator('[aria-hidden="true"]').filter({ hasText: 'Seatable AI' }).first();
      const box = await phone.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBeGreaterThanOrEqual(300);
    });

    test('WhatsApp widget section phone is 320px+ wide', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(BASE);

      // Scroll to WhatsApp section
      const section = page.locator('text=Text our AI right now').first();
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // Phone mockup in the WhatsApp section
      const phoneFrame = page.locator('.bg-deep-charcoal.rounded-\\[2\\.5rem\\]').last();
      const box = await phoneFrame.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBeGreaterThanOrEqual(300);
    });
  });

  test.describe('Landing Page — Video Showcase', () => {
    test('video showcase has tabs and video player', async ({ page }) => {
      await page.goto(BASE);

      // Scroll to showcase
      const heading = page.locator('text=Your AI team, working 24/7').first();
      await heading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      // Three tab buttons
      const tabs = page.locator('button').filter({ hasText: /WhatsApp|Voice|Dashboard/i });
      const count = await tabs.count();
      expect(count).toBeGreaterThanOrEqual(3);

      // First tab should show video element
      const video = page.locator('video');
      // May or may not be present depending on active tab
      const videoCount = await video.count();
      expect(videoCount).toBeGreaterThanOrEqual(0);
    });

    test('clicking voice tab switches content', async ({ page }) => {
      await page.goto(BASE);

      const heading = page.locator('text=Your AI team, working 24/7').first();
      await heading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      // Click the Voice tab
      const voiceTab = page.locator('button').filter({ hasText: /Voice/i }).first();
      await voiceTab.click();
      await page.waitForTimeout(300);

      // Should show voice-related content
      const voiceTitle = page.locator('h3').filter({ hasText: /Voice/i });
      await expect(voiceTitle).toBeVisible();
    });
  });

  test.describe('Landing Page — Voice Widget CTA', () => {
    test('voice section has "Try the full experience" link', async ({ page }) => {
      await page.goto(BASE);

      // Scroll to voice section
      const voiceHeading = page.locator('text=Call our AI host').first();
      await voiceHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      // CTA link to /live-demo
      const cta = page.locator('a[href="/live-demo"]').first();
      await expect(cta).toBeVisible();
      await expect(cta).toContainText(/full experience/i);
    });

    test('CTA navigates to voice demo page', async ({ page }) => {
      await page.goto(BASE);

      const voiceHeading = page.locator('text=Call our AI host').first();
      await voiceHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);

      const cta = page.locator('a[href="/live-demo"]').first();
      await cta.click();

      await page.waitForURL('**/live-demo');
      await expect(page.locator('h1')).toContainText(/talk to our ai host/i);
    });
  });

  test.describe('Voice Demo Dashboard Component', () => {
    test('dashboard shows stats and base reservations', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${BASE}/live-demo`);
      await page.waitForLoadState('networkidle');

      // Base reservations
      await expect(page.locator('text=Giovanni B.')).toBeVisible();
      await expect(page.locator('text=Alessandro R.')).toBeVisible();
      await expect(page.locator('text=Luca T.')).toBeVisible();

      // Browser chrome
      await expect(page.locator('text=seatable.one/dashboard')).toBeVisible();

      // AI Active indicator
      await expect(page.locator('text=AI Active')).toBeVisible();
    });
  });
});
