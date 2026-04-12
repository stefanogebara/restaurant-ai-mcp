/**
 * REEL: "Your AI Voice Agent — Sofia"
 *
 * Scenario: Owner opens voice settings, shows the ElevenLabs config,
 * previews the voice, scrolls through language support, shows the
 * agent persona (Sofia), and reveals the WhatsApp connection status.
 *
 * Output: reels-toolkit/videos/reel-voice-agent.webm (~40 seconds)
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
  console.log('🎬 Recording: Voice Agent Reel');

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

    // Navigate to Voice Settings
    await page.getByRole('link', { name: /agente de voz/i }).click();
    await wait(3500);

    // Show ElevenLabs engine selection - hover over it
    await page.mouse.move(400, 200, { steps: 20 });
    await wait(2000);

    // Scroll to voice selection
    await smoothScroll(page, 250);
    await wait(2500);

    // Try clicking preview voice button
    try {
      await page.getByRole('button', { name: /pré-visualizar/i }).first().click();
      await wait(4000); // Let voice preview play
    } catch (e) {
      await wait(2000);
    }

    // Scroll to voice tuning sliders
    await smoothScroll(page, 250);
    await wait(3000);

    // Hover over stability slider
    await page.mouse.move(460, 540, { steps: 20 });
    await wait(1500);

    // Scroll to language flags
    await smoothScroll(page, 300);
    await wait(3500);

    // Scroll to Agent Persona (Sofia name + greeting)
    await smoothScroll(page, 350);
    await wait(3000);

    // Scroll to WhatsApp status (Connected, GREEN)
    await smoothScroll(page, 300);
    await wait(3000);

    // Scroll to AI Strategy document
    await smoothScroll(page, 350);
    await wait(3500);

    // Scroll to metrics panel
    await smoothScroll(page, 350);
    await wait(3000);

    console.log('✅ Voice agent reel complete');

  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  console.log(`\n📹 Video saved to: reels-toolkit/videos/`);
}

run().catch(console.error);
