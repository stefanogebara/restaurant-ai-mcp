/**
 * Connect to the already-running detached Chrome (opened by
 * open-square-cdp.mjs), find the Square Dashboard tab, and report:
 *   - which page we're on
 *   - configured webhook subscription URL
 *   - configured API version
 *   - subscribed event types
 *   - whether a "Send test event" button is visible
 *
 * Read-only — no clicks, no edits. We need to know the current state
 * before deciding what (if anything) to fix.
 */

import { chromium } from 'playwright';

const CDP_URL = 'http://localhost:9222';

const browser = await chromium.connectOverCDP(CDP_URL).catch((err) => {
  console.error('Cannot connect via CDP:', err.message);
  process.exit(1);
});

const allPages = browser.contexts().flatMap((c) => c.pages());
console.log(`Connected. ${allPages.length} tab(s) open across ${browser.contexts().length} context(s).\n`);

const squarePages = allPages.filter((p) => p.url().includes('squareup.com'));
if (squarePages.length === 0) {
  console.log('No Square tabs open. Open https://developer.squareup.com/apps in the CDP browser first.');
  await browser.close();
  process.exit(1);
}

for (const page of squarePages) {
  console.log('───────────────────────────────────────────────────────────');
  console.log(' URL:', page.url());
  console.log(' Title:', await page.title());

  // Dump every text-input value (sanitized) and every form heading so we
  // can see what's actually on the page without depending on knowing
  // Square's specific DOM structure.
  try {
    const inputs = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('input').forEach((el) => {
        const label = el.getAttribute('aria-label') || el.getAttribute('placeholder')
          || el.getAttribute('name') || el.id || '(unlabelled)';
        const value = (el.value || '').trim();
        if (value || label !== '(unlabelled)') {
          out.push({
            label: label.slice(0, 60),
            type: el.type,
            // Truncate values that look secret-y
            value: value.length > 60 ? `${value.slice(0, 8)}…${value.slice(-4)} (len ${value.length})` : value,
          });
        }
      });
      return out;
    });
    if (inputs.length > 0) {
      console.log(' Inputs:');
      for (const i of inputs) console.log(`   ${i.label} [${i.type}] = "${i.value}"`);
    }
  } catch (err) {
    console.log(' (could not enumerate inputs:', err.message + ')');
  }

  // Likely-relevant headings
  try {
    const headings = await page.evaluate(() =>
      Array.from(document.querySelectorAll('h1, h2, h3, h4')).map((h) => h.textContent.trim()).filter(Boolean).slice(0, 12)
    );
    if (headings.length > 0) {
      console.log(' Headings:', headings.join(' | '));
    }
  } catch {}

  // Look for "Send test event" or similar buttons
  try {
    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button, [role="button"]'))
        .map((b) => (b.textContent || '').trim())
        .filter((t) => t && t.length < 60)
        .slice(0, 20)
    );
    if (buttons.length > 0) {
      console.log(' Buttons (first 20):');
      buttons.forEach((b) => console.log(`   - "${b}"`));
    }
  } catch {}

  // Anything that looks like our notification URL
  try {
    const urlMatches = await page.evaluate(() => {
      const wanted = 'seatable.one/api/square/webhook';
      const found = [];
      document.querySelectorAll('*').forEach((el) => {
        const text = (el.textContent || '').trim();
        if (text.includes(wanted) && text.length < 200) {
          found.push(text);
        }
      });
      return [...new Set(found)].slice(0, 5);
    });
    if (urlMatches.length > 0) {
      console.log(' URL references found on page:');
      urlMatches.forEach((m) => console.log(`   ✓ "${m}"`));
    } else {
      console.log(' ❌ No reference to seatable.one/api/square/webhook on this page');
    }
  } catch {}

  // Look for subscribed event types
  try {
    const eventHits = await page.evaluate(() => {
      const wanted = ['payment.created', 'payment.updated'];
      const text = document.body?.textContent || '';
      return wanted.filter((w) => text.includes(w));
    });
    console.log(' Subscribed events visible on page:', eventHits.length ? eventHits.join(', ') : '(none of payment.created / payment.updated found)');
  } catch {}
}

console.log('───────────────────────────────────────────────────────────');
console.log('Survey done. CDP connection closing (browser stays open).');
await browser.close();
