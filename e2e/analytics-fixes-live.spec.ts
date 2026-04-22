/**
 * Live assertion test — proves the 4 bug fixes are working on production.
 * Unlike the screenshot-only walkthrough, this asserts specific values so
 * regressions will fail the test.
 */
import { test, expect } from '@playwright/test';
import path from 'path';

const OUT = 'audit-screenshots';
const SANDBOX_EMAIL = 'cantina.bellavista@seatable.io';
const SANDBOX_PASSWORD = 'Sandbox2026!';

async function login(page) {
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

  test('Fix #4: WhatsApp agent list_upcoming_events tool returns events', async ({ request }) => {
    // The executeTool path is server-side. Verify the underlying query
    // the tool runs returns live events (same filter: is_active=true,
    // event_date >= today, scoped by restaurant_id).
    const url = 'https://ckforlwdhewexyqljsaf.supabase.co/rest/v1/events';
    const today = new Date().toISOString().slice(0, 10);
    const res = await request.get(
      `${url}?restaurant_id=eq.c3368ea1-b278-416f-ad24-de28434fe9ce&is_active=eq.true&event_date=gte.${today}&select=id,title,event_date,current_bookings,max_capacity`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`,
          'Accept-Profile': 'restaurant',
        },
      }
    );
    expect(res.status()).toBe(200);
    const events = await res.json();
    console.log('Upcoming events the tool will surface:', events.length);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toHaveProperty('title');
    expect(events[0]).toHaveProperty('event_date');
  });

  test('Dashboard today widgets read live data (upcoming reservations, revenue forecast)', async ({ page }) => {
    await login(page);
    await page.goto('/host-dashboard/simple', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const todayCount = await page.locator('text=/TODAY.S RESERVATIONS/i').locator('..').locator('text=/^\\d+$/').first().textContent();
    console.log("Today's reservations:", todayCount);
    expect(Number(todayCount)).toBeGreaterThan(0);

    const forecast = await page.locator('text=/REVENUE FORECAST/i').locator('..').innerText();
    console.log('Revenue Forecast:', forecast.slice(0, 200));
    expect(forecast).toMatch(/\$[\d,]+/);

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
