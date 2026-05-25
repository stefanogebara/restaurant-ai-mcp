#!/usr/bin/env node
// Visual side-by-side: mockup HTML <-> production page.
//
// USAGE
//   node scripts/design-audit-visual.mjs
//
//   Output: design-audit/YYYY-MM-DD-v2/
//     - <name>-mockup.png  · full-page screenshot of .figma-mockups/<name>.html
//     - <name>-prod.png    · full-page screenshot of the matching route on seatable.one
//     - INDEX.md           · table of routes, status, redirects, orphan flags
//
//   PNGs are gitignored — regenerate any time.
//
// WHEN TO RUN
//   - After a wave of UI changes that touch many pages
//   - Before a design refresh, to see what currently ships
//   - Quarterly, as part of maintenance (drift accumulates silently)
//
// COVERAGE LIMITATIONS
//   - Public pages (/, /login, /live-demo, /customer): captured cleanly.
//   - Dashboard family (/demo/:token): captured via a fresh demo session
//     that the script creates upfront. Note this is DemoDashboard.tsx, NOT
//     the auth host Dashboard.tsx — comparable design system, different
//     component.
//   - Host-only routes (/host-dashboard/*, /onboarding, /subscription/manage):
//     redirect to /login because we have no Google OAuth session. The
//     screenshot captures the login screen as evidence the route is gated.
//     For these, do a source-level diff (read mockup HTML + matching *.tsx).
//
// ADDING A NEW MOCKUP
//   1. Drop the HTML in .figma-mockups/<name>.html
//   2. Add a row to buildMapping() below with the production route
//      (use auth: true for ProtectedRoute, scroll: true for routes with
//      intersection-observer animations).
//   3. Re-run.
//
// 2026-05-25 RUN
//   The first run produced 8 design-drift GitHub issues (label: design-drift)
//   covering Voice Settings, Analytics, Onboarding, Call Tracking, and Table
//   Config. See: gh issue list --label design-drift

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..');
const MOCKUP_DIR = path.join(REPO, '.figma-mockups');
const OUT_DIR = path.join(REPO, 'design-audit', new Date().toISOString().slice(0, 10) + '-v2');
const PROD = 'https://seatable.one';

// 1. Create a fresh demo restaurant so we have an unauthenticated route
//    that lands on the dashboard family (DemoDashboard at /demo/:token).
async function createDemo() {
  const res = await fetch(`${PROD}/api/demo?action=create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      restaurant_name: 'Design Audit Demo',
      cuisine_type: 'italian',
      city: 'Lisbon',
      country: 'PT',
      contact_name: 'Design Audit',
      contact_email: `design-audit-${Date.now()}@example.com`,
    }),
  });
  const body = await res.json();
  if (!body.success || !body.demo_token) {
    throw new Error(`demo create failed: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.demo_token;
}

// 2. Mockup file -> production route.
//    null = orphan (no shipped page).
//    "needs_auth" = route exists but requires a Google login we don't have.
function buildMapping(demoToken) {
  return {
    'analytics.html':            { route: '/analytics', auth: true },
    'booking.html':              { route: null, note: 'no public demo slug — needs an owned restaurant slug' },
    'booking-confirmation.html': { route: null, note: 'flow needs a real reservation' },
    'call-tracking.html':        { route: '/host-dashboard/calls', auth: true },
    'customer-portal.html':      { route: '/customer' },
    'dashboard.html':            { route: `/demo/${demoToken}`, note: 'comparing against DemoDashboard (same design system, public route)' },
    'landing.html':              { route: '/', scroll: true },
    'live-demo.html':            { route: '/live-demo' },
    'login.html':                { route: '/login' },
    'not-found.html':            { route: '/this-route-does-not-exist-on-purpose' },
    'onboarding.html':           { route: '/onboarding', auth: true },
    'reports.html':              { route: '/host-dashboard/reports', auth: true },
    'subscription.html':         { route: '/subscription/manage', auth: true },
    'table-config.html':         { route: '/host-dashboard/tables', auth: true },
    'voice-settings.html':       { route: '/host-dashboard/voice-settings', auth: true },
  };
}

// Slow-scroll the full page bottom-to-bottom-and-back so intersection
// observers fire on the way down and lazy images load. Doing both
// directions lets us screenshot full-page at the end with everything
// already rendered.
async function scrollPass(page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  const step = 600;
  for (let y = 0; y < height; y += step) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), y);
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(400);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const demoToken = await createDemo();
console.log(`demo token: ${demoToken}`);
const MAPPING = buildMapping(demoToken);

const results = [];
const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
});

try {
  for (const [mockupFile, entry] of Object.entries(MAPPING)) {
    const name = mockupFile.replace(/\.html$/, '');
    const mockupPath = path.join(MOCKUP_DIR, mockupFile);
    const mockupOut = path.join(OUT_DIR, `${name}-mockup.png`);
    const prodOut = path.join(OUT_DIR, `${name}-prod.png`);

    if (!fs.existsSync(mockupPath)) {
      results.push({ name, status: 'mockup_missing' });
      continue;
    }

    const page = await ctx.newPage();
    try {
      // Mockup
      await page.goto(pathToFileURL(mockupPath).toString(), { waitUntil: 'networkidle', timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(800);
      if (entry.scroll) await scrollPass(page);
      await page.screenshot({ path: mockupOut, fullPage: true });

      // Production (or skip if route===null)
      if (entry.route === null) {
        results.push({ name, route: '—', status: 'orphan_mockup', note: entry.note, mockup: mockupOut });
      } else {
        let prodStatus = 'ok';
        let prodLandedUrl = '';
        try {
          const resp = await page.goto(`${PROD}${entry.route}`, { waitUntil: 'networkidle', timeout: 25_000 });
          prodStatus = resp ? `http_${resp.status()}` : 'no_response';
          await page.waitForTimeout(1_500);
          if (entry.scroll) await scrollPass(page);
          prodLandedUrl = page.url();
          await page.screenshot({ path: prodOut, fullPage: true });
        } catch (err) {
          prodStatus = `nav_err:${(err && err.message || String(err)).slice(0, 60)}`;
          try { await page.screenshot({ path: prodOut, fullPage: true }); } catch { /* nothing rendered */ }
        }
        results.push({
          name,
          route: entry.route,
          status: prodStatus,
          landed: prodLandedUrl,
          auth: !!entry.auth,
          note: entry.note,
          mockup: mockupOut,
          prod: prodOut,
        });
      }
    } finally {
      await page.close();
    }
    process.stdout.write('.');
  }
} finally {
  await browser.close();
}
process.stdout.write('\n');

// INDEX.md
const lines = [
  '# Seatable Design Audit (v2)',
  '',
  `Generated ${new Date().toISOString()} against ${PROD}.`,
  `Demo token: \`${demoToken}\``,
  '',
  '## Legend',
  '- **status** = the prod-side HTTP response.',
  '- **landed → /login** means the page is auth-gated; without a Google',
  '  OAuth session the prod screenshot is just the login screen.',
  '- **orphan_mockup** means no shipped page (or the page needs',
  '  a context we cannot construct without auth, e.g. a real reservation).',
  '',
  '| Mockup | Route | Status | Auth? | Pair | Note |',
  '|---|---|---|:---:|---|---|',
];
for (const r of results) {
  const pair = r.prod
    ? `[mockup](${path.basename(r.mockup)}) · [prod](${path.basename(r.prod)})`
    : (r.mockup ? `[mockup](${path.basename(r.mockup)}) · _no prod_` : '_no files_');
  const route = r.route === '—' ? '_(orphan)_' : `\`${r.route || '—'}\``;
  const auth = r.auth ? '🔒' : '';
  const landedMatch = r.landed && r.route && !r.landed.endsWith(r.route);
  const status = landedMatch ? `${r.status} → \`${r.landed.replace(PROD, '')}\`` : (r.status || '');
  const note = r.note || '';
  lines.push(`| \`${r.name}\` | ${route} | ${status} | ${auth} | ${pair} | ${note} |`);
}
fs.writeFileSync(path.join(OUT_DIR, 'INDEX.md'), lines.join('\n') + '\n');

console.log(`\nWrote ${results.length} pairs to ${OUT_DIR}`);
console.log(`Index: ${path.join(OUT_DIR, 'INDEX.md')}`);
