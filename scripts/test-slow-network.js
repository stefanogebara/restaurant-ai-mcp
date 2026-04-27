/**
 * §7 Slow 3G dashboard smoke.
 * Throttle network → load /host-dashboard/simple → expect skeleton then content,
 * never a white-screen / infinite spinner / visible error.
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const EMAIL = process.env.SMOKE_EMAIL || 'cantina.bellavista@seatable.io';
const PASSWORD = process.env.SMOKE_PASSWORD || 'Sandbox2026!';
const BASE_URL = process.env.PW_BASE_URL || 'https://seatable.one';
const HEADLESS = process.env.CI === 'true' || process.env.HEADLESS === 'true';

(async () => {
  const profileDir = path.join(__dirname, `../.tmp/slow-net-${Date.now()}`);
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  const launchOpts = { headless: HEADLESS, viewport: { width: 1400, height: 900 }, timeout: 60_000 };
  // Use Chrome channel only when available locally (Windows/macOS) — CI uses bundled chromium.
  if (!HEADLESS) launchOpts.channel = 'chrome';
  const ctx = await chromium.launchPersistentContext(profileDir, launchOpts);
  const page = ctx.pages()[0] || await ctx.newPage();

  const errs = [];
  page.on('pageerror', e => errs.push(`pageerror: ${e.message.slice(0, 120)}`));
  page.on('console', m => { if (m.type() === 'error') errs.push(`console: ${m.text().slice(0, 120)}`); });

  const report = [];
  const log = (pass, msg, detail) => {
    const icon = pass ? '✓' : '✗';
    console.log(`${icon} ${msg}${detail ? ' — ' + detail : ''}`);
    report.push({ pass, msg });
  };

  try {
    // Login at full speed first
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"]').first().fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button[type="submit"], button').filter({ hasText: /entrar/i }).first().click();
    await page.waitForTimeout(4000);
    log(/host-dashboard/.test(page.url()), '1. Logged in at full speed');

    // Now apply Slow 3G throttling and reload
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,                // ~400ms RTT
      downloadThroughput: 50 * 1024,  // 50 KB/s
      uploadThroughput: 50 * 1024,
    });
    log(true, '2. Slow 3G throttling enabled (50 KB/s, 400ms RTT)');

    const t0 = Date.now();
    const navPromise = page.goto(`${BASE_URL}/host-dashboard/simple`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    // Within 1s, expect skeleton loaders to be visible (not blank)
    await page.waitForTimeout(1500);
    const earlyHasSkeleton = await page.locator('[class*="animate-pulse"], [role="status"]').first().isVisible().catch(() => false);
    log(earlyHasSkeleton, '3. Skeleton loaders visible within 1.5s');
    await navPromise.catch(() => {});

    // Wait for content to actually render — look for a known dashboard string
    const contentLoaded = await page.waitForSelector('text=/MESAS OCUPADAS|RESERVAS|MAPA DE MESAS/i', { timeout: 45_000 }).then(() => true).catch(() => false);
    const elapsed = Date.now() - t0;
    log(contentLoaded, `4. Real content rendered (no white screen / infinite spinner)`, `${elapsed}ms`);

    // No visible error banner
    const errBanner = await page.locator('text=/Erro|Failed|something went wrong/i').first().isVisible().catch(() => false);
    log(!errBanner, '5. No visible error banner');

    log(errs.length === 0 || errs.every(e => /sentry|favicon|429/i.test(e)), '6. No critical console errors',
        errs.length === 0 ? 'clean' : `${errs.length} non-critical (sentry/favicon/429 ok)`);
    if (errs.length) errs.slice(0, 3).forEach(e => console.log('    ', e));
  } catch (e) {
    console.log('FAIL:', e.message.slice(0, 200));
  }

  const fails = report.filter(r => !r.pass).length;
  console.log(`\n${fails === 0 ? '✓' : '✗'}  ${report.length - fails}/${report.length} checks passed, ${fails} failed`);
  await ctx.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
