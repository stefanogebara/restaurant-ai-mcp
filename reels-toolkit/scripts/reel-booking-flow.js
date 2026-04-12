/**
 * REEL: "Watch a Real Booking Happen"
 *
 * Scenario: Customer opens the public booking page, picks a date,
 * selects party size, fills in their details naturally, and confirms.
 * Shows the entire customer experience end-to-end.
 *
 * Output: reels-toolkit/videos/reel-booking-flow.webm (~35 seconds)
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = resolve(__dirname, '../videos');
mkdirSync(VIDEO_DIR, { recursive: true });

const BASE = 'https://seatable.one';
const wait = ms => new Promise(r => setTimeout(r, ms));

async function naturalType(locator, text, baseDelay = 60) {
  await locator.click();
  await wait(400);
  for (const char of text) {
    await locator.type(char, { delay: 0 });
    await wait(baseDelay + Math.random() * 30);
  }
}

async function run() {
  console.log('🎬 Recording: Booking Flow Reel');

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
    // Open booking page directly (no login needed — it's public)
    await page.goto(`${BASE}/book/cantina-bella-vista`, { waitUntil: 'networkidle' });
    await wait(4000);

    // Let viewer see the booking page hero
    await page.mouse.move(700, 400, { steps: 15 });
    await wait(2000);

    // Select tomorrow's date
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayNum = String(tomorrow.getDate());
      await page.getByRole('button', { name: dayNum }).first().click();
      await wait(2000);
    } catch (e) {
      // Try clicking second date button
      await page.locator('button:has-text("25")').first().click();
      await wait(2000);
    }

    // Select time slot (if time picker appears after date selection)
    await wait(1500);
    try {
      // Click a time slot if it appeared
      const timeSlot = page.locator('button:has-text("20:00")').first();
      if (await timeSlot.isVisible()) {
        await timeSlot.click();
        await wait(1500);
      }
    } catch (e) {
      // Time selection might be different format
    }

    // Select party size = 4
    await page.getByRole('button', { name: '4' }).first().click();
    await wait(2000);

    // Scroll down to form
    await page.mouse.wheel(0, 200);
    await wait(1500);

    // Type name naturally
    const nameInput = page.getByRole('textbox', { name: /nome/i }).first();
    await naturalType(nameInput, 'Rafael Santos');
    await wait(1200);

    // Type phone
    const phoneInput = page.getByRole('textbox', { name: /telefone/i }).first();
    await naturalType(phoneInput, '+5511987654321', 45);
    await wait(1200);

    // Type email
    const emailInput = page.getByRole('textbox', { name: /email/i }).first();
    await naturalType(emailInput, 'rafael@gmail.com', 50);
    await wait(1200);

    // Type special request
    const specialInput = page.getByRole('textbox', { name: /especiais|pedidos|alergias/i }).first();
    await naturalType(specialInput, 'Jantar de aniversario, mesa com vista por favor', 55);
    await wait(2000);

    // Scroll to confirm button
    await page.mouse.wheel(0, 150);
    await wait(1500);

    // Hover over confirm button (don't actually click to avoid creating real reservation)
    const confirmBtn = page.getByRole('button', { name: /confirmar/i });
    await confirmBtn.hover();
    await wait(3000);

    // Final pause on the filled form
    await wait(2000);

    console.log('✅ Booking flow reel complete');

  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  console.log(`\n📹 Video saved to: reels-toolkit/videos/`);
}

run().catch(console.error);
