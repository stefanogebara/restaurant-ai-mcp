import { test, expect } from '@playwright/test';

/**
 * LIVE e2e — Itaim Bibi (São Paulo) discovery + real dispatch, through the UI.
 *
 * Exercises the one-click flow shipped in a0391c66: bairro search → funnel
 * line → "⚡ Disparar agora" (prefilled territory + day-budget-capped limit)
 * → single confirmation → real template sends. Runs against production with
 * the operator's auth state. REAL WhatsApp messages go out — that is the
 * point (explicit founder request, 2026-07-06).
 */

test.use({ storageState: 'e2e/auth-state-olimpia.json' });

test('Itaim Bibi: buscar → 1 clique → disparar de verdade', async ({ page }) => {
  test.setTimeout(300_000);

  await page.goto('https://seatable.one/olimpia', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Descobrir & Disparar' }).click();

  // Step 1 — bairro search (default mode). City defaults to São Paulo / SP.
  const bairroInput = page.getByPlaceholder('Jardins, Pinheiros…');
  await expect(bairroInput).toBeVisible({ timeout: 15_000 });
  await bairroInput.fill('Itaim Bibi');
  await page.getByRole('button', { name: /Buscar \(até 60/ }).click();

  // Funnel line lands when Places + inserts finish.
  const funil = page.getByText(/Última busca: \d+ restaurantes encontrados/);
  await expect(funil).toBeVisible({ timeout: 120_000 });
  const funilTexto = (await funil.textContent()) ?? '';
  console.log('FUNIL:', funilTexto.trim());
  await page.screenshot({ path: 'e2e-artifacts/itaim-1-busca.png', fullPage: true });

  // Day-budget hint under "Enviar até" (new UX).
  const hint = page.getByText(/hoje: \d+\/\d+ enviados/);
  await expect(hint).toBeVisible();
  console.log('SALDO:', ((await hint.textContent()) ?? '').trim());

  // One-click bridge: prefills territory + capped limit, opens confirmation.
  const quick = page.getByRole('button', { name: /⚡ Disparar agora para os \d+ com telefone de Itaim Bibi/ });
  await expect(quick).toBeVisible();
  console.log('QUICK:', ((await quick.textContent()) ?? '').trim());
  await quick.click();

  const confirmText = page.getByText(/Enviar mensagens REAIS para até \d+ restaurantes\?/);
  await expect(confirmText).toBeVisible();
  console.log('CONFIRM:', ((await confirmText.textContent()) ?? '').trim());
  await expect(page.getByPlaceholder('Pinheiros, Moema, SP…')).toHaveValue('Itaim Bibi');
  await page.screenshot({ path: 'e2e-artifacts/itaim-2-confirm.png', fullPage: true });

  // Fire. Server-side this is sequential template sends — allow up to 2 min.
  await page.getByRole('button', { name: 'Confirmar' }).click();
  const resultado = page.getByText(/Último disparo: \d+ mensagens enviadas/);
  await expect(resultado).toBeVisible({ timeout: 150_000 });
  const resultadoTexto = ((await resultado.textContent()) ?? '').trim();
  console.log('RESULTADO:', resultadoTexto);
  await page.screenshot({ path: 'e2e-artifacts/itaim-3-resultado.png', fullPage: true });

  // Real sends must be acknowledged: the dry-run marker must NOT be present.
  expect(resultadoTexto).not.toMatch(/modo teste/);
});
