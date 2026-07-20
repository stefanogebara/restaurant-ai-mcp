import { test, expect } from '@playwright/test';

/**
 * Racha — Apple Pay / Google Pay na conta (trilho de carteira), contra o
 * deploy real. A sheet é a simulação de demo (o PSP real troca só o
 * authorize()); o que se prova aqui: botões nas convenções de plataforma,
 * valores certos com serviço, autorização → webhook → conta paga.
 *
 * Env: RACHA_BASE, RACHA_MESA2_TOKEN (Mesa 12 do seed: R$ 183,80 aberta).
 */

const BASE = process.env.RACHA_BASE || '';
const MESA2 = process.env.RACHA_MESA2_TOKEN || '';

test.use({ viewport: { width: 390, height: 844 } });

test('carteira: Google Pay paga a parte com serviço, conta registra', async ({ page }) => {
  test.setTimeout(150_000);
  if (!BASE || !MESA2) throw new Error('RACHA_BASE / RACHA_MESA2_TOKEN obrigatórios');

  await page.goto(`${BASE}/?t=${MESA2}`);
  await expect(page.getByText('Moqueca de peixe')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/183,80/).first()).toBeVisible();

  // Os dois botões existem; em Chromium/Windows o Google vem primeiro.
  const gpay = page.locator('.walletbtn.gpay');
  const apple = page.locator('.walletbtn.apple');
  await expect(gpay).toBeVisible();
  await expect(apple).toBeVisible();
  await page.screenshot({ path: 'e2e-artifacts/racha-house/09-botoes-carteira.png', fullPage: true });

  // Split igual ×2 com serviço de 10%: 91,90 + 9,19 = 101,09.
  await gpay.click();
  const sheet = page.locator('.sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Google Pay')).toBeVisible();
  await expect(sheet.getByText(/101,09/).first()).toBeVisible();
  await expect(sheet.getByText(/9,19 de serviço/)).toBeVisible();
  await expect(sheet.getByText(/simulação \(demo\)/)).toBeVisible();
  await page.screenshot({ path: 'e2e-artifacts/racha-house/10-sheet-gpay.png', fullPage: true });

  await sheet.getByRole('button', { name: /Pagar R\$\s?101,09/ }).click();

  // Autorizou → webhook confirmou → tela de pago com o progresso real
  // (paidCents conta só o consumo; a gorjeta é remuneração, fica fora).
  await expect(page.getByText('Pagamento confirmado')).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/91,90 de .*183,80 pagos/)).toBeVisible();
  await page.screenshot({ path: 'e2e-artifacts/racha-house/11-pago-carteira.png', fullPage: true });
});
