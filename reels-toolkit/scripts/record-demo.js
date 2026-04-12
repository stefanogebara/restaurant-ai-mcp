/**
 * Seatable — Automated Platform Demo for Screen Recording
 *
 * This script navigates through the live Seatable platform with natural
 * timing so you can screen-record it for Instagram Reels.
 *
 * SETUP:
 *   1. Install: npm install playwright
 *   2. Install browser: npx playwright install chromium
 *   3. Run: node reels-toolkit/scripts/record-demo.js
 *
 * HOW TO USE:
 *   - The script opens a visible browser window (not headless)
 *   - Start your screen recorder (Screen Studio, OBS, or Focusee)
 *   - The script will navigate through each screen with pauses
 *   - Each "scene" has a 3-5 second pause for you to capture
 *   - Record the entire run, then cut it into Reels in CapCut
 *
 * SCENES:
 *   1. Landing page hero
 *   2. Login flow
 *   3. Dashboard overview (with seeded reservations)
 *   4. Add a reservation live
 *   5. Table map
 *   6. Manager AI chat
 *   7. Voice agent settings
 *   8. WhatsApp settings
 *   9. Analytics dashboard
 *   10. Public booking page
 *   11. Booking flow (fill form + confirm)
 *
 * TIP: Run at 1920x1080 for 16:9. For 9:16 vertical Reels,
 *      crop in CapCut or set browser to 1080x1920.
 */

import { chromium } from 'playwright';

const BASE_URL = 'https://seatable.one';
const CREDENTIALS = {
  email: 'cantina.bellavista@seatable.io',
  password: 'Sandbox2026!',
};

// Pause durations (ms) — adjust for your recording pace
const PAUSE = {
  SHORT: 2000,    // Quick glance
  MEDIUM: 4000,   // Read a section
  LONG: 6000,     // Absorb full page
  EXTRA: 8000,    // Hero moments (dashboard, analytics)
};

async function wait(ms) {
  await new Promise(r => setTimeout(r, ms));
}

async function smoothScroll(page, distance, duration = 1500) {
  const steps = 30;
  const stepDistance = distance / steps;
  const stepDelay = duration / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, stepDistance);
    await wait(stepDelay);
  }
}

async function run() {
  console.log('\n🎬 SEATABLE DEMO RECORDING SCRIPT');
  console.log('================================');
  console.log('Start your screen recorder now!');
  console.log('The browser will open in 3 seconds...\n');
  await wait(3000);

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'pt-BR',
  });

  const page = await context.newPage();

  // ========================================
  // SCENE 1: Landing Page
  // ========================================
  console.log('🎬 Scene 1: Landing Page');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await wait(PAUSE.LONG);

  // Scroll through landing page features
  await smoothScroll(page, 600);
  await wait(PAUSE.MEDIUM);
  await smoothScroll(page, 600);
  await wait(PAUSE.MEDIUM);
  await smoothScroll(page, 600);
  await wait(PAUSE.MEDIUM);

  // ========================================
  // SCENE 2: Login
  // ========================================
  console.log('🎬 Scene 2: Login');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await wait(PAUSE.MEDIUM);

  // Type email slowly (natural feel)
  const emailInput = page.getByRole('textbox', { name: /email/i });
  await emailInput.click();
  await wait(500);
  await emailInput.type(CREDENTIALS.email, { delay: 60 });
  await wait(800);

  // Type password
  const passwordInput = page.getByRole('textbox', { name: /senha|password/i });
  await passwordInput.click();
  await wait(300);
  await passwordInput.type(CREDENTIALS.password, { delay: 40 });
  await wait(1000);

  // Click login
  await page.getByRole('button', { name: /entrar|login/i }).click();
  await wait(PAUSE.LONG);

  // ========================================
  // SCENE 3: Dashboard Overview
  // ========================================
  console.log('🎬 Scene 3: Dashboard');
  await page.waitForURL('**/host-dashboard/**', { timeout: 15000 });
  await wait(PAUSE.EXTRA);

  // Scroll down to show table map
  await smoothScroll(page, 500);
  await wait(PAUSE.MEDIUM);

  // Scroll to show waitlist and active parties
  await smoothScroll(page, 400);
  await wait(PAUSE.MEDIUM);

  // Scroll to staffing forecast and revenue
  await smoothScroll(page, 500);
  await wait(PAUSE.MEDIUM);

  // Scroll to activity feed
  await smoothScroll(page, 400);
  await wait(PAUSE.MEDIUM);

  // Back to top
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await wait(PAUSE.SHORT);

  // ========================================
  // SCENE 4: Add Reservation (if button exists)
  // ========================================
  console.log('🎬 Scene 4: Add Reservation');
  try {
    const addBtn = page.getByRole('button', { name: /adicionar|sem reserva/i }).first();
    await addBtn.click();
    await wait(PAUSE.LONG);
    // Close modal (press Escape)
    await page.keyboard.press('Escape');
    await wait(PAUSE.SHORT);
  } catch (e) {
    console.log('  (Add reservation button not found, skipping)');
  }

  // ========================================
  // SCENE 5: Floor Plan / Tables
  // ========================================
  console.log('🎬 Scene 5: Floor Plan');
  await page.getByRole('link', { name: /mesas/i }).click();
  await wait(PAUSE.LONG);

  // ========================================
  // SCENE 6: Manager AI
  // ========================================
  console.log('🎬 Scene 6: Manager AI');
  await page.getByRole('link', { name: /ia do gerente/i }).click();
  await wait(PAUSE.MEDIUM);

  // Type a question
  try {
    const chatInput = page.getByRole('textbox', { name: /pergunte|assistente/i });
    await chatInput.click();
    await wait(500);
    await chatInput.type('Como está o restaurante hoje?', { delay: 70 });
    await wait(PAUSE.SHORT);

    // Send message
    const sendBtn = page.getByRole('button', { name: /enviar/i });
    await sendBtn.click();
    await wait(PAUSE.EXTRA); // Wait for AI response
  } catch (e) {
    console.log('  (Chat interaction failed, showing page only)');
    await wait(PAUSE.LONG);
  }

  // ========================================
  // SCENE 7: Voice Agent Settings
  // ========================================
  console.log('🎬 Scene 7: Voice Agent Settings');
  await page.getByRole('link', { name: /agente de voz/i }).click();
  await wait(PAUSE.LONG);

  // Scroll to show voice settings
  await smoothScroll(page, 400);
  await wait(PAUSE.MEDIUM);

  // Scroll to languages
  await smoothScroll(page, 400);
  await wait(PAUSE.MEDIUM);

  // Scroll to persona and strategy
  await smoothScroll(page, 500);
  await wait(PAUSE.MEDIUM);

  // ========================================
  // SCENE 8: WhatsApp Settings
  // ========================================
  console.log('🎬 Scene 8: WhatsApp');
  await page.getByRole('link', { name: /whatsapp/i }).click();
  await wait(PAUSE.LONG);

  // ========================================
  // SCENE 9: Analytics
  // ========================================
  console.log('🎬 Scene 9: Analytics');
  await page.getByRole('link', { name: /analises|análises/i }).first().click();
  await wait(PAUSE.LONG);

  // Scroll through analytics
  await smoothScroll(page, 500);
  await wait(PAUSE.MEDIUM);

  // Revenue opportunities
  await smoothScroll(page, 500);
  await wait(PAUSE.MEDIUM);

  // No-show predictions
  await smoothScroll(page, 400);
  await wait(PAUSE.MEDIUM);

  // ========================================
  // SCENE 10: Public Booking Page
  // ========================================
  console.log('🎬 Scene 10: Booking Page');
  await page.goto(`${BASE_URL}/book/cantina-bella-vista`, { waitUntil: 'networkidle' });
  await wait(PAUSE.LONG);

  // Select a date (tomorrow)
  try {
    const dateBtn = page.getByRole('button', { name: '25' }).first();
    await dateBtn.click();
    await wait(PAUSE.SHORT);
  } catch (e) {
    console.log('  (Date selection skipped)');
  }

  // Select party size
  try {
    await page.getByRole('button', { name: '4' }).first().click();
    await wait(PAUSE.SHORT);
  } catch (e) {
    console.log('  (Party size selection skipped)');
  }

  // Fill in guest details
  try {
    const nameInput = page.getByRole('textbox', { name: /nome/i }).first();
    await nameInput.click();
    await nameInput.type('Rafael Santos', { delay: 60 });
    await wait(800);

    const phoneInput = page.getByRole('textbox', { name: /telefone/i }).first();
    await phoneInput.click();
    await phoneInput.type('+5511987654321', { delay: 50 });
    await wait(800);

    const emailField = page.getByRole('textbox', { name: /email/i }).first();
    await emailField.click();
    await emailField.type('rafael@example.com', { delay: 50 });
    await wait(PAUSE.MEDIUM);
  } catch (e) {
    console.log('  (Form fill skipped)');
  }

  // Show the filled form
  await wait(PAUSE.LONG);

  // ========================================
  // SCENE 11: Back to Landing (final shot)
  // ========================================
  console.log('🎬 Scene 11: Final Landing Page');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await wait(PAUSE.EXTRA);

  // ========================================
  // DONE
  // ========================================
  console.log('\n✅ Demo recording complete!');
  console.log('Stop your screen recorder now.');
  console.log('Import the recording into CapCut and cut into Reels.\n');
  console.log('Suggested cuts:');
  console.log('  Reel A: Landing → Login → Dashboard (30s)');
  console.log('  Reel B: Dashboard scroll → Table Map → Add Reservation (25s)');
  console.log('  Reel C: Manager AI conversation (20s)');
  console.log('  Reel D: Voice Settings → Languages → Persona (25s)');
  console.log('  Reel E: Analytics → Revenue → No-Show Predictions (30s)');
  console.log('  Reel F: Booking Page → Fill Form → Confirm (25s)');

  // Keep browser open for 10 seconds so user can stop recording
  await wait(10000);
  await browser.close();
}

run().catch(console.error);
