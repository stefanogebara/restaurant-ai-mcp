/**
 * Live walk of the demo flow (the closest thing to a fresh-user onboarding):
 *   landing → click demo CTA → /demo/setup form → submit → /demo dashboard
 *
 * Then drives the major dashboard interactions to find INTERACTION bugs
 * the route-level audit can't catch:
 *   - Manager AI chat button + send a message
 *   - Reservations list — click into one
 *   - Active parties — try opening the walk-in modal
 *
 * Artifacts: audit-demo/<ts>/ — screenshots + report.json
 */

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';

const OUT_DIR = path.join(__dirname, '..', 'audit-demo', String(Date.now()));
fs.mkdirSync(OUT_DIR, { recursive: true });

interface Finding {
  step: string;
  kind: 'console-error' | 'network-5xx' | 'network-4xx' | 'missing-element' | 'unexpected-state' | 'interaction-failed';
  message: string;
  url?: string;
  status?: number;
}

const findings: Finding[] = [];
const consoleErrors: { step: string; text: string }[] = [];
const networkErrors: { step: string; url: string; status: number }[] = [];
let currentStep = 'init';

const CONSOLE_NOISE: RegExp[] = [
  /Download the React DevTools/,
  /\[posthog\]/,
  /\[Sentry\] /,
  /Failed to load resource.*404/,
];

const NETWORK_NOISE: RegExp[] = [
  /\/api\/instagram\/status/,
  /\/api\/whatsapp.*\/status/,
  /accounts\.google\.com/,
  /sentry\.io/,
  /posthog\.com/,
];

test.afterAll(async () => {
  fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify({
    timestamp: new Date().toISOString(),
    findings,
    consoleErrors,
    networkErrors,
  }, null, 2));
  console.log(`\n📋 Demo flow report: ${OUT_DIR}/report.json`);
  console.log(`   ${findings.length} findings, ${consoleErrors.length} console errors, ${networkErrors.length} network errors`);
});

test('demo flow: landing → demo setup → demo dashboard', async ({ page, context }) => {
  test.slow();

  // Hook listeners with step-aware context so we know WHICH step a console
  // error came from. Some errors are normal on the landing page (3rd-party
  // analytics) and bad later — keeping the step makes triage possible.
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (CONSOLE_NOISE.some((re) => re.test(text))) return;
    consoleErrors.push({ step: currentStep, text: text.slice(0, 400) });
  });
  page.on('response', async (resp) => {
    const status = resp.status();
    if (status < 400) return;
    const url = resp.url();
    if (NETWORK_NOISE.some((re) => re.test(url))) return;
    networkErrors.push({ step: currentStep, url, status });
  });

  // English so assertions match copy.
  await context.addInitScript(() => {
    try { window.localStorage.setItem('seatable-user-lang', 'en'); } catch { /* private mode */ }
  });

  // ─── Step 1: hit landing ──────────────────────────────────────────────
  currentStep = 'landing';
  await page.goto('https://seatable.one/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT_DIR, '01_landing.png'), fullPage: true });

  // Look for a hero CTA — Seatable's landing has multiple CTAs; the demo
  // ones live under "Try it now", "See it live", "Demo grátis" etc.
  // The route /demo/setup is the canonical entry — landing page anchors
  // to it via href so we can look for any anchor pointing there.
  const demoAnchorCount = await page.locator('a[href*="/demo"]').count();
  if (demoAnchorCount === 0) {
    findings.push({
      step: 'landing', kind: 'missing-element',
      message: 'No anchor to /demo found on landing — the primary funnel entry is broken',
    });
  }

  // ─── Step 2: navigate to demo setup ──────────────────────────────────
  currentStep = 'demo-setup';
  await page.goto('https://seatable.one/demo/setup', { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
  await page.screenshot({ path: path.join(OUT_DIR, '02_demo_setup.png'), fullPage: true });

  // Look for the form. The demo setup form should have at minimum a
  // restaurant name input + a city input + a submit. Without these, the
  // funnel is dead.
  const nameInput = page.locator('input[name*="name" i], input[placeholder*="name" i], input[placeholder*="nome" i]').first();
  const cityInput = page.locator('input[name*="city" i], input[placeholder*="city" i], input[placeholder*="cidade" i]').first();
  // The CTA reads "Find it" on the live page — it triggers a Google Maps
  // lookup. After picking a match the flow lands on /demo dashboard.
  // Playwright's :has-text() takes strings, not regex — use getByRole+name
  // with a regex name matcher instead.
  const submitBtn = page.getByRole('button', { name: /find it|find|create|criar|come[çc]ar|start|continue/i }).first();

  const nameVisible = await nameInput.isVisible().catch(() => false);
  const cityVisible = await cityInput.isVisible().catch(() => false);
  const submitVisible = await submitBtn.isVisible().catch(() => false);

  if (!nameVisible || !submitVisible) {
    findings.push({
      step: 'demo-setup', kind: 'missing-element',
      message: `setup form incomplete — name input visible:${nameVisible}, city visible:${cityVisible}, submit visible:${submitVisible}`,
    });
  } else {
    // ─── Step 3: fill + submit the demo setup ─────────────────────────
    currentStep = 'demo-setup-submit';
    const restaurantName = `Audit Demo ${Date.now().toString().slice(-6)}`;
    await nameInput.fill(restaurantName);
    if (cityVisible) await cityInput.fill('São Paulo');
    await page.screenshot({ path: path.join(OUT_DIR, '03_demo_setup_filled.png'), fullPage: true });

    // "Find it" hits the Google Maps scrape endpoint. Then a 4-step funnel:
    //   1. /demo/setup form: name + city → "Find it"
    //   2. Restaurant picker: choose from Google Maps results
    //   3. Email gate: fill your work email
    //   4. "Launch my demo" → /demo dashboard
    await submitBtn.click();
    await page.waitForTimeout(5_500);  // Google Maps lookup can take a few seconds
    await page.screenshot({ path: path.join(OUT_DIR, '04_post_find_it_results.png'), fullPage: true });

    // Step 2: pick the first restaurant card from the results list. Each
    // candidate is a <button> whose accessible name starts with the restaurant
    // name. We grab the first one that contains "reviews" (which appears in
    // the VISIBLE text of every candidate — "stars" comes from aria-label
    // and isn't in the innerText that hasText() inspects).
    const candidateButtons = page.getByRole('button').filter({ hasText: /reviews|avalia[çc][õo]es/i });
    const candidateCount = await candidateButtons.count();
    currentStep = 'demo-picker';
    if (candidateCount === 0) {
      findings.push({
        step: 'demo-picker', kind: 'missing-element',
        message: 'Google Maps lookup returned 0 candidate restaurants — funnel halted at step 2',
      });
      return;
    }
    await candidateButtons.first().click();
    await page.waitForTimeout(1_000);
    await page.screenshot({ path: path.join(OUT_DIR, '05_after_pick_candidate.png'), fullPage: true });

    // Step 3: fill the email gate. Real user would enter their work email
    // here; we use a plus-aliased address to avoid spamming the inbox.
    currentStep = 'demo-email';
    const emailInput = page.getByRole('textbox', { name: /email/i }).first();
    if (!(await emailInput.isVisible().catch(() => false))) {
      findings.push({
        step: 'demo-email', kind: 'missing-element',
        message: 'email gate input not visible after picking a candidate',
      });
      return;
    }
    const auditEmail = `stefanogebara+audit-${Date.now().toString().slice(-6)}@gmail.com`;
    await emailInput.fill(auditEmail);

    // Step 4: click "Launch my demo" (button is disabled until email is valid)
    const launchBtn = page.getByRole('button', { name: /launch my demo|launch|começar|começar demo/i }).first();
    await expect(launchBtn).toBeEnabled({ timeout: 5_000 });
    await page.screenshot({ path: path.join(OUT_DIR, '06_pre_launch.png'), fullPage: true });

    currentStep = 'demo-launch';
    await Promise.all([
      page.waitForURL(/\/demo(\?|\/|$)/, { timeout: 60_000 }).catch(() => null),
      launchBtn.click(),
    ]);
    // Demo creation involves a backend write + redirect. Give it room.
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

    const landedUrl = page.url();
    await page.screenshot({ path: path.join(OUT_DIR, '07_demo_dashboard_first_paint.png'), fullPage: true });

    if (!/\/demo($|\/|\?)/.test(landedUrl)) {
      findings.push({
        step: 'demo-launch', kind: 'interaction-failed',
        message: `Launch my demo didn't reach /demo — landed on ${landedUrl}`,
      });
      return;  // can't proceed with dashboard tests
    }

    // ─── Step 4: poke around the demo dashboard ───────────────────────
    currentStep = 'demo-dashboard';
    // Give the SPA + seeded data fetches a moment to settle.
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: path.join(OUT_DIR, '08_demo_dashboard_settled.png'), fullPage: true });

    // Check the Manager AI chat panel (the floating button). It might be a
    // FAB or inline button. Use a layered probe rather than a regex-in-CSS
    // (which Playwright doesn't support).
    const managerByRole = page.getByRole('button', { name: /manager ai|gerente|ai assistant/i });
    const managerByTestId = page.locator('[data-testid*="manager" i]');
    const managerByAria = page.locator('[aria-label*="manager" i]');
    const managerCount = (await managerByRole.count())
      + (await managerByTestId.count())
      + (await managerByAria.count());
    if (managerCount === 0) {
      findings.push({
        step: 'demo-dashboard', kind: 'missing-element',
        message: 'no Manager AI chat trigger visible on demo dashboard',
      });
    }

    // Check stats bar / reservations list / active parties — the three core
    // dashboard widgets per CLAUDE.md.
    for (const [label, selectors] of [
      ['stats bar', ['[data-testid*="stats"]', 'text=/today|hoje|reservations|reservas/i']],
      ['reservations list', ['[data-testid*="reservation"]', 'text=/upcoming|próximas|today\'s reservations/i']],
      ['active parties', ['[data-testid*="active-parties"]', 'text=/active|ativos|seated|sentados/i']],
    ] as Array<[string, string[]]>) {
      let found = false;
      for (const sel of selectors) {
        if (await page.locator(sel).first().isVisible().catch(() => false)) {
          found = true; break;
        }
      }
      if (!found) {
        findings.push({
          step: 'demo-dashboard', kind: 'missing-element',
          message: `${label} widget didn't render on demo dashboard`,
        });
      }
    }
  }

  // ─── Final tally ──────────────────────────────────────────────────────
  // Roll up console + network findings into the structured list for the
  // afterAll summary. Already captured separately — this is just a
  // convenience for the report.
  for (const e of consoleErrors) {
    findings.push({ step: e.step, kind: 'console-error', message: e.text });
  }
  for (const e of networkErrors) {
    findings.push({ step: e.step, kind: e.status >= 500 ? 'network-5xx' : 'network-4xx', message: `HTTP ${e.status}`, url: e.url, status: e.status });
  }

  // Test passes — issues live in the report. Only navigation failures
  // (caught by missing assertions above) make this fail.
  expect(true).toBe(true);
});
