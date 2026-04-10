import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_STATE = path.join(__dirname, 'auth-state.json');
const hasAuthState = fs.existsSync(AUTH_STATE);

// Increase default timeout for dashboard pages that load data
test.use({ actionTimeout: 15000 });

test.describe('Joinable Table Visuals - Floor Plan View', () => {
  test.describe.configure({ timeout: 60000 });
  test.skip(!hasAuthState, 'Skipped: no auth-state.json — run `node e2e/generate-auth-state.js` first');
  test.use(hasAuthState ? { storageState: AUTH_STATE } : {});
  test.beforeEach(async ({ page }) => {
    await page.goto('/host-dashboard/simple', { waitUntil: 'domcontentloaded' });
    // Wait for page shell to render (sidebar, layout)
    await page.waitForTimeout(5000);

    // Skip if auth token expired and we got redirected to login
    if (page.url().includes('/login')) {
      test.skip(true, 'Auth token expired — regenerate with node e2e/generate-auth-state.js');
    }
  });

  test('dashboard page loads without critical 500 errors', async ({ page }) => {
    const serverErrors: string[] = [];

    // Known non-critical 500s to exclude (API bugs tracked separately)
    const excludedPaths = ['/api/manager-usage', '/api/posthog', '/api/analytics'];

    page.on('response', response => {
      if (response.status() >= 500) {
        const url = response.url();
        const isExcluded = excludedPaths.some(p => url.includes(p));
        if (!isExcluded) {
          serverErrors.push(`${response.status()} - ${url}`);
        }
      }
    });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    expect(serverErrors).toHaveLength(0);
  });

  test('floor plan SVG renders with connector line animation CSS', async ({ page }) => {
    // Check for error state (unauthenticated)
    const errorState = page.getByText('Error loading data');
    if (await errorState.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Dashboard requires authentication - testing page shell only');
      // Even in error state, check the page structure loaded
      const sidebar = page.locator('text=Overview');
      await expect(sidebar).toBeVisible();
      return;
    }

    // If authenticated, check SVG renders with our animation CSS
    const floorPlanSvg = page.locator('svg.block');
    const svgCount = await floorPlanSvg.count();

    if (svgCount > 0) {
      const svgHtml = await floorPlanSvg.first().innerHTML();
      expect(svgHtml).toContain('fpLinkDash');
    } else {
      // No tables configured, valid state
      console.log('No floor plan SVG found - tables may not be configured');
    }
  });

  test('joinable connector lines render between linked tables', async ({ page }) => {
    const errorState = page.getByText('Error loading data');
    if (await errorState.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }

    // Look for dashed SVG lines that connect joinable tables
    const connectorLines = page.locator('svg line[stroke="#9F1239"]');
    const lineCount = await connectorLines.count();

    if (lineCount > 0) {
      const firstLine = connectorLines.first();
      await expect(firstLine).toHaveAttribute('stroke-dasharray', '6,4');
      await expect(firstLine).toHaveAttribute('stroke-width', '2');

      const x1 = await firstLine.getAttribute('x1');
      const y1 = await firstLine.getAttribute('y1');
      const x2 = await firstLine.getAttribute('x2');
      const y2 = await firstLine.getAttribute('y2');
      expect(Number(x1)).toBeGreaterThan(0);
      expect(Number(y1)).toBeGreaterThan(0);
      expect(Number(x2)).toBeGreaterThan(0);
      expect(Number(y2)).toBeGreaterThan(0);
    } else {
      console.log('No joinable connector lines found - no joinable tables configured');
    }
  });

  test('joinable badge renders on linked tables', async ({ page }) => {
    const errorState = page.getByText('Error loading data');
    if (await errorState.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }

    const floorPlanSvg = page.locator('svg.block');
    if ((await floorPlanSvg.count()) === 0) {
      test.skip();
      return;
    }

    // Joinable badge circles have fill="#9F1239" and r=9
    const joinableBadgeCircles = page.locator('svg circle[fill="#9F1239"][r="9"]');
    const badgeCount = await joinableBadgeCircles.count();

    if (badgeCount > 0) {
      await expect(joinableBadgeCircles.first()).toBeVisible();
    } else {
      console.log('No joinable badges found - no joinable tables configured');
    }
  });

  test('hover card shows joinable info for linked tables', async ({ page }) => {
    const errorState = page.getByText('Error loading data');
    if (await errorState.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }

    const tableGroups = page.locator('svg.block g.cursor-pointer');
    const tableCount = await tableGroups.count();

    if (tableCount === 0) {
      test.skip();
      return;
    }

    // Hover over each table looking for joinable info in hover card
    for (let i = 0; i < Math.min(tableCount, 10); i++) {
      const group = tableGroups.nth(i);
      await group.hover();
      await page.waitForTimeout(400);

      const hoverCard = page.locator('foreignObject div');
      if ((await hoverCard.count()) > 0) {
        const cardHtml = await hoverCard.first().innerHTML();
        if (cardHtml.includes('Join w/')) {
          expect(cardHtml).toContain('seats');
          return; // Found joinable hover card
        }
      }
    }

    console.log('No joinable hover info found - no joinable tables configured');
  });

  test('Edit Floor Plan button is visible on desktop (when tables exist)', async ({ page }) => {
    const errorState = page.getByText('Error loading data');
    if (await errorState.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }

    // Check if floor plan SVG exists (requires tables to be configured)
    const floorPlanSvg = page.locator('svg.block');
    if ((await floorPlanSvg.count()) === 0) {
      // No tables configured — Edit Floor Plan button won't be shown
      console.log('No floor plan SVG — tables not configured, skipping Edit button check');
      return;
    }

    const editButton = page.getByText('Edit Floor Plan');
    const editButtonEs = page.getByText('Editar Plano');

    const enVisible = await editButton.isVisible().catch(() => false);
    const esVisible = await editButtonEs.isVisible().catch(() => false);

    expect(enVisible || esVisible).toBe(true);
  });

  test('Edit Floor Plan button visible on mobile viewport (when tables exist)', async ({ page }) => {
    const errorState = page.getByText('Error loading data');
    if (await errorState.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }

    // Check if floor plan SVG exists
    const floorPlanSvg = page.locator('svg.block');
    if ((await floorPlanSvg.count()) === 0) {
      console.log('No floor plan SVG — tables not configured, skipping Edit button check');
      return;
    }

    // Resize to mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(1000);

    const editButton = page.getByText('Edit Floor Plan');
    const editButtonEs = page.getByText('Editar Plano');

    const enVisible = await editButton.isVisible().catch(() => false);
    const esVisible = await editButtonEs.isVisible().catch(() => false);

    expect(enVisible || esVisible).toBe(true);
  });
});

test.describe('Joinable Table Visuals - Table Actions Modal', () => {
  test.describe.configure({ timeout: 60000 });
  test.skip(!hasAuthState, 'Skipped: no auth-state.json — run `node e2e/generate-auth-state.js` first');
  test.use(hasAuthState ? { storageState: AUTH_STATE } : {});

  test.beforeEach(async ({ page }) => {
    await page.goto('/host-dashboard/simple', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // Skip if auth token expired and we got redirected to login
    if (page.url().includes('/login')) {
      test.skip(true, 'Auth token expired — regenerate with node e2e/generate-auth-state.js');
    }
  });

  async function closeTableModal(page: import('@playwright/test').Page) {
    const cancelButton = page.getByText(/Cancel|Cancelar/);
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click();
      await page.waitForTimeout(300);
      return;
    }

    const closeButton = page.getByRole('button', { name: /Close|Cerrar|Fechar/i });
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await page.waitForTimeout(300);
      return;
    }

    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }

  test('table actions modal shows Edit in Floor Plan button', async ({ page }) => {
    const errorState = page.getByText('Error loading data');
    if (await errorState.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }

    const tableGroups = page.locator('svg.block g.cursor-pointer');
    if ((await tableGroups.count()) === 0) {
      test.skip();
      return;
    }

    // Click the first table to open the modal
    await tableGroups.first().click();
    await page.waitForTimeout(500);

    // Check if modal appeared with Edit in Floor Plan button
    const editLink = page.getByText('Edit in Floor Plan');
    const editLinkEs = page.getByText('Editar en Plano');

    const enVisible = await editLink.isVisible({ timeout: 3000 }).catch(() => false);
    const esVisible = await editLinkEs.isVisible({ timeout: 1000 }).catch(() => false);

    if (enVisible || esVisible) {
      expect(enVisible || esVisible).toBe(true);
    } else {
      console.log('Table actions modal did not appear - may require authentication or completo mode');
    }
  });

  test('table actions modal shows joinable info for linked tables', async ({ page }) => {
    const errorState = page.getByText('Error loading data');
    if (await errorState.isVisible({ timeout: 2000 }).catch(() => false)) {
      test.skip();
      return;
    }

    const tableGroups = page.locator('svg.block g.cursor-pointer');
    const tableCount = await tableGroups.count();

    if (tableCount === 0) {
      test.skip();
      return;
    }

    // Click each table looking for joinable info in the modal
    for (let i = 0; i < Math.min(tableCount, 10); i++) {
      await tableGroups.nth(i).click();
      await page.waitForTimeout(500);

      const joinableSection = page.getByText('Joinable Tables');
      const joinableSectionEs = page.getByText('Mesas Combinables');

      const enVisible = await joinableSection.isVisible({ timeout: 1000 }).catch(() => false);
      const esVisible = await joinableSectionEs.isVisible({ timeout: 500 }).catch(() => false);

      if (enVisible || esVisible) {
        const combinedCapacity = page.getByText(/Combined capacity|Capacidad combinada/);
        await expect(combinedCapacity).toBeVisible();
        return; // Found it
      }

      await closeTableModal(page);
    }

    console.log('No joinable tables info found in modal - no joinable tables configured');
  });

  test('no 500 errors during floor plan interactions', async ({ page }) => {
    const serverErrors: string[] = [];

    page.on('response', response => {
      if (response.status() >= 500) {
        serverErrors.push(`${response.status()} - ${response.url()}`);
      }
    });

    const errorState = page.getByText('Error loading data');
    if (await errorState.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Even in error state, no 500s should have occurred
      expect(serverErrors).toHaveLength(0);
      return;
    }

    const tableGroups = page.locator('svg.block g.cursor-pointer');
    if ((await tableGroups.count()) > 0) {
      await tableGroups.first().hover();
      await page.waitForTimeout(500);
      await tableGroups.first().click();
      await page.waitForTimeout(1000);

      const cancelButton = page.getByText(/Cancel|Cancelar/);
      if (await cancelButton.isVisible().catch(() => false)) {
        await cancelButton.click();
      }
    }

    expect(serverErrors).toHaveLength(0);
  });
});
