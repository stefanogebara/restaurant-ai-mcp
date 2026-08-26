/**
 * REEL: "Your Restaurant's Command Center"
 *
 * Scenario: Restaurant owner opens dashboard in the morning,
 * sees today's reservations, checks the table map, reviews
 * staffing forecast, then asks the AI manager a question.
 *
 * Output: reels-toolkit/videos/reel-dashboard-tour.webm (~45 seconds)
 *
 * Usage:
 *   node reels-toolkit/scripts/seed-demo-data.js   (seed data first!)
 *   node reels-toolkit/scripts/reel-dashboard-tour.js
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = resolve(__dirname, '../videos');
mkdirSync(VIDEO_DIR, { recursive: true });

const BASE = 'https://seatable.one';
const CREDS = { email: process.env.SANDBOX_EMAIL, pw: process.env.SANDBOX_PASSWORD };
if (!CREDS.email || !CREDS.pw) {
  throw new Error('Defina SANDBOX_EMAIL e SANDBOX_PASSWORD no ambiente. As credenciais sairam do codigo em ago/2026 — ver tasks/lessons.md.');
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function smoothScroll(page, distance, duration = 1800) {
  const steps = 40;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps);
    await wait(duration / steps);
  }
}

async function naturalType(page, selector, text, delay = 65) {
  const el = page.locator(selector).first();
  await el.click();
  await wait(300);
  for (const char of text) {
    await el.type(char, { delay: 0 });
    await wait(delay + Math.random() * 30);
  }
}

async function run() {
  console.log('🎬 Recording: Dashboard Tour Reel');

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
    // === LOGIN (quick, not the focus) ===
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await wait(1500);
    await page.getByRole('textbox', { name: /email/i }).fill(CREDS.email);
    await page.getByRole('textbox', { name: /senha/i }).fill(CREDS.pw);
    await wait(500);
    await page.getByRole('button', { name: /entrar/i }).click();
    await page.waitForURL('**/host-dashboard/**', { timeout: 15000 });
    await wait(3000);

    // === DASHBOARD OVERVIEW — Hero moment ===
    // Let the viewer absorb the full dashboard
    await wait(4000);

    // Hover over stats bar naturally
    await page.mouse.move(400, 130, { steps: 20 });
    await wait(1500);
    await page.mouse.move(700, 130, { steps: 20 });
    await wait(1500);

    // Scroll down to reservations list
    await smoothScroll(page, 350);
    await wait(3000);

    // Scroll to table map
    await smoothScroll(page, 350);
    await wait(3500);

    // Hover over a table in the map
    await page.mouse.move(400, 700, { steps: 25 });
    await wait(1000);
    await page.mouse.move(500, 700, { steps: 15 });
    await wait(2000);

    // Scroll to waitlist and active parties
    await smoothScroll(page, 300);
    await wait(2500);

    // Scroll to staffing forecast
    await smoothScroll(page, 400);
    await wait(3000);

    // Scroll to revenue forecast
    await smoothScroll(page, 300);
    await wait(3000);

    // Scroll to activity feed
    await smoothScroll(page, 300);
    await wait(2500);

    // Back to top smoothly
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await wait(3000);

    console.log('✅ Dashboard tour complete');

  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  console.log(`\n📹 Video saved to: reels-toolkit/videos/`);
  console.log('Import into CapCut, add voiceover + music, crop to 9:16');
}

run().catch(console.error);
