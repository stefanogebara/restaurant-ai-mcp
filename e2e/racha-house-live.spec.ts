import { test, expect, Page } from '@playwright/test';

/**
 * Racha — saldo da casa (House Accounts v1), jornada completa do cliente
 * contra o deploy REAL (ou o stack local — controlado por RACHA_BASE).
 *
 * Pré-requisitos (o runner injeta via env):
 *   RACHA_BASE          ex.: https://racha-gray.vercel.app
 *   RACHA_WALLET_TOKEN  carteira seedada com R$100 + R$15 de bônus
 *   RACHA_MESA_TOKEN    mesa com conta aberta de R$213,10 (seed do dev-server)
 *
 * Os tokens vêm de um seed fresco (dev-server.js) gravado no MESMO Supabase
 * que o deploy usa — a jornada roda contra dados reais de produção.
 */

const BASE = process.env.RACHA_BASE || '';
const WALLET = process.env.RACHA_WALLET_TOKEN || '';
const MESA = process.env.RACHA_MESA_TOKEN || '';

// Pular, nao falhar: sem config este e um teste de OUTRO projeto que nao
// tem por que derrubar a suite deste repositorio.
test.skip(!BASE || !WALLET || !MESA,
  'racha nao configurado — defina RACHA_BASE / RACHA_WALLET_TOKEN / RACHA_MESA_TOKEN');

const SHOT_DIR = 'e2e-artifacts/racha-house';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 390, height: 844 } }); // mobile-first, como na mesa

test.beforeAll(() => {
  if (!BASE || !WALLET || !MESA) {
    throw new Error('RACHA_BASE / RACHA_WALLET_TOKEN / RACHA_MESA_TOKEN são obrigatórios');
  }
});

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

test('jornada completa: carteira → recarga Pix → pagar a conta com saldo', async ({ page }) => {
  test.setTimeout(180_000);

  // --- 1. Carteira: estado inicial + cópia legal obrigatória (CDC) ---------
  await page.goto(`${BASE}/carteira?t=${WALLET}`);
  await expect(page.locator('.bigmoney')).toHaveText(/115,00/, { timeout: 20_000 });
  await expect(page.getByText('não expira e é reembolsável').first()).toBeVisible();
  await expect(page.getByText('Bônus promocional').first()).toBeVisible();
  await expect(page.getByText(/expira em \d{2}\/\d{2}\/\d{4}/).first()).toBeVisible();
  await expect(page.getByText(/Válido somente no/).first()).toBeVisible();
  await shot(page, '01-carteira-inicial');

  // --- 2. Recarga de R$50: bônus cotado + validade divulgada ---------------
  await page.getByRole('button', { name: /^R\$\s?50,00$/ }).click();
  await page.getByRole('button', { name: /Carregar R\$\s?50,00/ }).click();
  await expect(page.getByText(/7,50 de bônus/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/válido por 90 dias/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Copiar código Pix/ })).toBeVisible();
  await shot(page, '02-pix-recarga');

  // --- 3. Banco confirma (webhook real via demo) → saldo cresce ------------
  await page.getByRole('button', { name: /Simular confirmação do banco/ }).click();
  await expect(page.locator('.bigmoney')).toHaveText(/172,50/, { timeout: 20_000 });
  await shot(page, '03-carteira-pos-recarga');

  // --- 4. Tela da conta: itens reais + botão de saldo com o valor certo ----
  await page.goto(`${BASE}/?t=${MESA}`);
  await expect(page.getByText('Picanha na chapa')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/213,10/).first()).toBeVisible();
  const saldoBtn = page.getByRole('button', { name: /Pagar com saldo/ });
  await expect(saldoBtn).toBeVisible({ timeout: 20_000 });
  await expect(saldoBtn).toContainText('172,50');
  await shot(page, '04-conta-com-botao-saldo');

  // --- 5. Redeem de R$60: bônus primeiro, gorjeta fora do crédito ----------
  await saldoBtn.click();
  await expect(page.getByText(/172,50 disponível/)).toBeVisible();
  await expect(page.getByText(/gorjeta.*Pix/i)).toBeVisible();
  const amount = page.locator('#saldo-valor');
  await amount.fill('60,00');
  await page.getByRole('button', { name: /Pagar R\$\s?60,00 com saldo/ }).click();

  await expect(page.getByText('Pago com saldo')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/22,50 do bônus/)).toBeVisible();
  await expect(page.getByText(/37,50 do saldo pago/)).toBeVisible();
  await shot(page, '05-pago-com-saldo');

  // --- 6. Volta pra conta: pagamento registrado no ledger da mesa ----------
  await page.getByRole('button', { name: /voltar pra conta/ }).click();
  await expect(page.getByText(/60,00 já pagos/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/153,10/)).toBeVisible();
  await shot(page, '06-conta-parcial');

  // --- 7. Carteira final: débito único, extrato com sinais certos ----------
  await page.goto(`${BASE}/carteira?t=${WALLET}`);
  await expect(page.locator('.bigmoney')).toHaveText(/112,50/, { timeout: 20_000 });
  await expect(page.getByText('Pagamento na mesa').first()).toBeVisible();
  await expect(page.getByText(/7,50 de bônus/).first()).toBeVisible(); // sublinha da recarga
  await expect(page.getByText('Bônus promocional')).toHaveCount(0);     // bônus todo consumido
  await shot(page, '07-carteira-final');
});

test('guarda de UI: valor acima do saldo desarma o botão', async ({ page }) => {
  test.setTimeout(90_000);

  // Estabelece o vínculo carteira↔restaurante neste contexto novo.
  await page.goto(`${BASE}/carteira?t=${WALLET}`);
  await expect(page.locator('.bigmoney')).toHaveText(/112,50/, { timeout: 20_000 });

  await page.goto(`${BASE}/?t=${MESA}`);
  const saldoBtn = page.getByRole('button', { name: /Pagar com saldo/ });
  await expect(saldoBtn).toBeVisible({ timeout: 20_000 });
  await saldoBtn.click();

  const amount = page.locator('#saldo-valor');
  await amount.fill('200,00'); // > saldo (112,50) → CTA desarmado, sem "R$ NaN"
  const cta = page.getByRole('button', { name: /com saldo$/ });
  await expect(cta).toBeDisabled();
  await expect(cta).not.toContainText('NaN');

  await amount.fill('valor inválido'); // lixo → parse null → desarmado
  await expect(cta).toBeDisabled();
  await expect(cta).not.toContainText('NaN');
  await shot(page, '08-guarda-desarmada');
});
