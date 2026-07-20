import { test, expect } from '@playwright/test';

/**
 * Racha — jornada do link de demonstração ESTÁVEL (/?t=demoracha) contra o
 * deploy real com Pagar.me em test mode. Diferente das suítes anteriores,
 * aqui NÃO há simulação nossa: o Pix é cobrado no gateway real e o provedor
 * Simulador auto-paga (<R$500) → webhook charge.paid → ledger — o mesmo
 * caminho de produção, de ponta a ponta, começando pela landing.
 *
 * Higiene do fixture: paga só R$ 5,00 (sem serviço) pra não esgotar a conta
 * demo de R$ 213,10 rápido demais.
 */

const BASE = process.env.RACHA_BASE || 'https://racha-gray.vercel.app';
const MESA = 'demoracha';
const SHOT = 'e2e-artifacts/racha-house';

test.use({ viewport: { width: 390, height: 844 } });

test('landing → demo ao vivo → Pix REAL auto-pago aparece na conta', async ({ page, request }) => {
  test.setTimeout(150_000);

  // --- landing: primeira impressão tem CTA, entrada do dono e CNPJ ---------
  await page.goto(`${BASE}/`);
  await expect(page.getByText('A conta da mesa, resolvida no Pix.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: /Sou restaurante/ })).toBeVisible();
  await expect(page.getByText(/CNPJ 65\.087\.663/)).toBeVisible();
  await page.screenshot({ path: `${SHOT}/12-landing.png`, fullPage: true });

  // estado do fixture ANTES (runs anteriores acumulam pagamentos)
  const before = (await (await request.get(`${BASE}/api/check?t=${MESA}`)).json()).data.state;
  expect(before.status).not.toBe('fechada');
  expect(before.totalCents - before.paidCents).toBeGreaterThanOrEqual(600); // fixture ainda serve

  // --- CTA leva pra conta da mesa demo -------------------------------------
  await page.getByRole('link', { name: /demonstração ao vivo/ }).click();
  await expect(page.getByText('Bar do Racha — demonstração')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Picanha na chapa')).toBeVisible();
  await expect(page.getByText(/213,10/).first()).toBeVisible();
  await expect(page.locator('.walletbtn.gpay')).toBeVisible(); // Google Pay real presente
  await page.screenshot({ path: `${SHOT}/13-demo-conta.png`, fullPage: true });

  // --- parte customizada de R$ 5,00, serviço desligado ----------------------
  await page.getByRole('tab', { name: 'Outro valor' }).click(); // modes são tablist, não buttons
  await page.locator('#valor').fill('5,00');
  const servico = page.locator('.servico input');
  if (await servico.isChecked()) await servico.uncheck();
  // CPF: o adquirente exige documento do pagador em todo método (BR).
  await page.getByPlaceholder(/CPF/).fill('390.533.447-05');
  await page.getByRole('button', { name: /Pagar R\$\s?5,00 com Pix/ }).click();

  // --- cobrança Pix REAL criada no gateway ----------------------------------
  await expect(page.getByText('Pague com Pix')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('.bigmoney')).toHaveText(/5,00/);
  await expect(page.getByRole('button', { name: /Copiar código Pix/ })).toBeVisible();
  await page.screenshot({ path: `${SHOT}/14-pix-real.png`, fullPage: true });

  // --- Simulador paga sozinho → webhook → ledger cresce ---------------------
  const target = before.paidCents + 500;
  await expect
    .poll(async () => (await (await request.get(`${BASE}/api/check?t=${MESA}`)).json()).data.state.paidCents,
      { timeout: 60_000, intervals: [3_000] })
    .toBeGreaterThanOrEqual(target);

  // --- e a UI reflete: volta pra conta e o progresso mostra o pago ----------
  await page.getByRole('button', { name: /voltar pra conta/ }).click();
  await expect(page.getByText(/já pagos/)).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${SHOT}/15-demo-pago.png`, fullPage: true });
});
