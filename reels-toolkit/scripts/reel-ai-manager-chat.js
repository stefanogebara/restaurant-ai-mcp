/**
 * REEL: "Ask Your AI Manager Anything"
 *
 * Scenario: Owner navigates to Manager AI, types a real question,
 * AI responds with restaurant intelligence. Shows the AI thinking
 * and delivering a detailed answer.
 *
 * Output: reels-toolkit/videos/reel-ai-manager-chat.webm (~35 seconds)
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

async function run() {
  console.log('🎬 Recording: AI Manager Chat Reel');

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
    await wait(2000);

    // Navigate to Manager AI
    await page.getByRole('link', { name: /ia do gerente/i }).click();
    await wait(3000);

    // Scroll to show existing conversation context
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await wait(2000);

    // Click on the chat input
    const chatInput = page.getByRole('textbox', { name: /pergunte|assistente/i });
    await chatInput.click();
    await wait(800);

    // Type question naturally — character by character
    const question = 'Quais sao as mesas mais populares e qual o horario de pico?';
    for (const char of question) {
      await chatInput.type(char, { delay: 0 });
      await wait(55 + Math.random() * 35);
    }
    await wait(1500);

    // Send the message
    await page.getByRole('button', { name: /enviar/i }).click();
    await wait(1000);

    // Wait for AI response to stream in
    // The AI takes 3-8 seconds to respond
    await wait(12000);

    // Scroll down to see full response
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
    await wait(4000);

    // Let viewer read the response
    await wait(3000);

    console.log('✅ AI Manager chat complete');

  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  console.log(`\n📹 Video saved to: reels-toolkit/videos/`);
}

run().catch(console.error);
