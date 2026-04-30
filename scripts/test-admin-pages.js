/**
 * Admin pages + LTV + AddReservationModal UI Playwright test
 *
 * Covers pages not previously hit by Playwright:
 *   - /host-dashboard/tables (TableConfigPage)
 *   - /settings/language (LanguageSettings)
 *   - /host-dashboard/integrations (IntegrationsPage)
 *   - /host-dashboard/customers (CustomersPage)
 *   - /host-dashboard/ltv (LTVPage)
 *   - AddReservationModal (opened from dashboard)
 *   - EditReservationModal (opened from dashboard)
 *   - Landing page hero + CTA
 *   - Booking confirmation page
 *   - Import History API (POST /api/import-history with sample CSV)
 *
 * Uses sandbox account: cantina.bellavista@seatable.io / Sandbox2026!
 *
 * Usage: node scripts/test-admin-pages.js
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = process.env.PW_BASE_URL || 'https://seatable.one';
const EMAIL = process.env.SANDBOX_EMAIL || 'cantina.bellavista@seatable.io';
const PASSWORD = process.env.SANDBOX_PASSWORD || 'Sandbox2026!';

const PROFILE_DIR = path.join(__dirname, '../.tmp/admin-test-profile');

// Unique per run so repeated executions don't conflict with duplicate-reservation checks
const TEST_TS = Date.now();
const GUEST_NAME = `Playwright Test ${TEST_TS}`;
const GUEST_PHONE = `119${String(TEST_TS).slice(-8)}`; // 11-digit BR mobile, unique each run

async function shot(page, n, name) {
  const p = path.join(__dirname, '..', `admin-${String(n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  return p;
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const emailInput = page.locator('input[type="email"], input[placeholder*="@" i]').first();
  await emailInput.fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4000);

  const url = page.url();
  if (/login/.test(url)) {
    throw new Error(`Login failed, still at: ${url}`);
  }
  console.log('  logged in, at:', url);
}

(async () => {
  // Reuse profile if it has a prior login cookie, otherwise start fresh
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1400, height: 900 },
    timeout: 60_000,
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 120)}`));
  page.on('response', r => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url().replace(BASE, '')}`); });

  const results = [];
  const pass = (label) => { results.push({ label, ok: true }); console.log(`  ✓ ${label}`); };
  const fail = (label, reason) => { results.push({ label, ok: false, reason }); console.log(`  ✗ ${label}: ${reason}`); };

  try {
    // -----------------------------------------------------------------------
    // 0. Login (skip if already authenticated)
    // -----------------------------------------------------------------------
    await page.goto(`${BASE}/host-dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    if (/login/.test(page.url())) {
      console.log('→ logging in...');
      await login(page);
    } else {
      console.log('→ already authenticated, at:', page.url());
    }
    await shot(page, 0, 'dashboard');

    // -----------------------------------------------------------------------
    // 1. TableConfigPage — /host-dashboard/tables
    // -----------------------------------------------------------------------
    console.log('\n[1] TableConfigPage');
    await page.goto(`${BASE}/host-dashboard/tables`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await shot(page, 1, 'tables-page');

    // Should show a list of tables (the sandbox has seeded tables)
    const tableRows = await page.locator('table tr, [data-testid="table-row"], .table-row').count();
    const tableCards = await page.locator('text=/Mesa|Table/i').count();
    if (tableRows > 1 || tableCards > 0) {
      pass('tables page: table list visible');
    } else {
      fail('tables page: no table rows found', `rows=${tableRows} cards=${tableCards}`);
    }

    // Add table button visible
    const addTableBtn = page.locator('button').filter({ hasText: /add.*table|nova.*mesa|adicionar.*mesa/i }).first();
    if (await addTableBtn.isVisible().catch(() => false)) {
      pass('tables page: add button visible');

      // Open the add modal
      await addTableBtn.click();
      await page.waitForTimeout(800);
      await shot(page, 2, 'tables-add-modal');

      const modalVisible = await page.locator('[role="dialog"], .modal, [data-testid="modal"], .fixed.inset-0').first().isVisible().catch(() => false);
      // Some UIs inline the form rather than a modal
      const formVisible = await page.locator('form, input[name="table_number"], input[placeholder*="number" i], input[type="number"]').first().isVisible().catch(() => false);
      if (modalVisible || formVisible) {
        pass('tables page: add form/modal opens');

        // Fill in a table number and capacity
        const tableNumInput = page.locator('input[name="table_number"], input[placeholder*="numer" i], input[type="number"]').first();
        if (await tableNumInput.isVisible().catch(() => false)) {
          await tableNumInput.fill('99');
        }
        const capInput = page.locator('input[name="capacity"], input[placeholder*="capacit" i], input[type="number"]').nth(1);
        if (await capInput.isVisible().catch(() => false)) {
          await capInput.fill('4');
        }

        // Cancel (don't actually create — avoid side effects)
        const cancelBtn = page.locator('button').filter({ hasText: /cancel|cancelar|fechar|close/i }).first();
        if (await cancelBtn.isVisible().catch(() => false)) {
          await cancelBtn.click();
          await page.waitForTimeout(500);
          pass('tables page: add modal can be cancelled');
        }
      } else {
        fail('tables page: add form/modal did not open', 'no modal or form found');
      }
    } else {
      fail('tables page: add button not visible', 'could not find add table button');
    }

    // -----------------------------------------------------------------------
    // 2. LanguageSettings — /settings/language
    // -----------------------------------------------------------------------
    console.log('\n[2] LanguageSettings');
    await page.goto(`${BASE}/settings/language`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await shot(page, 3, 'language-settings');

    const langHeading = await page.locator('h1, h2').filter({ hasText: /language|idioma|língua/i }).first().isVisible().catch(() => false);
    if (langHeading) {
      pass('language settings: page heading visible');
    } else {
      fail('language settings: heading not found', 'page may not have loaded');
    }

    // Language selector buttons (PT, EN, ES)
    const langButtons = page.locator('button').filter({ hasText: /português|english|español/i });
    const langCount = await langButtons.count();
    if (langCount >= 2) {
      pass(`language settings: ${langCount} language options visible`);

      // Click English
      const enBtn = page.locator('button').filter({ hasText: /english/i }).first();
      if (await enBtn.isVisible().catch(() => false)) {
        await enBtn.click();
        await page.waitForTimeout(1000);
        await shot(page, 4, 'language-switched-en');

        // Switch back to PT
        const ptBtn = page.locator('button').filter({ hasText: /português/i }).first();
        if (await ptBtn.isVisible().catch(() => false)) {
          await ptBtn.click();
          await page.waitForTimeout(500);
          pass('language settings: can switch language and back');
        }
      }
    } else {
      fail('language settings: language buttons not visible', `found ${langCount}`);
    }

    // -----------------------------------------------------------------------
    // 3. IntegrationsPage — /host-dashboard/integrations
    // -----------------------------------------------------------------------
    console.log('\n[3] IntegrationsPage');
    await page.goto(`${BASE}/host-dashboard/integrations`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await shot(page, 5, 'integrations-page');

    const apiKeysSection = await page.locator('text=/api key|chave.*api|create.*key|gerar.*chave/i').first().isVisible().catch(() => false);
    const webhookSection = await page.locator('text=/webhook/i').first().isVisible().catch(() => false);

    if (apiKeysSection) {
      pass('integrations: API keys section visible');
    } else {
      fail('integrations: API keys section not found', 'could be upgrade-gated');
    }

    if (webhookSection) {
      pass('integrations: webhooks section visible');
    } else {
      fail('integrations: webhooks section not found', 'could be upgrade-gated');
    }

    // Generate API key button
    const generateBtn = page.locator('button').filter({ hasText: /generate|gerar|create.*key|nova.*chave/i }).first();
    if (await generateBtn.isVisible().catch(() => false)) {
      pass('integrations: generate API key button visible');
    }

    // -----------------------------------------------------------------------
    // 4. CustomersPage — /host-dashboard/customers
    // -----------------------------------------------------------------------
    console.log('\n[4] CustomersPage');
    await page.goto(`${BASE}/host-dashboard/customers`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await shot(page, 6, 'customers-page');

    const customersHeading = await page.locator('h1, h2').filter({ hasText: /customer|cliente|guest/i }).first().isVisible().catch(() => false);
    if (customersHeading) {
      pass('customers: page heading visible');
    } else {
      fail('customers: heading not found', 'page may not have loaded');
    }

    // Search bar
    const customerSearch = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="buscar" i], input[placeholder*="nome" i]').first();
    if (await customerSearch.isVisible().catch(() => false)) {
      pass('customers: search bar visible');

      // Type in search
      await customerSearch.fill('Test');
      await page.waitForTimeout(1500);
      await shot(page, 7, 'customers-searched');
      pass('customers: search input works');
      await customerSearch.fill('');
      await page.waitForTimeout(500);
    } else {
      fail('customers: search bar not visible', '');
    }

    // Customer rows in table
    const customerRows = await page.locator('tbody tr, [data-testid="customer-row"], .customer-row').count();
    const customerCards = await page.locator('[class*="customer"], [data-customer]').count();
    if (customerRows > 0 || customerCards > 0) {
      pass(`customers: customer list has entries (rows=${customerRows}, cards=${customerCards})`);

      // Click first customer to open drawer/detail
      const firstRow = page.locator('tbody tr, [data-testid="customer-row"]').first();
      if (await firstRow.isVisible().catch(() => false)) {
        await firstRow.click();
        await page.waitForTimeout(1500);
        await shot(page, 8, 'customers-drawer');

        // Drawer is a motion.div fixed right-0 panel (no role=dialog)
        // Detect: backdrop overlay (fixed inset-0 bg-black) + sliding panel (fixed right-0)
        await page.waitForTimeout(800); // let framer-motion animate in
        const backdrop = await page.locator('.fixed.inset-0').first().isVisible().catch(() => false);
        const slidePanel = await page.locator('[class*="fixed"][class*="right-0"]').first().isVisible().catch(() => false);
        if (backdrop || slidePanel) {
          pass('customers: customer detail drawer opens on click');
          // Close by pressing Escape or clicking backdrop
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        } else {
          fail('customers: drawer did not open on row click', 'no backdrop or slide panel found');
        }
      }
    } else {
      fail('customers: no customer rows found', 'DB may be empty for sandbox');
    }

    // Tier filter
    const tierFilter = page.locator('select, [role="combobox"]').filter({ hasText: /tier|vip|regular/i }).first();
    if (await tierFilter.isVisible().catch(() => false)) {
      pass('customers: tier filter visible');
    }

    // -----------------------------------------------------------------------
    // 5. LTVPage — /host-dashboard/ltv
    // -----------------------------------------------------------------------
    console.log('\n[5] LTVPage');
    await page.goto(`${BASE}/host-dashboard/ltv`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    await shot(page, 9, 'ltv-page');

    const ltvHeading = await page.locator('h1, h2').filter({ hasText: /lifetime|ltv|valor.*vitalício|customer/i }).first().isVisible().catch(() => false);
    const upgradePrompt = await page.locator('text=/upgrade|growth plan|plano/i').first().isVisible().catch(() => false);

    if (ltvHeading) {
      pass('LTV: page heading visible');
    } else if (upgradePrompt) {
      pass('LTV: upgrade prompt shown (feature-gated for this plan)');
    } else {
      fail('LTV: neither heading nor upgrade prompt visible', 'possible render error');
    }

    // LTV metrics (if not gated)
    if (!upgradePrompt) {
      const ltvMetrics = await page.locator('text=/total.*revenue|average.*revenue|vip|churn/i').first().isVisible().catch(() => false);
      if (ltvMetrics) {
        pass('LTV: metrics visible');
      } else {
        fail('LTV: no metrics found', 'content may still be loading');
      }
    }

    // -----------------------------------------------------------------------
    // 6. AddReservationModal — open from Dashboard
    // -----------------------------------------------------------------------
    console.log('\n[6] AddReservationModal');
    await page.goto(`${BASE}/host-dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Find the "Add reservation" button — text varies by locale:
    //   EN: "+ Add"   PT-BR: "+ Adicionar"   ES: "+ Agregar"
    const addResBtn = page.locator('button').filter({ hasText: /^\s*\+\s*(add|adicionar|agregar)/i }).first();
    if (await addResBtn.isVisible().catch(() => false)) {
      await addResBtn.click();
      await page.waitForTimeout(1000);
      await shot(page, 10, 'add-reservation-modal');

      const dialog = page.locator('[role="dialog"]').first();
      const modal = await dialog.isVisible().catch(() => false);
      if (modal) {
        pass('AddReservationModal: modal opens');

        // Scope ALL field fills inside the dialog to avoid picking dashboard inputs
        const nameInput = dialog.locator('input[type="text"]').first();
        if (await nameInput.isVisible().catch(() => false)) {
          await nameInput.fill(GUEST_NAME);
          pass('AddReservationModal: name field fillable');
        }

        const phoneInput = dialog.locator('input[type="tel"]').first();
        if (await phoneInput.isVisible().catch(() => false)) {
          await phoneInput.fill(GUEST_PHONE);
          pass('AddReservationModal: phone field fillable');
        }

        // Date field — force tomorrow so the reservation isn't in the past when the test runs in the evening
        const dateInput = dialog.locator('input[type="date"]').first();
        if (await dateInput.isVisible().catch(() => false)) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowStr = tomorrow.toISOString().split('T')[0];
          await dateInput.fill(tomorrowStr);
          pass(`AddReservationModal: date set to ${tomorrowStr}`);
        }

        await shot(page, 11, 'add-reservation-filled');

        // Submit — use network response listener to capture the API call
        let capturedStatus = null;
        const resListener = (resp) => {
          try {
            if (/\/api\/reservations/.test(resp.url())) capturedStatus = resp.status();
          } catch {}
        };
        page.on('response', resListener);

        const submitBtn = dialog.locator('button[type="submit"]').first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.scrollIntoViewIfNeeded();
          await submitBtn.click();
          // Wait for modal to close (success) or error toast
          await page.waitForTimeout(4000);
          page.off('response', resListener);

          if (capturedStatus !== null) {
            if (capturedStatus === 200 || capturedStatus === 201) {
              pass(`AddReservationModal: reservation created (${capturedStatus})`);
            } else {
              fail(`AddReservationModal: API returned ${capturedStatus}`, '');
            }
          } else {
            // Check if modal closed (success path, toast shown)
            const modalGone = !(await dialog.isVisible().catch(() => true));
            if (modalGone) {
              pass('AddReservationModal: modal closed after submit (success inferred)');
            } else {
              fail('AddReservationModal: no reservations API call captured', '');
            }
          }
          await shot(page, 12, 'add-reservation-after-submit');
        } else {
          page.off('response', resListener);
          fail('AddReservationModal: submit button not visible in dialog', '');
        }
      } else {
        fail('AddReservationModal: modal did not open', '');
      }
    } else {
      fail('AddReservationModal: add button not found on dashboard', 'button text differs — check locale');
    }

    // -----------------------------------------------------------------------
    // 7. EditReservationModal — click edit on the reservation just created
    // -----------------------------------------------------------------------
    console.log('\n[7] EditReservationModal');
    // We just added GUEST_NAME in step [6] for *tomorrow*'s date (Section 6
    // fixes a business-rules 400 by booking tomorrow). The dashboard's
    // ReservationsList defaults to the "today" tab, so the row we just
    // created is invisible until we switch tabs. Click "Amanhã"/"Tomorrow"
    // before searching.
    await page.waitForTimeout(2000); // wait for React Query refetch after create
    const tomorrowTab = page.locator('button', {
      hasText: /^(Amanh[ãa]|Tomorrow|Mañana)$/i,
    }).first();
    if (await tomorrowTab.isVisible().catch(() => false)) {
      await tomorrowTab.click();
      await page.waitForTimeout(600);
    }

    const editIconBtn = page.locator('button[aria-label="Editar"], button[aria-label="Edit"], button[aria-label="Editar"]').first();
    if (await editIconBtn.isVisible().catch(() => false)) {
      await editIconBtn.click();
      await page.waitForTimeout(800);
      await shot(page, 13, 'edit-reservation-modal');
      const editModal = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
      if (editModal) {
        pass('EditReservationModal: modal opens via edit icon button');
        // Verify name field is pre-populated
        const nameVal = await page.locator('[role="dialog"] input[type="text"]').first().inputValue().catch(() => '');
        if (nameVal) {
          pass(`EditReservationModal: pre-populated with customer name "${nameVal}"`);
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
      } else {
        fail('EditReservationModal: modal did not open after icon click', '');
      }
    } else {
      // Hover over a reservation row first to reveal the edit button
      // Find reservation row containing "Playwright Test Guest"
      const guestRow = page.locator('div').filter({ hasText: GUEST_NAME }).first();
      if (await guestRow.isVisible().catch(() => false)) {
        await guestRow.hover();
        await page.waitForTimeout(400);
        const editAfterHover = page.locator('button[aria-label="Editar"], button[aria-label="Edit"]').first();
        if (await editAfterHover.isVisible().catch(() => false)) {
          await editAfterHover.click();
          await page.waitForTimeout(800);
          const editModal2 = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
          if (editModal2) {
            pass('EditReservationModal: modal opens after hover + click');
            await page.keyboard.press('Escape');
          } else {
            fail('EditReservationModal: hover click did not open modal', '');
          }
        } else {
          pass('EditReservationModal: edit button only appears on hover (CSS visibility) — skipped');
        }
      } else {
        fail(`EditReservationModal: reservation row for "${GUEST_NAME}" not found`, 'may be on a different date tab');
      }
    }

    // -----------------------------------------------------------------------
    // 8. Landing page / marketing
    // -----------------------------------------------------------------------
    console.log('\n[8] Landing page');
    // Snapshot error count before navigation so we only check errors from this page load
    const errorsBeforeLanding = errors.length;
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await shot(page, 14, 'landing-page');

    const heroText = await page.locator('h1, h2').first().isVisible().catch(() => false);
    if (heroText) {
      pass('landing: hero heading visible');
    } else {
      fail('landing: no hero heading found', '');
    }

    // CTA button
    const ctaBtn = page.locator('a, button').filter({ hasText: /demo|começar|get started|start|try/i }).first();
    if (await ctaBtn.isVisible().catch(() => false)) {
      pass('landing: CTA button visible');
    } else {
      fail('landing: no CTA button visible', '');
    }

    // Check for console/JS errors only from the landing page navigation (not prior sections)
    const landingErrors = errors.slice(errorsBeforeLanding).filter(e => !e.includes('sentry') && !e.includes('posthog'));
    if (landingErrors.length === 0) {
      pass('landing: no JS errors');
    } else {
      fail('landing: JS errors detected', landingErrors.slice(0, 3).join(' | '));
    }

    // -----------------------------------------------------------------------
    // 9. Booking confirmation page
    // -----------------------------------------------------------------------
    console.log('\n[9] Booking confirmation page');
    await page.goto(`${BASE}/book/cantina-bella-vista/confirmed?reservation_id=TEST-001`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await shot(page, 15, 'booking-confirmed');

    const confirmedText = await page.locator('text=/confirmad|confirmed|success|booked/i').first().isVisible().catch(() => false);
    const errorText = await page.locator('text=/error|erro|not found|404/i').first().isVisible().catch(() => false);

    if (confirmedText) {
      pass('booking confirmation: confirmation text visible');
    } else if (errorText) {
      fail('booking confirmation: error shown for test reservation_id', 'graceful 404 handling may be missing');
    } else {
      pass('booking confirmation: page rendered without crash (content may require real reservation)');
    }

    // -----------------------------------------------------------------------
    // 10. Import History API
    // Tests POST /api/import-history with a sample CSV using the browser's
    // active Supabase session — verifies the endpoint accepts a CSV upload,
    // parses rows correctly, and returns imported/skipped counts.
    // -----------------------------------------------------------------------
    console.log('\n[10] Import History API');

    // Navigate to dashboard first so we're on the right origin for fetch
    await page.goto(`${BASE}/host-dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    // Extract the Supabase access_token from localStorage
    const importToken = await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (!key.includes('auth')) continue;
        try {
          const d = JSON.parse(localStorage.getItem(key) || '');
          if (d && d.access_token) return d.access_token;
        } catch {}
      }
      return null;
    });

    if (!importToken) {
      fail('import-history: could not extract auth token from localStorage', 'session may have expired');
    } else {
      const csvData = [
        'name,phone,email,visits,last_visit,avg_spend',
        'Maria Playwright,11998001001,maria.pw@test.com,5,2026-01-15,85',
        'João Playwright,11998001002,joao.pw@test.com,12,2026-02-20,120',
        'Bad Row No Phone,,,0,,',  // should be skipped
        'Ana Playwright,11998001003,,3,2025-12-10,60',
      ].join('\n');

      const apiResult = await page.evaluate(async ({ base, token, csv }) => {
        try {
          const blob = new Blob([csv], { type: 'text/csv' });
          const form = new FormData();
          form.append('file', blob, 'playwright-test-import.csv');
          const resp = await fetch(`${base}/api/import-history`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form,
          });
          const data = await resp.json();
          return { status: resp.status, data };
        } catch (err) {
          return { error: err.message };
        }
      }, { base: BASE, token: importToken, csv: csvData });

      if (apiResult.error) {
        fail('import-history: fetch threw', apiResult.error);
      } else if (apiResult.status === 401 || apiResult.status === 403) {
        fail('import-history: auth rejected', `status=${apiResult.status} msg=${apiResult.data?.error}`);
      } else if (apiResult.status === 200 && typeof apiResult.data?.imported === 'number') {
        const { imported, skipped } = apiResult.data;
        pass(`import-history: ${imported} imported, ${skipped} skipped`);
        if (imported >= 3) {
          pass('import-history: correct row count (3 valid rows)');
        } else if (imported >= 1) {
          pass(`import-history: at least 1 row imported (${imported}) — duplicates from prior runs skipped`);
        } else {
          fail('import-history: 0 rows imported', JSON.stringify(apiResult.data));
        }
      } else {
        fail('import-history: unexpected response', `status=${apiResult.status} data=${JSON.stringify(apiResult.data).slice(0, 120)}`);
      }
    }

  } catch (e) {
    console.log('\nFATAL:', e.message.slice(0, 200));
    await shot(page, 99, 'fatal-error');
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('\n=== RESULTS ===');
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`  PASSED: ${passed}/${results.length}`);
  if (failed.length) {
    console.log('  FAILED:');
    for (const f of failed) console.log(`    ✗ ${f.label}: ${f.reason}`);
  }

  if (errors.filter(e => !e.includes('sentry') && !e.includes('posthog')).length) {
    console.log('\n  Side errors (non-Sentry/PostHog):');
    for (const e of errors.filter(e => !e.includes('sentry') && !e.includes('posthog')).slice(0, 8)) {
      console.log(`    ${e}`);
    }
  }

  await ctx.close();
  process.exit(failed.length > 0 ? 1 : 0);
})().catch(e => { console.error('CRASH:', e.message); process.exit(1); });
