import { test, expect, type Page } from '@playwright/test';

// This suite must only use the isolated restaurant created for CI. It does not
// create reservations, import guests, send messages, or change settings.
const SANDBOX_EMAIL = 'ci-smoke@seatable.test';
const SANDBOX_NAME = 'Seatable CI Sandbox';

async function login(page: Page) {
  if (process.env.SANDBOX_EMAIL !== SANDBOX_EMAIL || !process.env.SANDBOX_PASSWORD) {
    throw new Error(`Live smoke requires the dedicated ${SANDBOX_EMAIL} account`);
  }
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(SANDBOX_EMAIL);
  await page.locator('input[type="password"]').fill(process.env.SANDBOX_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/host-dashboard\//, { timeout: 30_000 });
}

async function authenticatedGet(page: Page, path: string) {
  return page.evaluate(async (url) => {
    const storageKey = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    const session = storageKey ? JSON.parse(localStorage.getItem(storageKey) || '{}') : null;
    if (!session?.access_token) throw new Error('Supabase session missing after login');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    return { status: response.status, body: await response.json() };
  }, path);
}

test.describe('Production smoke: isolated CI restaurant', () => {
  test.setTimeout(90_000);

  test('authenticates into its own restaurant and loads real settings', async ({ page }) => {
    await login(page);
    const { status, body } = await authenticatedGet(page, '/api/restaurant-settings');
    expect(status).toBe(200);
    expect(body.data?.restaurant_name).toBe(SANDBOX_NAME);
    expect(body.data?.email).toBe(SANDBOX_EMAIL);
    expect(body.data?.timezone).toBe('America/Sao_Paulo');
    const tables = await authenticatedGet(page, '/api/table-config?action=list');
    expect(tables.status).toBe(200);
    expect(tables.body.tables).toHaveLength(4);
    expect(tables.body.tables.map((table: { table_number: number }) => table.table_number)).toEqual([1, 2, 3, 4]);
    expect(tables.body.tables.every((table: { location: string }) => table.location === 'CI Sandbox')).toBe(true);
  });

  test('dashboard and tables render without application errors', async ({ page }) => {
    await login(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const route of ['/host-dashboard/simple', '/host-dashboard/tables']) {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(500);
      await expect(page.locator('main').first()).toBeVisible();
      expect(page.url()).toContain(route);
    }
    expect(errors).toEqual([]);
  });

  test('calls, customers, voice and WhatsApp pages load for the sandbox', async ({ page }) => {
    await login(page);
    for (const route of [
      '/host-dashboard/calls',
      '/host-dashboard/customers',
      '/host-dashboard/voice-settings',
      '/host-dashboard/whatsapp',
    ]) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(500);
      await expect(page.locator('main').first(), route).toBeVisible();
      expect(page.url(), route).toContain(route);
    }
  });

  test('analytics, coupons and events load without borrowed customer data', async ({ page }) => {
    await login(page);
    const analytics = await authenticatedGet(page, '/api/analytics?period=30d');
    expect(analytics.status).toBe(200);
    expect(analytics.body.success).toBe(true);
    expect(analytics.body.analytics?.overview?.total_reservations).toBe(0);
    expect(analytics.body.upgrade_required).toBe(true);

    const events = await authenticatedGet(page, '/api/events?action=list');
    expect(events.status).toBe(403);
    expect(events.body.feature).toBe('advanced_analytics');
    expect(events.body.current_plan).toBe('free');

    for (const route of [
      '/host-dashboard/insights?tab=analytics',
      '/host-dashboard/coupons',
      '/host-dashboard/events',
    ]) {
      const response = await page.goto(route);
      expect(response?.status(), route).toBeLessThan(500);
      await expect(page.locator('main').first(), route).toBeVisible();
      expect(page.url(), route).toContain(route.split('?')[0]);
    }
  });
});
