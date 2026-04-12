/**
 * REEL: "Full Platform Walkthrough" (The Hero Reel)
 *
 * Scenario: Complete product demo — starts at landing page,
 * logs in, shows dashboard with live data, adds a reservation,
 * checks AI manager, shows voice settings, analytics, and
 * ends on the booking page. This is the main "product tour" video.
 *
 * Output: reels-toolkit/videos/reel-full-walkthrough.webm (~90 seconds)
 * Cut this into 2-3 shorter Reels in CapCut.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = resolve(__dirname, '../videos');
mkdirSync(VIDEO_DIR, { recursive: true });

const BASE = 'https://seatable.one';
const CREDS = { email: 'cantina.bellavista@seatable.io', pw: 'Sandbox2026!' };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function smoothScroll(page, distance, duration = 1800) {
  const steps = 40;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps);
    await wait(duration / steps);
  }
}

async function run() {
  console.log('🎬 Recording: Full Platform Walkthrough');
  console.log('   This produces ~90s of footage.');
  console.log('   Cut into 2-3 Reels in CapCut.\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1920,1080'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'pt-BR',
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  try {
    // ============ LANDING PAGE ============
    console.log('  📍 Landing page');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await wait(4000);

    // Scroll through landing page highlights
    await smoothScroll(page, 500);
    await wait(2500);
    await smoothScroll(page, 500);
    await wait(2500);

    // ============ LOGIN ============
    console.log('  📍 Login');
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[placeholder*="restaurant" i], input[placeholder*="email" i]', { timeout: 15000 });
    await wait(3000);

    // Type credentials naturally using CSS selectors (SPA role detection is slow)
    const emailField = page.locator('input[placeholder*="restaurant" i], input[placeholder*="email" i]').first();
    await emailField.click();
    await wait(300);
    for (const char of CREDS.email) {
      await emailField.type(char, { delay: 0 });
      await wait(40 + Math.random() * 25);
    }
    await wait(600);

    const pwField = page.locator('input[placeholder*="senha" i], input[placeholder*="password" i], input[type="password"]').first();
    await pwField.click();
    await wait(200);
    await pwField.fill(CREDS.pw);
    await wait(800);

    await page.locator('button:has-text("Entrar"), button:has-text("Login")').first().click();
    await page.waitForURL('**/host-dashboard/**', { timeout: 15000 });
    await wait(4000);

    // ============ DASHBOARD ============
    console.log('  📍 Dashboard');

    // Absorb the overview
    await wait(3000);

    // Scroll through dashboard sections
    await smoothScroll(page, 400);
    await wait(2500);

    // Table map
    await smoothScroll(page, 350);
    await wait(3000);

    // Hover over tables
    await page.mouse.move(350, 700, { steps: 20 });
    await wait(1000);
    await page.mouse.move(550, 700, { steps: 15 });
    await wait(1500);

    // Scroll to staffing + revenue
    await smoothScroll(page, 500);
    await wait(2500);

    // Activity feed
    await smoothScroll(page, 400);
    await wait(2000);

    // Back to top
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await wait(2000);

    // ============ ADD RESERVATION ============
    console.log('  📍 Add reservation');
    try {
      await page.getByRole('button', { name: /sem reserva|\+ adicionar/i }).first().click();
      await wait(3000);
      // Close modal — try Escape, then click backdrop, then force-close
      await page.keyboard.press('Escape');
      await wait(500);
      // If modal still open, click the backdrop overlay
      const backdrop = page.locator('.fixed.inset-0.bg-black');
      if (await backdrop.isVisible({ timeout: 1000 }).catch(() => false)) {
        await backdrop.click({ position: { x: 10, y: 10 }, force: true });
        await wait(500);
      }
      // If STILL open, navigate away
      const stillOpen = page.locator('.fixed.inset-0');
      if (await stillOpen.isVisible({ timeout: 500 }).catch(() => false)) {
        await page.goto(`${BASE}/host-dashboard/simple`, { waitUntil: 'networkidle' });
        await wait(2000);
      }
    } catch (e) {
      console.log('    (skipped — button not found)');
    }
    await wait(1000);

    // ============ MANAGER AI ============
    console.log('  📍 Manager AI');
    await page.goto(`${BASE}/host-dashboard/manager-ai`, { waitUntil: 'networkidle' });
    await wait(3000);

    // Type a question
    try {
      await page.waitForSelector('input[placeholder*="Pergunte" i], input[placeholder*="assistente" i], textarea', { timeout: 10000 });
      await wait(1500);
      const chatInput = page.locator('input[placeholder*="Pergunte" i], input[placeholder*="assistente" i]').first();
      await chatInput.click();
      await wait(500);
      const q = 'Como posso melhorar a taxa de ocupacao?';
      for (const char of q) {
        await chatInput.type(char, { delay: 0 });
        await wait(50 + Math.random() * 30);
      }
      await wait(1000);
      await page.locator('button[aria-label*="Enviar" i], button:has(> img[alt*="send" i])').first().click({ force: true });
      await wait(12000); // Wait for AI response
      await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
      await wait(4000);
    } catch (e) {
      console.log('    (chat skipped:', e.message.slice(0, 60), ')');
      await wait(3000);
    }

    // ============ VOICE SETTINGS ============
    console.log('  📍 Voice settings');
    await page.goto(`${BASE}/host-dashboard/voice-settings`, { waitUntil: 'networkidle' });
    await wait(3500);

    // Scroll through voice config
    await smoothScroll(page, 300);
    await wait(2500);

    // Languages
    await smoothScroll(page, 350);
    await wait(2500);

    // Persona + WhatsApp status
    await smoothScroll(page, 400);
    await wait(3000);

    // ============ ANALYTICS ============
    console.log('  📍 Analytics');
    await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' });
    await wait(4000);

    await smoothScroll(page, 400);
    await wait(3000);

    // Revenue opportunities
    await smoothScroll(page, 500);
    await wait(3000);

    // ============ BOOKING PAGE ============
    console.log('  📍 Booking page');
    await page.goto(`${BASE}/book/cantina-bella-vista`, { waitUntil: 'networkidle' });
    await wait(4000);

    // Fill booking form naturally
    try {
      await page.getByRole('button', { name: '4' }).first().click();
      await wait(1500);

      const nameIn = page.getByRole('textbox', { name: /nome/i }).first();
      await nameIn.click();
      await wait(300);
      for (const char of 'Rafael Santos') {
        await nameIn.type(char, { delay: 0 });
        await wait(60);
      }
      await wait(2000);
    } catch (e) {}

    // Final hero shot on booking page
    await wait(4000);

    // ============ BACK TO LANDING ============
    console.log('  📍 Final landing shot');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await wait(5000);

    console.log('\n✅ Full walkthrough complete!');

  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  console.log(`\n📹 Video saved to: reels-toolkit/videos/`);
  console.log('\nCut into Reels:');
  console.log('  Reel 1 (30s): Landing → Login → Dashboard overview');
  console.log('  Reel 2 (30s): Manager AI chat → Voice Settings → Languages');
  console.log('  Reel 3 (30s): Analytics → Booking page → Form fill');
}

run().catch(console.error);
