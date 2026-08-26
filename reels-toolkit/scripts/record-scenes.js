/**
 * Record individual scene clips for the Reel.
 * Each scene is a focused, tight product recording.
 * Output: reels-toolkit/scenes/*.webm
 */

import { chromium } from 'playwright';
import { mkdirSync, renameSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENES_DIR = resolve(__dirname, '../scenes');
mkdirSync(SCENES_DIR, { recursive: true });

const BASE = 'https://seatable.one';
const CREDS = { email: process.env.SANDBOX_EMAIL, pw: process.env.SANDBOX_PASSWORD };
if (!CREDS.email || !CREDS.pw) {
  throw new Error('Defina SANDBOX_EMAIL e SANDBOX_PASSWORD no ambiente. As credenciais sairam do codigo em ago/2026 — ver tasks/lessons.md.');
}
const wait = ms => new Promise(r => setTimeout(r, ms));

async function login(page) {
  // Get a fresh auth token via Supabase API
  const ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!ANON_KEY) throw new Error('SUPABASE_ANON_KEY environment variable is required');

  const authRes = await fetch('https://ckforlwdhewexyqljsaf.supabase.co/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
    body: JSON.stringify({ email: CREDS.email, password: CREDS.pw }),
  });
  const authData = await authRes.json();
  if (!authData.access_token) throw new Error('Auth failed: ' + JSON.stringify(authData).slice(0, 100));

  // Navigate to the app first to set the origin
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await wait(1000);

  // Inject the Supabase session into localStorage
  await page.evaluate((session) => {
    const storageKey = 'sb-ckforlwdhewexyqljsaf-auth-token';
    localStorage.setItem(storageKey, JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      token_type: 'bearer',
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      user: session.user,
    }));
  }, authData);

  // Now navigate to dashboard — should skip login
  await page.goto(`${BASE}/host-dashboard/simple`, { waitUntil: 'networkidle' });
  await wait(4000); // Let dashboard fully load with data
}

async function recordScene(name, recordFn) {
  console.log(`\n🎬 Recording scene: ${name}`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1920,1080'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'pt-BR',
    recordVideo: { dir: SCENES_DIR, size: { width: 1920, height: 1080 } },
  });

  const page = await context.newPage();

  try {
    await login(page);
    await recordFn(page);
  } catch (e) {
    console.error(`  Error: ${e.message.slice(0, 100)}`);
  } finally {
    const videoPath = await page.video().path();
    await page.close();
    await context.close();
    await browser.close();

    // Rename the random-named file to our scene name
    try {
      const newPath = resolve(SCENES_DIR, `${name}.webm`);
      renameSync(videoPath, newPath);
      console.log(`  ✅ Saved: scenes/${name}.webm`);
    } catch (e) {
      console.log(`  ⚠️ File saved but rename failed — check scenes/ folder`);
    }
  }
}

async function smoothScroll(page, distance, duration = 2000) {
  const steps = 40;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps);
    await wait(duration / steps);
  }
}

// ============================================================
// SCENE RECORDINGS
// ============================================================

async function main() {
  console.log('🎬 Recording Seatable Demo Scenes\n');
  console.log('   Each scene is a focused product recording.');
  console.log('   These will be composed into the final Reel.\n');

  // SCENE A: Dashboard overview — stats, reservations, table map (8s)
  await recordScene('scene-a-dashboard', async (page) => {
    // Already on dashboard after login
    await wait(2000);

    // Slow hover across stats bar
    await page.mouse.move(350, 130, { steps: 30 });
    await wait(1000);
    await page.mouse.move(750, 130, { steps: 30 });
    await wait(1500);

    // Scroll to reservations list
    await smoothScroll(page, 300, 1500);
    await wait(2000);

    // Scroll to table map
    await smoothScroll(page, 300, 1500);
    await wait(2500);

    // Hover over tables
    await page.mouse.move(400, 650, { steps: 20 });
    await wait(800);
    await page.mouse.move(550, 650, { steps: 15 });
    await wait(1500);
  });

  // SCENE B: Voice settings — ElevenLabs, sliders, languages (6s)
  await recordScene('scene-b-voice', async (page) => {
    await page.goto(`${BASE}/host-dashboard/voice-settings`, { waitUntil: 'networkidle' });
    await wait(3000);

    // Show ElevenLabs engine
    await wait(2000);

    // Scroll to voice sliders
    await smoothScroll(page, 300, 1500);
    await wait(2000);

    // Scroll to languages
    await smoothScroll(page, 300, 1500);
    await wait(2000);

    // Scroll to agent persona (Sofia)
    await smoothScroll(page, 350, 1500);
    await wait(2000);
  });

  // SCENE C: Analytics — charts, heatmap, revenue (6s)
  await recordScene('scene-c-analytics', async (page) => {
    await page.goto(`${BASE}/analytics`, { waitUntil: 'networkidle' });
    await wait(4000);

    // Hover over stats
    await page.mouse.move(400, 120, { steps: 20 });
    await wait(1500);

    // Scroll to charts
    await smoothScroll(page, 350, 1500);
    await wait(2500);

    // Scroll to heatmap
    await smoothScroll(page, 350, 1500);
    await wait(2500);

    // Scroll to revenue opportunities
    await smoothScroll(page, 400, 1500);
    await wait(2500);
  });

  // SCENE D: Booking page — customer view (6s)
  await recordScene('scene-d-booking', async (page) => {
    await page.goto(`${BASE}/book/cantina-bella-vista`, { waitUntil: 'networkidle' });
    await wait(3000);

    // Select party size
    try {
      await page.getByRole('button', { name: '4' }).first().click();
      await wait(1500);
    } catch (e) {}

    // Type name naturally
    try {
      const nameIn = page.locator('input[placeholder*="nome" i]').first();
      await nameIn.click();
      await wait(300);
      for (const c of 'Rafael Santos') {
        await nameIn.type(c, { delay: 0 });
        await wait(55);
      }
      await wait(1000);

      const phoneIn = page.locator('input[placeholder*="55" i], input[placeholder*="telefone" i]').first();
      await phoneIn.click();
      await wait(200);
      for (const c of '+5511987654321') {
        await phoneIn.type(c, { delay: 0 });
        await wait(40);
      }
      await wait(2000);
    } catch (e) {
      await wait(3000);
    }
  });

  // SCENE E: Landing page hero (4s)
  await recordScene('scene-e-landing', async (page) => {
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await wait(3000);
    await smoothScroll(page, 400, 2000);
    await wait(2000);
    await smoothScroll(page, 400, 2000);
    await wait(2000);
  });

  console.log('\n\n✅ All scenes recorded!');
  console.log('   Check reels-toolkit/scenes/ for the .webm files');
  console.log('   Next: compose into final Reel with voiceover\n');
}

main().catch(console.error);
