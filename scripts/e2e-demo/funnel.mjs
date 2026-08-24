/**
 * E2E do funil "Demo em Conversa" em PRODUÇÃO (seatable.one), num Chromium
 * real (rAF vivo → AnimatePresence funciona, diferente do pane headless).
 *
 * Percurso: hero → /demo/setup → busca → confirmação explícita → criação sem
 * e-mail → overlay ConversaPrimeiro → reserva via chat (chip + nome) →
 * PAYOFF ("Reserva confirmada" → "Ver no painel") → painel com card de
 * payoff + captura pós-aha → captura por e-mail (attach-contact).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const RESTAURANTE = process.env.PW_RESTAURANTE || 'Bráz Pizzaria';
const CIDADE = process.env.PW_CIDADE || 'São Paulo';
const EMAIL = process.env.PW_EMAIL || 'stefanogebara+demotest@gmail.com';

const passos = [];
function ok(nome) { passos.push(`✓ ${nome}`); console.log(`✓ ${nome}`); }

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  locale: 'pt-BR',
  viewport: { width: 1400, height: 900 },
});
const page = await ctx.newPage();
page.setDefaultTimeout(30_000);

// Sentinela de datas: toda resposta do demo-chat com booking precisa cair
// numa janela sã (hoje..+30d). Pega regressões tipo "sexta = 31/01/2025".
const bookings = [];
page.on('response', async (r) => {
  if (!r.url().includes('/api/demo-chat')) return;
  try {
    const j = await r.json();
    if (j && j.booking) bookings.push(j.booking);
  } catch {}
});
function validarBookings() {
  for (const b of bookings) {
    const d = new Date(b.date + 'T12:00:00Z');
    const dias = (d - Date.now()) / 86400000;
    if (!(dias >= -1 && dias <= 30)) throw new Error('DATA INSANA no booking: ' + JSON.stringify(b));
  }
  if (!bookings.length) throw new Error('nenhum booking capturado na rede');
  return bookings[bookings.length - 1];
}

try {
  // ── 1. Hero ──────────────────────────────────────────────────────────
  await page.goto('https://seatable.one', { waitUntil: 'domcontentloaded' });
  const heroCta = page.getByRole('link', { name: /Veja com o seu restaurante/ });
  await heroCta.waitFor();
  await page.screenshot({ path: SHOTS + '01-hero.png' });
  ok('hero novo com CTA "Veja com o seu restaurante →"');
  await heroCta.click();

  // ── 2. Setup: busca + confirmação explícita ─────────────────────────
  await page.waitForURL('**/demo/setup');
  await page.getByPlaceholder('Nome do restaurante').fill(RESTAURANTE);
  await page.getByPlaceholder('Cidade').fill(CIDADE);
  await page.getByRole('button', { name: 'Buscar' }).click();

  // Primeiro card de resultado, seja qual for o nome — o Google fuzzy-matcha
  // ("Cantina do Zeca" → "Zeca Ora Bar") e é exatamente por isso que a
  // confirmação explícita existe.
  const resultado = page.locator('button.w-full.text-left').first();
  await resultado.waitFor({ timeout: 20_000 });
  if (await page.getByText('É este o seu restaurante?').isVisible().catch(() => false)) {
    throw new Error('AUTO-SELECT detectado — a confirmação apareceu sem clique');
  }
  ok('resultado apareceu SEM auto-select');
  await resultado.click();
  await page.getByText('É este o seu restaurante?').waitFor();
  await page.screenshot({ path: SHOTS + '02-confirmacao.png' });
  ok('card "É este o seu restaurante?"');

  // ── 3. Criação sem e-mail ───────────────────────────────────────────
  if (await page.locator('input[type="email"]').count() > 0) {
    throw new Error('GATE DE E-MAIL presente no setup — não deveria existir');
  }
  ok('nenhum campo de e-mail no setup');
  await page.getByRole('button', { name: /Sim, é esse/ }).click();
  await page.waitForURL(/\/demo\/[0-9a-f-]{36}/, { timeout: 45_000 });
  ok('demo criado sem e-mail → ' + new URL(page.url()).pathname.slice(0, 20) + '…');

  // ── 4. Overlay ConversaPrimeiro ─────────────────────────────────────
  const overlay = page.getByRole('dialog');
  await overlay.waitFor({ timeout: 30_000 });
  await overlay.getByText(/Sou a recepcionista IA/).waitFor({ timeout: 20_000 });
  await page.screenshot({ path: SHOTS + '03-overlay-conversa.png' });
  ok('overlay da conversa abriu com a recepcionista IA real');

  // ── 5. Reserva pelo chat ────────────────────────────────────────────
  await overlay.getByRole('button', { name: /Mesa pra 4 sexta/ }).click();
  await overlay.getByText(/nome/i).waitFor({ timeout: 25_000 });
  ok('IA respondeu e pediu o nome');

  const input = overlay.getByPlaceholder(/Digite como se fosse um cliente/);
  await input.fill('Stefano Gebara');
  await input.press('Enter');

  // ── 6. PAYOFF ───────────────────────────────────────────────────────
  await overlay.getByText('Reserva confirmada').waitFor({ timeout: 30_000 });
  const verNoPainel = overlay.getByRole('button', { name: 'Ver no painel' });
  await verNoPainel.waitFor();
  await page.screenshot({ path: SHOTS + '04-payoff.png' });
  const b = validarBookings();
  ok('PAYOFF + booking são na rede: ' + b.date + ' ' + b.time + ' ' + b.party_size + 'p ' + b.name);
  await verNoPainel.click();

  // ── 7. Painel: card de payoff + captura ─────────────────────────────
  await page.getByText('Sua IA acabou de fechar esta reserva').waitFor({ timeout: 15_000 });
  await page.getByText('via WhatsApp · agora').first().waitFor();
  await page.getByText('Stefano Gebara').first().waitFor();
  ok('painel: card "Sua IA acabou de fechar esta reserva" com a reserva');

  const captura = page.getByText('Gostou? Continue no seu WhatsApp');
  await captura.waitFor();
  await page.screenshot({ path: SHOTS + '05-painel-payoff.png', fullPage: false });
  ok('captura pós-aha presente (WhatsApp primeiro)');

  // ── 8. Captura por e-mail (attach-contact) ──────────────────────────
  await page.getByRole('button', { name: /Prefiro receber o link por e-mail/ }).click();
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await page.getByText('Enviado! Confira sua caixa de entrada.').waitFor({ timeout: 15_000 });
  await page.screenshot({ path: SHOTS + '06-email-capturado.png' });
  ok(`e-mail capturado via attach-contact (${EMAIL})`);

  // ── 9. Faixa de urgência honesta ────────────────────────────────────
  await page.getByText(/dias restantes/).waitFor();
  ok('faixa "X dias restantes · Manter meus dados"');

  console.log('\nRESULTADO: PASS — ' + passos.length + ' passos verdes');
} catch (err) {
  await page.screenshot({ path: SHOTS + '99-falha.png', fullPage: true }).catch(() => {});
  console.log('\nRESULTADO: FAIL no passo ' + (passos.length + 1) + ' — ' + err.message);
  console.log('URL atual: ' + page.url());
  process.exitCode = 1;
} finally {
  await browser.close();
}
