/**
 * E2E do caminho "restaurante novo" (F4) em produção: nome inexistente →
 * 3 perguntas (cozinha/horário/clima) → recepcionista nasce configurada →
 * ela responde com OS HORÁRIOS QUE O DONO CONFIGUROU → reserva → payoff.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const passos = [];
function ok(nome) { passos.push(nome); console.log(`✓ ${nome}`); }

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ locale: 'pt-BR', viewport: { width: 1400, height: 900 } })).newPage();
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
  await page.goto('https://seatable.one/demo/setup', { waitUntil: 'domcontentloaded' });
  // Nome deliberadamente inexistente e não-fuzzy-matchável
  await page.getByPlaceholder('Nome do restaurante').fill('Zebrallina Kftz 9931');
  await page.getByPlaceholder('Cidade').fill('Sorocaba');
  await page.getByRole('button', { name: 'Buscar' }).click();

  // Zero resultados OU erro → ambos levam ao bloco de 3 perguntas
  const heading = page.getByText('Restaurante novo? Melhor ainda.');
  const escape = page.getByRole('button', { name: /Continue manualmente|Continue without/i });
  await Promise.race([
    heading.waitFor({ timeout: 20_000 }),
    escape.waitFor({ timeout: 20_000 }).then(() => escape.click()),
  ]).catch(() => {});
  await heading.waitFor({ timeout: 10_000 });
  ok('bloco "Restaurante novo? Melhor ainda." apareceu');

  // 3 perguntas: cozinha Pizzaria, horário 18–23 (defaults 12/23 → mudo o open), clima romântico+animado
  await page.getByRole('button', { name: 'Pizzaria' }).click();
  const selects = page.locator('select');
  await selects.first().selectOption('18:00');
  await page.getByRole('button', { name: 'Romântico' }).click();
  await page.getByRole('button', { name: 'Animado' }).click();
  await page.screenshot({ path: SHOTS + '10-novo-perguntas.png' });
  ok('3 perguntas respondidas (Pizzaria · 18:00–23:00 · romântico+animado)');

  await page.getByRole('button', { name: 'Criar minha recepcionista' }).click();
  await page.waitForURL(/\/demo\/[0-9a-f-]{36}/, { timeout: 45_000 });
  ok('demo manual criado');

  const overlay = page.getByRole('dialog');
  await overlay.waitFor({ timeout: 30_000 });
  await overlay.getByText(/Sou a recepcionista IA/).waitFor({ timeout: 20_000 });
  ok('overlay abriu para o restaurante novo');

  // A pergunta-chave: ela sabe os horários que o dono ACABOU de configurar?
  const input = overlay.getByPlaceholder(/Digite como se fosse um cliente/);
  await input.fill('Que horas vocês abrem?');
  await input.press('Enter');
  await overlay.getByText(/18/).waitFor({ timeout: 30_000 });
  const resposta = await overlay.locator('div').filter({ hasText: /18/ }).last().innerText().catch(() => '');
  await page.screenshot({ path: SHOTS + '11-novo-horarios.png' });
  ok('IA respondeu com os horários configurados (18h) — trecho: ' + resposta.slice(0, 80).replace(/\n/g, ' '));

  // Fecha a reserva
  await input.fill('Quero uma mesa pra 2 sexta às 20h');
  await input.press('Enter');
  await overlay.getByText(/nome/i).waitFor({ timeout: 30_000 });
  await input.fill('Zilda Nascimento');
  await input.press('Enter');
  await overlay.getByText('Reserva confirmada').waitFor({ timeout: 30_000 });
  await page.screenshot({ path: SHOTS + '12-novo-payoff.png' });
  const b = validarBookings();
  ok('PAYOFF também no restaurante novo — booking são: ' + b.date + ' ' + b.time + ' ' + b.party_size + 'p');

  await overlay.getByRole('button', { name: 'Ver no painel' }).click();
  await page.getByText('Sua IA acabou de fechar esta reserva').waitFor({ timeout: 15_000 });
  await page.getByText('Configurada por você, agora mesmo').waitFor({ timeout: 10_000 });
  await page.screenshot({ path: SHOTS + '13-novo-painel.png' });
  ok('painel sem espelho do Google: card "Configurada por você, agora mesmo"');

  console.log('\nRESULTADO: PASS — ' + passos.length + ' passos verdes');
} catch (err) {
  await page.screenshot({ path: SHOTS + '98-novo-falha.png', fullPage: true }).catch(() => {});
  console.log('\nRESULTADO: FAIL no passo ' + (passos.length + 1) + ' — ' + err.message.split('\n')[0]);
  console.log('URL: ' + page.url());
  process.exitCode = 1;
} finally {
  await browser.close();
}
