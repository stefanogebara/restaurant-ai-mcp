/**
 * Full platform audit — walks every public + protected route on
 * seatable.one, captures screenshots + console errors + 4xx/5xx
 * network requests, writes a JSON report.
 *
 * Two passes:
 *   1. Public routes (no auth) — / /login /live-demo /privacy /terms
 *      /customer /calculadora
 *   2. Protected routes (auth-state.json) — every /host-dashboard/*
 *      route, /onboarding, /welcome, /subscription/manage,
 *      /settings/language
 *
 * Artifacts land in audit-full/<timestamp>/. Report at audit-full/<ts>/report.json.
 *
 * Designed to be tolerant of soft failures: a single bad route shouldn't
 * abort the rest of the sweep. Each route runs in isolation in its own
 * test() so Playwright keeps going.
 */

import { test, expect, type Page, type ConsoleMessage, type Request } from '@playwright/test';
import * as path from 'node:path';
import * as fs from 'node:fs';

const AUTH_STATE = path.join(__dirname, 'auth-state.json');
const REPORTS_DIR = path.join(__dirname, '..', 'audit-full', String(Date.now()));
fs.mkdirSync(REPORTS_DIR, { recursive: true });

interface RouteIssue {
  kind: 'console-error' | 'console-warning' | 'network-4xx' | 'network-5xx' | 'navigation-failed' | 'unexpected-redirect';
  url?: string;
  status?: number;
  message: string;
  matcher?: string;
}

interface RouteReport {
  route: string;
  protected: boolean;
  finalUrl: string;
  loadTimeMs: number;
  pageTitle: string;
  screenshot: string;
  issues: RouteIssue[];
}

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/live-demo',
  '/calculadora',
  '/privacy',
  '/terms',
  '/customer',
];

const PROTECTED_ROUTES = [
  '/host-dashboard/simple',
  '/host-dashboard/calls',
  '/host-dashboard/tables',
  '/host-dashboard/floor-plan',
  '/host-dashboard/voice-settings',
  '/host-dashboard/whatsapp',
  '/host-dashboard/insights',
  '/host-dashboard/ltv',
  '/host-dashboard/team',
  '/host-dashboard/settings',
  '/host-dashboard/manager-ai',
  '/host-dashboard/campaigns',
  '/host-dashboard/coupons',
  '/host-dashboard/events',
  '/host-dashboard/customers',
  '/host-dashboard/integrations',
  '/onboarding',
  '/welcome',
  '/subscription/manage',
  '/settings/language',
];

// Network noise we deliberately ignore in the report. Some 401s are
// EXPECTED (auth probes, OAuth challenges); 404s on /api/whatsapp-status
// for a restaurant that hasn't set up WhatsApp aren't bugs.
const NETWORK_NOISE_PATTERNS: RegExp[] = [
  /\/api\/instagram\/status/,      // returns 401 if not connected — by design
  /\/api\/whatsapp.*\/status/,     // ditto
  /accounts\.google\.com\/RotateCookiesPage/,
  /sentry\.io/,                    // sentry's own failures shouldn't block product audit
  /posthog\.com.*\/decide/,        // posthog probes
];

const CONSOLE_NOISE_PATTERNS: RegExp[] = [
  /Download the React DevTools/,
  /\[posthog\]/,
  /\[Sentry\] /,
  /Failed to load resource.*404/, // already captured in network channel
];

function isNoise(match: RegExp[], text: string): boolean {
  return match.some((re) => re.test(text));
}

const reports: RouteReport[] = [];

test.afterAll(async () => {
  const reportPath = path.join(REPORTS_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    seatable_url: 'https://seatable.one',
    total_routes: reports.length,
    total_issues: reports.reduce((sum, r) => sum + r.issues.length, 0),
    by_severity: {
      critical: reports.flatMap((r) => r.issues).filter((i) => i.kind === 'navigation-failed' || i.kind === 'network-5xx').length,
      high:     reports.flatMap((r) => r.issues).filter((i) => i.kind === 'console-error').length,
      medium:   reports.flatMap((r) => r.issues).filter((i) => i.kind === 'network-4xx' || i.kind === 'unexpected-redirect').length,
      low:      reports.flatMap((r) => r.issues).filter((i) => i.kind === 'console-warning').length,
    },
    reports,
  }, null, 2));
  console.log(`\n📋 Audit report: ${reportPath}`);
  console.log(`   ${reports.length} routes audited, ${reports.reduce((s, r) => s + r.issues.length, 0)} issues`);
});

async function auditRoute(page: Page, route: string, isProtected: boolean) {
  const issues: RouteIssue[] = [];
  const onConsole = (msg: ConsoleMessage) => {
    const type = msg.type();
    const text = msg.text();
    if (isNoise(CONSOLE_NOISE_PATTERNS, text)) return;
    if (type === 'error') issues.push({ kind: 'console-error', message: text.slice(0, 500) });
    else if (type === 'warning') issues.push({ kind: 'console-warning', message: text.slice(0, 500) });
  };
  const onRequestFailed = (req: Request) => {
    const url = req.url();
    if (isNoise(NETWORK_NOISE_PATTERNS, url)) return;
    issues.push({
      kind: 'navigation-failed', url, message: req.failure()?.errorText || 'request failed',
    });
  };
  const onResponse = (resp: { url: () => string; status: () => number }) => {
    const status = resp.status();
    const url = resp.url();
    if (status < 400) return;
    if (isNoise(NETWORK_NOISE_PATTERNS, url)) return;
    if (status >= 500) issues.push({ kind: 'network-5xx', url, status, message: `HTTP ${status}` });
    else if (status >= 400) issues.push({ kind: 'network-4xx', url, status, message: `HTTP ${status}` });
  };

  page.on('console', onConsole);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  const started = Date.now();
  let pageTitle = '';
  let finalUrl = route;
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Wait for the SPA to mount something visible — body content > skeleton.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    pageTitle = await page.title();
    finalUrl = new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash;
  } catch (err) {
    issues.push({ kind: 'navigation-failed', message: (err as Error).message });
  }
  const loadTimeMs = Date.now() - started;

  // Track unexpected redirects: public routes that bounce, or protected
  // ones that land outside /host-dashboard/* / / / /login.
  if (!finalUrl.startsWith(route) && finalUrl !== route) {
    // Soft signal — many of these are legit (e.g. /onboarding → /welcome
    // when already onboarded, or /host-dashboard/reports → /host-dashboard/insights).
    issues.push({
      kind: 'unexpected-redirect',
      message: `requested ${route}, landed on ${finalUrl}`,
    });
  }

  const screenshotFile = `${route.replace(/[^a-z0-9]/gi, '_') || 'root'}.png`;
  const screenshotPath = path.join(REPORTS_DIR, screenshotFile);
  try {
    await page.screenshot({ path: screenshotPath, fullPage: false });
  } catch { /* page might be closed already */ }

  reports.push({
    route, protected: isProtected, finalUrl, loadTimeMs, pageTitle,
    screenshot: screenshotFile, issues,
  });

  page.off('console', onConsole);
  page.off('requestfailed', onRequestFailed);
  page.off('response', onResponse);
}

// ─── Public routes — no auth ─────────────────────────────────────────────

test.describe('Full audit — public routes (no auth)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of PUBLIC_ROUTES) {
    test(`public: ${route}`, async ({ page }) => {
      test.slow();
      await auditRoute(page, route, false);
      // Pass the test regardless — issues are reported. Only nav timeout fails.
      expect(reports.find((r) => r.route === route)).toBeDefined();
    });
  }
});

// ─── Protected routes — uses auth-state.json ─────────────────────────────

test.describe('Full audit — protected routes', () => {
  test.use({ storageState: AUTH_STATE });

  // Seed pt-BR override OFF since panel/dashboard copy is mixed locale.
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try { window.localStorage.setItem('seatable-user-lang', 'en'); } catch { /* private mode */ }
    });
  });

  for (const route of PROTECTED_ROUTES) {
    test(`protected: ${route}`, async ({ page }) => {
      test.slow();
      await auditRoute(page, route, true);
      expect(reports.find((r) => r.route === route)).toBeDefined();
    });
  }
});
