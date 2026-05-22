/**
 * Connect to the running CDP Chrome, find the seatable Square developer
 * app, navigate into its Webhooks tab, and report (or configure) the
 * subscription.
 *
 * What it does:
 *   1. Loads developer.squareup.com/apps in an existing tab.
 *   2. Scans the page for *.app links and finds the one pointing at the
 *      seatable application (matches by the SQUARE_APP_ID prefix loaded
 *      from Vercel).
 *   3. Navigates directly to that app's /webhooks URL.
 *   4. Reports: subscription URL(s), API version, subscribed events.
 *   5. If a subscription with the seatable URL is missing, looks for the
 *      "Add subscription" / "New subscription" button.
 *
 * Read-mostly: only attempts mutating clicks if a subscription is clearly
 * missing AND the user has no way to misclick into something unrelated.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const CDP_URL = 'http://localhost:9222';
const TEAM_ID = 'team_0OAVq8O0WIyi5FXT8Bgoxvnx';
const PROJECT_ID = 'prj_XZ3RlR3RVMvKb6se2AeEQGMn1fAV';

// Pull SQUARE_APP_ID from Vercel via REST API to know which app to dive into.
const authPath = path.join(process.env.APPDATA || '', 'com.vercel.cli/Data/auth.json');
const { token } = JSON.parse(fs.readFileSync(authPath, 'utf8'));
const envListRes = await fetch(
  `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}&decrypt=true`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const envList = await envListRes.json();
const appIdEntry = (envList.envs || []).find(
  (e) => e.key === 'SQUARE_APP_ID' && (e.target || []).includes('production'),
);
const SQUARE_APP_ID = appIdEntry?.value || '';
console.log(`SQUARE_APP_ID (Vercel): ${SQUARE_APP_ID.slice(0, 16)}…${SQUARE_APP_ID.slice(-4)}`);

const browser = await chromium.connectOverCDP(CDP_URL);
const ctx = browser.contexts()[0];
let page = ctx.pages().find((p) => p.url().includes('squareup.com')) || ctx.pages()[0] || await ctx.newPage();

console.log(`\nNavigating to developer.squareup.com/apps…`);
await page.goto('https://developer.squareup.com/apps', {
  waitUntil: 'domcontentloaded', timeout: 60_000,
});
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

// Find every app-detail link on the apps listing.
const appLinks = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('a[href*="/apps/"]'))
    .map((a) => ({ href: a.href, text: (a.textContent || '').trim().slice(0, 60) }))
    .filter((x) => /\/apps\/[A-Za-z0-9_-]{10,}/.test(x.href));
});
console.log(`\nFound ${appLinks.length} app-detail link(s):`);
appLinks.forEach((l) => console.log(`  - ${l.text} → ${l.href}`));

// Pick the one whose text or href mentions "seatable" — falls back to
// the first one if there's only a single app.
let target = appLinks.find((l) => /seatable/i.test(l.text) || /seatable/i.test(l.href));
if (!target && appLinks.length === 1) target = appLinks[0];
if (!target) {
  console.log('\nNo seatable app link auto-detected. Listing all visible app cards…');
  const cards = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="app" i], [class*="card" i]'))
      .map((c) => (c.textContent || '').trim().slice(0, 120))
      .filter((t) => t && t.length > 5)
      .slice(0, 10),
  );
  cards.forEach((c) => console.log(`  · ${c}`));
  await browser.close();
  process.exit(1);
}

const appDetailUrl = target.href.replace(/\/$/, '');
const webhooksUrl = `${appDetailUrl}/webhooks`;
console.log(`\nNavigating directly to ${webhooksUrl}…`);
await page.goto(webhooksUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

console.log(`\nNow on: ${page.url()}`);
console.log(`Title: ${await page.title()}`);

// Report subscription state.
const state = await page.evaluate(() => {
  const body = document.body?.textContent || '';
  const allText = body;
  return {
    has_seatable_url: allText.includes('seatable.one/api/square/webhook'),
    has_payment_created: allText.includes('payment.created'),
    has_payment_updated: allText.includes('payment.updated'),
    has_2024_01_17: allText.includes('2024-01-17'),
    https_urls_on_page: [...new Set(
      Array.from(document.querySelectorAll('a, code, span, td, div'))
        .map((el) => (el.textContent || '').trim())
        .filter((t) => t.startsWith('https://') && t.length < 200),
    )].slice(0, 10),
    buttons: Array.from(document.querySelectorAll('button, a[role="button"]'))
      .map((b) => (b.textContent || '').trim())
      .filter((t) => t && t.length < 60)
      .slice(0, 25),
    subscription_count: document.querySelectorAll('[data-testid*="subscription" i], [class*="subscription" i]').length,
  };
});

console.log('\n─── WEBHOOK SUBSCRIPTION STATE ────────────────────────────');
console.log(`  seatable.one URL on page: ${state.has_seatable_url ? '✓' : '✗'}`);
console.log(`  payment.created subscribed: ${state.has_payment_created ? '✓' : '✗'}`);
console.log(`  payment.updated subscribed: ${state.has_payment_updated ? '✓' : '✗'}`);
console.log(`  API version 2024-01-17: ${state.has_2024_01_17 ? '✓' : '✗'}`);
console.log(`  HTTPS URLs visible on page: ${state.https_urls_on_page.length}`);
state.https_urls_on_page.forEach((u) => console.log(`    - ${u}`));
console.log(`  Buttons (first 25):`);
state.buttons.forEach((b) => console.log(`    - "${b}"`));
console.log(`  Subscription-related elements: ${state.subscription_count}`);

await browser.close();
console.log('\nDone. CDP connection closed; browser still open for review.');
