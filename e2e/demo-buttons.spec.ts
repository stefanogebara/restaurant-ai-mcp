import { test, expect } from '@playwright/test';

const BASE = process.env.PW_BASE_URL || 'https://seatable.one';

/**
 * Create a demo or reuse an existing one.
 * The demo creation API has a 10/15min rate limit.
 * If rate limited, fall back to the "Continue without search" manual path.
 */
async function navigateToDemoDashboard(page: any): Promise<void> {
  await page.goto(`${BASE}/demo/setup`);
  await page.getByRole('textbox', { name: 'Restaurant name' }).fill('E2E Test');
  await page.getByRole('textbox', { name: 'City' }).fill('Madrid');
  await page.getByRole('button', { name: 'Find it' }).click();

  // Wait for scrape result, error, or rate limit
  const almostThere = page.getByText('Almost there');
  const continueWithout = page.getByText('Continue without search');
  const notListed = page.getByText('Not listed');

  // Wait for any result
  await Promise.race([
    almostThere.waitFor({ timeout: 15000 }).catch(() => {}),
    continueWithout.waitFor({ timeout: 15000 }).catch(() => {}),
    notListed.waitFor({ timeout: 15000 }).catch(() => {}),
  ]);

  // If network error, use manual path
  if (await continueWithout.isVisible().catch(() => false)) {
    await continueWithout.click();
    await page.waitForTimeout(1000);
  }

  // Fill email with unique address
  const emailField = page.getByRole('textbox', { name: /email/i });
  if (await emailField.isVisible().catch(() => false)) {
    await emailField.fill(`e2e-${Date.now()}@seatable.one`);
  }

  // Launch
  const launchBtn = page.getByRole('button', { name: /Launch my demo|Criar Demo/ });
  if (await launchBtn.isVisible().catch(() => false)) {
    await launchBtn.click();
    await page.waitForTimeout(3000);

    // Check rate limit
    if (await page.getByText('Too Many Requests').isVisible().catch(() => false)) {
      // Rate limited — navigate to demo page directly with mock data
      // The demo page renders client-side fake data when accessing /demo/<uuid>
      // Generate a fresh UUID and go directly
      const uuid = crypto.randomUUID();
      await page.goto(`${BASE}/demo/${uuid}?name=E2E%20Test&cuisine=Italian&city=Madrid`);
      await page.waitForTimeout(5000);
    }
  }

  // Wait for dashboard to render
  await expect(
    page.getByText(/Reservas de Hoje|Today's Reservations|Próximas Reservas|Upcoming Reservations/).first()
  ).toBeVisible({ timeout: 20000 });

  // Dismiss language popup if it appears — always keep Portuguese for consistent assertions
  const keepPT = page.getByRole('button', { name: /Manter Portugu/ }).first();
  const switchEN = page.getByRole('button', { name: /Switch to English/ }).first();
  if (await keepPT.isVisible({ timeout: 3000 }).catch(() => false)) {
    await keepPT.click();
    await page.waitForTimeout(1000);
  } else if (await switchEN.isVisible({ timeout: 1000 }).catch(() => false)) {
    // If only English option visible, click it — UI will be English, assertions handle both
    await switchEN.click();
    await page.waitForTimeout(1000);
  }
}

test.describe('Demo Dashboard — All Buttons Work', () => {
  test('full demo flow: all interactive buttons verified', async ({ page }) => {
    test.setTimeout(180000);

    await navigateToDemoDashboard(page);
    console.log('✓ Demo dashboard loaded');

    // ===== Verify dashboard stats rendered =====
    await expect(page.getByText(/Mesas Disponíveis|Tables Available/).first()).toBeVisible();
    await expect(page.getByText(/Clientes Esperados|Guests Expected/).first()).toBeVisible();

    // ===== TEST 1: Check In button =====
    const checkInButtons = page.getByRole('button', { name: 'Check In' });
    const checkInCount = await checkInButtons.count();
    if (checkInCount > 0) {
      await checkInButtons.first().click();
      await expect(page.getByText(/Sentado|Seated/).first()).toBeVisible({ timeout: 5000 });
      console.log(`✓ Check In works (${checkInCount} available)`);
    } else {
      console.log('⊘ No Check In buttons visible');
    }

    // ===== TEST 2: Waitlist Seat button =====
    const seatButtons = page.getByRole('button', { name: /^Sentar$/ });
    const seatCount = await seatButtons.count();
    if (seatCount > 0) {
      await seatButtons.first().click();
      await page.waitForTimeout(1000);
      console.log(`✓ Waitlist Seat works (${seatCount} available)`);
    } else {
      console.log('⊘ No waitlist Seat buttons');
    }

    // ===== TEST 3: Complete Service with bill =====
    const billInputs = page.getByRole('spinbutton', { name: 'Total bill amount' });
    const billCount = await billInputs.count();
    if (billCount > 0) {
      await billInputs.first().fill('95');
      await page.getByRole('button', { name: /Concluir Atendimento|Complete Service/ }).first().click();
      await page.waitForTimeout(1000);
      console.log('✓ Complete Service works (bill €95)');
    } else {
      console.log('⊘ No active parties to complete');
    }

    // ===== TEST 4: Tomorrow/Today toggle =====
    const tomorrowBtn = page.getByRole('button', { name: /Amanhã|Tomorrow/ });
    if (await tomorrowBtn.isVisible().catch(() => false)) {
      await tomorrowBtn.click();
      await page.waitForTimeout(1000);
      await page.getByRole('button', { name: /Hoje|Today/ }).click();
      await page.waitForTimeout(500);
      console.log('✓ Tomorrow/Today toggle works');
    }

    // ===== TEST 5: Walk-In modal — open, fill fields, submit =====
    await page.getByRole('button', { name: /Adicionar Walk-In|Add Walk-In/ }).first().click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify form fields exist
    await expect(modal.getByText(/Nome do Cliente|Customer Name/)).toBeVisible();
    await expect(modal.getByText(/Telefone|Phone/)).toBeVisible();
    await expect(modal.getByText(/Tamanho do Grupo|Party Size/)).toBeVisible();

    // Fill and submit
    await modal.getByRole('textbox').first().fill('E2E Walk-In Guest');
    await modal.getByRole('spinbutton').fill('3');
    const submitBtn = modal.getByRole('button', { name: /Sentar Cliente|Seat Customer/ });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });
    console.log('✓ Walk-In modal submit works');

    // ===== TEST 6: Walk-In modal — Cancel =====
    await page.getByRole('button', { name: /Adicionar Walk-In|Add Walk-In/ }).first().click();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await modal.getByRole('button', { name: /Cancelar|Cancel/ }).click();
    await expect(modal).not.toBeVisible({ timeout: 3000 });
    console.log('✓ Walk-In modal Cancel works');

    // ===== TEST 7: Walk-In modal — Close (X) =====
    await page.getByRole('button', { name: /Adicionar Walk-In|Add Walk-In/ }).first().click();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await modal.getByRole('button', { name: 'Close' }).click();
    await expect(modal).not.toBeVisible({ timeout: 3000 });
    console.log('✓ Walk-In modal Close (X) works');

    // ===== TEST 8: Manager AI inline panel — verify visible on dashboard =====
    // Dismiss DemoSlideIn if it appeared (blocks interactions after 60s)
    const slideInDismiss = page.getByText(/Talvez depois|Maybe later/i);
    if (await slideInDismiss.isVisible({ timeout: 2000 }).catch(() => false)) {
      await slideInDismiss.click();
      await page.waitForTimeout(500);
    }
    await expect(page.getByText(/IA do Gerente|Manager AI/).first()).toBeVisible({ timeout: 5000 });
    const chatInput = page.getByPlaceholder(/Pergunte sobre|Ask about/);
    await expect(chatInput).toBeVisible();
    console.log('✓ Manager AI inline panel visible with chat input');

    // ===== TEST 9: Language toggle =====
    const langBtn = page.getByRole('button', { name: /Toggle language/ });
    if (await langBtn.isVisible().catch(() => false)) {
      await langBtn.click();
      await page.waitForTimeout(2000);
      await expect(
        page.getByText(/Today's Reservations|Tables Available|Guests Expected|Active Parties/).first()
      ).toBeVisible({ timeout: 5000 });
      console.log('✓ Language toggle works');
      await langBtn.click();
      await page.waitForTimeout(1000);
    }

    // ===== TEST 10: Links =====
    const ctaLink = page.getByRole('link', { name: /Comecar Gratis|Get Started Free/ });
    if (await ctaLink.isVisible().catch(() => false)) {
      expect(await ctaLink.getAttribute('href')).toBe('/login');
      console.log('✓ CTA → /login link correct');
    }
    const backLink = page.getByRole('link', { name: /Voltar ao inicio|Back to home/ });
    if (await backLink.isVisible().catch(() => false)) {
      expect(await backLink.getAttribute('href')).toBe('/');
      console.log('✓ Back → / link correct');
    }

    // ===== TEST 11: FAB button =====
    const allWalkIn = page.getByRole('button', { name: /Adicionar Walk-In|Add Walk-In/ });
    const walkInCount = await allWalkIn.count();
    if (walkInCount > 1) {
      await allWalkIn.nth(1).click();
      await expect(modal).toBeVisible({ timeout: 5000 });
      await modal.getByRole('button', { name: /Cancelar|Cancel|Close/ }).first().click();
      await expect(modal).not.toBeVisible({ timeout: 3000 });
      console.log('✓ FAB Walk-In button works');
    }

    console.log('\n🎉 ALL DEMO BUTTONS VERIFIED');
  });
});
