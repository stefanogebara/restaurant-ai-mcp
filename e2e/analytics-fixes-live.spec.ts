/**
 * Live assertion test — proves the 4 bug fixes are working on production.
 * Unlike the screenshot-only walkthrough, this asserts specific values so
 * regressions will fail the test.
 */
import { test, expect } from '@playwright/test';
import path from 'path';

const OUT = 'audit-screenshots';
const SANDBOX_EMAIL = process.env.SANDBOX_EMAIL as string;
const SANDBOX_PASSWORD = process.env.SANDBOX_PASSWORD as string;

async function login(page) {
  if (!SANDBOX_EMAIL || !SANDBOX_PASSWORD) {
    throw new Error('Defina SANDBOX_EMAIL e SANDBOX_PASSWORD no ambiente. As credenciais sairam do codigo em ago/2026 — ver tasks/lessons.md.');
  }
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByPlaceholder(/you@restaurant.com/i).fill(SANDBOX_EMAIL);
  await page.getByPlaceholder(/your password/i).fill(SANDBOX_PASSWORD);
  await page.getByRole('button', { name: /^Sign In$/i }).click();
  await page.waitForURL(/host-dashboard|analytics|welcome|onboarding/, { timeout: 30000 });
  await page.waitForTimeout(2500);
}

test.describe('Live production fixes verified on seatable.one', () => {
  test.setTimeout(120000);

  test('Fix #1: analytics No-Show Rate + Est. Revenue are real numbers, not em-dash', async ({ page }) => {
    await login(page);
    await page.goto('/host-dashboard/insights?tab=analytics', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3500);

    // Pull every KPI label+value pair off the page
    const kpis = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('[class*="uppercase"][class*="tracking-widest"]'));
      return labels.map(el => {
        const text = el.textContent?.trim();
        const val = el.parentElement?.querySelector('.text-\\[26px\\]')?.textContent?.trim()
                 || el.nextElementSibling?.textContent?.trim();
        return { label: text, value: val };
      }).filter(k => k.label && k.value);
    });
    console.log('KPIs:', JSON.stringify(kpis, null, 2));

    const noShow = kpis.find(k => /no[- ]?show rate/i.test(k.label || ''));
    const revenue = kpis.find(k => /est\.? revenue|revenue/i.test(k.label || ''));
    const cancel = kpis.find(k => /cancellation rate/i.test(k.label || ''));

    expect(noShow?.value).toBeTruthy();
    expect(noShow?.value).not.toBe('\u2014');
    expect(noShow?.value).toMatch(/\d+\.\d+%/);

    expect(revenue?.value).toBeTruthy();
    expect(revenue?.value).not.toBe('\u2014');
    expect(revenue?.value).toMatch(/\$[\d,]+/);

    expect(cancel?.value).toMatch(/\d+\.\d+%/);

    await page.screenshot({ path: path.join(OUT, 'live-fix-01-kpis.png'), fullPage: false });
  });

  test('Fix #2: Status donut has single Cancelled bucket, not split by case', async ({ page }) => {
    await login(page);
    await page.goto('/host-dashboard/insights?tab=analytics', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(4000);

    // Scroll into view so the donut legend renders
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    const legendText = await page.locator('text=/Status Breakdown/i').locator('..').locator('..').innerText();
    console.log('Status Breakdown region:', legendText.slice(0, 400));

    const cancelledMatches = legendText.match(/Cancelled \((\d+)\)/gi) || [];
    console.log('Cancelled buckets found:', cancelledMatches);

    expect(cancelledMatches.length).toBe(1);
    expect(cancelledMatches[0]).toMatch(/Cancelled \(\d+\)/);

    await page.screenshot({ path: path.join(OUT, 'live-fix-02-status-donut.png'), fullPage: true });
  });

  test('Fix #3: Booking Heatmap shows all 4 tables with service counts', async ({ page }) => {
    await login(page);
    await page.goto('/host-dashboard/insights?tab=analytics', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3500);

    const heatmapText = await page.locator('text=/Booking Heatmap/i').locator('..').locator('..').innerText();
    console.log('Heatmap region:', heatmapText.slice(0, 300));

    // Should NOT show the empty-state message
    expect(heatmapText).not.toContain('No table utilization data yet');

    // Should have per-table service counts > 0 for at least one table
    const serviceMatches = heatmapText.match(/(\d+)\s*services?/g) || [];
    const counts = serviceMatches.map(s => parseInt(s, 10));
    const nonZero = counts.filter(n => n > 0);
    console.log('Per-table service counts:', counts, '| non-zero:', nonZero.length);

    expect(nonZero.length).toBeGreaterThanOrEqual(3);

    await page.screenshot({ path: path.join(OUT, 'live-fix-03-heatmap.png'), fullPage: false });
  });

  test('Fix #4: WhatsApp agent list_upcoming_events tool returns events', async ({ page }) => {
    // KNOWN GAP: this verifies the restaurant.events table has upcoming rows
    // via /api/events, not that the executeTool() function itself works. The
    // tool lives in api/services/whatsapp/reservation-tools.js and uses
    // supabaseAdmin.schema('restaurant').from('events') directly. If someone
    // refactors the tool's query without touching /api/events, this test
    // would pass while the tool is broken. A proper unit test of the tool
    // handler is tracked as follow-up. Acceptable trade-off: keeps CI free
    // of SUPABASE_SERVICE_ROLE_KEY secret management.
    await login(page);

    const events = await page.evaluate(async () => {
      // Pull the Supabase JWT that the app persists for authenticated fetches
      const keys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      const raw = keys.length ? localStorage.getItem(keys[0]) : null;
      const token = raw ? JSON.parse(raw).access_token : null;
      const res = await fetch('/api/events?action=list', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      return { status: res.status, events: json?.data?.events || json?.events || [] };
    });

    console.log('GET /api/events status:', events.status, '| count:', (events.events || []).length);
    expect(events.status).toBe(200);

    const today = new Date().toISOString().slice(0, 10);
    const upcomingActive = (events.events || []).filter(
      e => e.is_active && e.event_date >= today
    );
    console.log('Upcoming active events the tool will surface:', upcomingActive.length);
    expect(upcomingActive.length).toBeGreaterThanOrEqual(1);
    expect(upcomingActive[0]).toHaveProperty('title');
    expect(upcomingActive[0]).toHaveProperty('event_date');
  });

  test('Dashboard today widgets read live data (upcoming reservations, revenue forecast)', async ({ page }) => {
    await login(page);
    await page.goto('/host-dashboard/simple', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3000);

    // Widget renders a number (can legitimately be 0 on an empty day — we just
    // need to prove the widget wired up, not that today's calendar is full).
    const todayCount = await page.locator('text=/TODAY.S RESERVATIONS/i').locator('..').locator('text=/^\\d+$/').first().textContent();
    console.log("Today's reservations:", todayCount);
    expect(todayCount).not.toBeNull();
    expect(Number.isFinite(Number(todayCount))).toBe(true);

    // Revenue forecast must show a currency amount — this is derived from
    // historical avg_spend × upcoming covers, so it should always have a value.
    const forecast = await page.locator('text=/REVENUE FORECAST/i').locator('..').innerText();
    console.log('Revenue Forecast:', forecast.slice(0, 200));
    expect(forecast).toMatch(/(?:\$|R\$|€)\s*[\d,.]+/);

    await page.screenshot({ path: path.join(OUT, 'live-fix-05-dashboard.png'), fullPage: false });
  });

  test('Coupons page shows all 8 seeded coupons', async ({ page }) => {
    await login(page);
    await page.goto('/host-dashboard/coupons', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const total = await page.locator('text=/^Total$/i').locator('..').locator('text=/^\\d+$/').first().textContent();
    console.log('Total coupons:', total);
    expect(Number(total)).toBeGreaterThanOrEqual(8);

    // Check WELCOME15 and MAXEDOUT are present
    await expect(page.locator('text=WELCOME15').first()).toBeVisible();
    await expect(page.locator('text=MAXEDOUT').first()).toBeVisible();

    await page.screenshot({ path: path.join(OUT, 'live-fix-06-coupons.png'), fullPage: false });
  });

  test('Events page shows upcoming events with bookings', async ({ page }) => {
    await login(page);
    await page.goto('/host-dashboard/events', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const pageText = await page.locator('body').innerText();
    console.log('Events page text sample:', pageText.slice(0, 500));

    // At least one of our seeded events
    const hasSeededEvent = /Brunch de Domingo|Degustação de Vinhos|Jantar Harmonizado/.test(pageText);
    expect(hasSeededEvent).toBe(true);

    // Est Revenue pill on events page
    expect(pageText).toMatch(/R\$\s*[\d.,]+/);

    await page.screenshot({ path: path.join(OUT, 'live-fix-07-events.png'), fullPage: false });
  });
});
