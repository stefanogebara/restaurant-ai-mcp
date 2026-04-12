/**
 * REEL: "See Your Restaurant Clearly"
 *
 * Scenario: Owner opens analytics, reviews reservation trends,
 * checks the heatmap, sees no-show predictions, and discovers
 * revenue opportunities the AI found.
 *
 * Output: reels-toolkit/videos/reel-analytics.webm (~40 seconds)
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

async function smoothScroll(page, distance, duration = 2000) {
  const steps = 40;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps);
    await wait(duration / steps);
  }
}

async function run() {
  console.log('🎬 Recording: Analytics Reel');

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
    // Quick login
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await wait(1500);
    await page.getByRole('textbox', { name: /email/i }).fill(CREDS.email);
    await page.getByRole('textbox', { name: /senha/i }).fill(CREDS.pw);
    await page.getByRole('button', { name: /entrar/i }).click();
    await page.waitForURL('**/host-dashboard/**', { timeout: 15000 });
    await wait(1500);

    // Navigate to Analytics
    await page.getByRole('link', { name: /análises|analises/i }).first().click();
    await wait(4000);

    // Show top metrics bar — hover across
    await page.mouse.move(300, 120, { steps: 20 });
    await wait(1500);
    await page.mouse.move(600, 120, { steps: 20 });
    await wait(1500);
    await page.mouse.move(900, 120, { steps: 20 });
    await wait(1500);

    // Click "30d" time range if visible
    try {
      await page.getByRole('button', { name: '30d' }).click();
      await wait(2000);
    } catch (e) {}

    // Scroll to reservation trend charts
    await smoothScroll(page, 350);
    await wait(3500);

    // Hover over chart data points
    await page.mouse.move(500, 400, { steps: 25 });
    await wait(1000);
    await page.mouse.move(650, 350, { steps: 20 });
    await wait(1500);

    // Scroll to heatmap + peak hours
    await smoothScroll(page, 400);
    await wait(3500);

    // Scroll to no-show predictions
    await smoothScroll(page, 400);
    await wait(3000);

    // Scroll to revenue opportunities
    await smoothScroll(page, 350);
    await wait(3500);

    // Click on first revenue opportunity card
    try {
      const oppCard = page.getByRole('button', { name: /rotatividade|mesas/i }).first();
      if (await oppCard.isVisible()) {
        await oppCard.click();
        await wait(3000);
      }
    } catch (e) {}

    // Scroll to see full opportunity detail
    await smoothScroll(page, 300);
    await wait(3000);

    // Final pause
    await wait(2000);

    console.log('✅ Analytics reel complete');

  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  console.log(`\n📹 Video saved to: reels-toolkit/videos/`);
}

run().catch(console.error);
