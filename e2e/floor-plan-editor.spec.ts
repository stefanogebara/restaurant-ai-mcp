import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_STATE = path.join(__dirname, 'auth-state.json');
const hasAuthState = fs.existsSync(AUTH_STATE);

test.describe('Floor Plan Editor', () => {
  test.skip(!hasAuthState, 'Skipped: no auth-state.json — run `node e2e/generate-auth-state.js` first');
  test.use(hasAuthState ? { storageState: AUTH_STATE } : {});

  test.beforeEach(async ({ page }) => {
    await page.goto('/host-dashboard/floor-plan');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Skip if auth token expired and we got redirected to login
    if (page.url().includes('/login')) {
      test.skip(true, 'Auth token expired — regenerate with node e2e/generate-auth-state.js');
    }

    // Wait for the floor plan page heading
    await page.getByText(/Floor Plan/i).first().waitFor({ timeout: 15000 });
  });

  test('floor plan page loads with correct UI elements', async ({ page }) => {
    // Heading should be visible
    await expect(page.getByText(/Floor Plan/i).first()).toBeVisible();

    // Should have Add Table button or Link Tables button
    const addTableBtn = page.getByRole('button', { name: /Add Table/i });
    const linkTablesBtn = page.getByRole('button', { name: /Link Tables/i });

    const hasAddTable = await addTableBtn.isVisible().catch(() => false);
    const hasLinkTables = await linkTablesBtn.isVisible().catch(() => false);

    expect(hasAddTable || hasLinkTables).toBe(true);
  });

  test('floor plan shows status legend', async ({ page }) => {
    // Status legend should show Available, Occupied, Reserved, Cleaning
    const statusTexts = ['Available', 'Occupied', 'Reserved', 'Cleaning'];
    let foundCount = 0;

    for (const status of statusTexts) {
      const el = page.getByText(status, { exact: true });
      if (await el.isVisible().catch(() => false)) {
        foundCount++;
      }
    }

    // At least some status labels should be visible
    expect(foundCount).toBeGreaterThanOrEqual(2);
  });

  test('table SVG groups render when tables exist', async ({ page }) => {
    const canvasTables = page.locator('svg g.cursor-grab, svg g.cursor-pointer');
    const tableCount = await canvasTables.count();

    if (tableCount === 0) {
      // Empty state — no tables configured, valid scenario
      const emptyState = page.getByText(/No tables|Add Table/i);
      const isEmpty = await emptyState.first().isVisible().catch(() => false);
      expect(isEmpty).toBe(true);
      return;
    }

    await expect(canvasTables.first()).toBeVisible();
    const tableLabels = page.locator('svg text');
    expect(await tableLabels.count()).toBeGreaterThan(0);
  });

  test('empty state shows helpful message', async ({ page }) => {
    // If no tables, should show empty state with instructions
    const emptyState = page.getByText(/No tables|Add Table|start building/i);
    const hasEmptyOrContent = await emptyState.first().isVisible().catch(() => false);

    // Page should show either tables or empty state instructions
    const hasTables = await page.locator('svg g.cursor-grab, svg g.cursor-pointer').count();
    expect(hasEmptyOrContent || hasTables > 0).toBe(true);
  });

  test('moving a table shows autosave status (when tables exist)', async ({ page }) => {
    await page.waitForTimeout(2000);

    const canvasTables = page.locator('svg g.cursor-grab, svg g.cursor-pointer');
    const tableCount = await canvasTables.count();

    if (tableCount === 0) {
      // No tables to drag — verify empty state or add-table CTA
      const emptyState = page.getByText(/No tables|Add Table|start building/i);
      const isEmpty = await emptyState.first().isVisible().catch(() => false);
      expect(isEmpty).toBe(true);
      return;
    }

    const firstTable = canvasTables.first();
    await expect(firstTable).toBeVisible();

    const box = await firstTable.boundingBox();
    if (!box) throw new Error('Could not get table bounding box');

    await firstTable.hover();
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + 50);
    await page.mouse.up();

    const saveStatus = page.getByText(/Saving|Saved|Salvando|Salvo|Guardando|Guardado/i);
    await expect(saveStatus.first()).toBeVisible({ timeout: 10000 });
  });

  test('no 500 server errors during floor plan operations', async ({ page }) => {
    const serverErrors: string[] = [];

    page.on('response', response => {
      if (response.status() >= 500) {
        serverErrors.push(`${response.status()} - ${response.url()}`);
      }
    });

    await page.reload();
    await page.getByText(/Floor Plan/i).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check no server errors occurred
    expect(serverErrors).toHaveLength(0);
  });
});
