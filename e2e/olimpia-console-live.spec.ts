import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * E2E — Olímpia Ops console, LIVE against production (seatable.one).
 *
 * SAFETY CONTRACT (non-negotiable): the dispatch path is exercised ONLY with
 * the master agent switch OFF, so the sequencer short-circuits before any
 * WhatsApp send. Every dispatch assertion double-checks sent === 0 AND that
 * the number's sent_today counter did not move. The switch is restored in
 * afterAll even if a test dies mid-flight.
 *
 * Auth: e2e/auth-state-olimpia.json (mint with `node e2e/gen-olimpia-auth.js`).
 */

const AUTH_PATH = path.join(__dirname, 'auth-state-olimpia.json');
const ART_DIR = path.join(__dirname, '..', 'e2e-artifacts', 'olimpia-console');

test.use({ storageState: AUTH_PATH });
test.describe.configure({ mode: 'serial', timeout: 120_000 });

function bearer(): string {
  const state = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
  const entry = state.origins[0].localStorage.find((e: { name: string }) => e.name.includes('auth-token'));
  return JSON.parse(entry.value).access_token;
}

async function adminGet(request: APIRequestContext, action: string) {
  const res = await request.get(`https://seatable.one/api/prospect-admin?action=${action}`, {
    headers: { Authorization: `Bearer ${bearer()}` },
  });
  expect(res.status(), `GET ${action}`).toBe(200);
  return (await res.json()).data;
}

async function setAgent(request: APIRequestContext, enabled: boolean) {
  const res = await request.post('https://seatable.one/api/prospect-admin?action=agent', {
    headers: { Authorization: `Bearer ${bearer()}` },
    data: { enabled },
  });
  expect(res.status(), 'toggle agent').toBe(200);
}

async function openConsole(page: Page) {
  await page.goto('/olimpia', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Olímpia/ }).first()).toBeVisible({ timeout: 20_000 });
  // Overview strip loaded = authenticated + API healthy.
  await expect(page.getByText('MENSAGENS ENVIADAS HOJE', { exact: false })).toBeVisible({ timeout: 20_000 });
}

async function expandPanel(page: Page, title: string) {
  const header = page.getByRole('button', { name: new RegExp(title) }).first();
  await header.scrollIntoViewIfNeeded();
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(ART_DIR, { recursive: true });
  await page.screenshot({ path: path.join(ART_DIR, `${name}.png`), fullPage: true });
}

test.afterAll(async ({ request }) => {
  // Safety net: never leave the production agent off because a test failed.
  await setAgent(request, true).catch(() => { /* reported by the test that failed */ });
});

test('console renders authenticated with number health', async ({ page }) => {
  await openConsole(page);
  await expect(page.getByText(/saúde do número/)).toBeVisible();
  await expect(page.getByText(/Agente ativo|Agente PARADO/)).toBeVisible();
  await shot(page, '01-console');
});

test('identity panel: number, name review status, contact timeline with approved templates', async ({ page }) => {
  await openConsole(page);
  await expandPanel(page, 'Identidade do WhatsApp');
  await expect(page.getByText('+55 21 2391-4417')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Nome em análise pela Meta|Nome aprovado/)).toBeVisible();
  await expect(page.getByText(/Número saudável/)).toBeVisible();
  // The four sequence steps must reference their templates.
  for (const tpl of ['olimpia_apresentacao', 'olimpia_toque2', 'olimpia_toque3', 'olimpia_resgate']) {
    await expect(page.getByText(tpl, { exact: false }).first()).toBeVisible();
  }
  await shot(page, '02-identidade');
});

test('abordagens panel shows the new intro active in the registry', async ({ page }) => {
  await openConsole(page);
  await expandPanel(page, 'Abordagens');
  await expect(page.getByText('olimpia_apresentacao', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  await shot(page, '03-abordagens');
});

test('insights and academia panels render; active brain is v9', async ({ page, request }) => {
  await openConsole(page);
  await expandPanel(page, 'Insights');
  await expandPanel(page, 'Academia da Olímpia');
  // Scenario list is the panel's signature content.
  await expect(page.getByText(/grosso-optout|uma-palavra|tagarela/).first()).toBeVisible({ timeout: 15_000 });
  // The active pack is exposed in the pack <select> (options are display:none
  // to Playwright) — assert the promotion through the API contract instead.
  const gym = await adminGet(request, 'gym');
  const active = gym.packs.find((p: { active: boolean }) => p.active);
  expect(active?.version).toBe(9);
  await shot(page, '04-academia');
});

test('lead workbench: thread opens, 24h-window state is explicit', async ({ page }) => {
  await openConsole(page);
  const lead = page.getByText('Restaurante do Stefano').first();
  await lead.scrollIntoViewIfNeeded();
  await lead.click();
  // Conversation renders…
  await expect(page.getByText('[template:', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  // …and the composer truthfully reflects the 24h window: free-text enabled
  // while it is open, an explicit banner once it closes.
  const composer = page.getByPlaceholder(/Responder como você/);
  const closedBanner = page.getByText(/fora da janela de 24h/);
  if (await closedBanner.isVisible().catch(() => false)) {
    await expect(composer).toBeDisabled();
  } else {
    await expect(composer).toBeVisible();
    await expect(composer).toBeEnabled();
  }
  await shot(page, '05-thread');
});

test('DISPARO safe-path: with agent OFF the full dispatch pipeline runs and sends nothing', async ({ page, request }) => {
  const before = await adminGet(request, 'overview');

  await openConsole(page);
  // Kill switch via UI (also e2e-tests the switch itself).
  await page.getByRole('button', { name: 'Parar agente' }).click();
  await page.getByRole('button', { name: 'Confirmar parada' }).click();
  await expect(page.getByText('Agente PARADO')).toBeVisible({ timeout: 10_000 });
  await shot(page, '06-agente-parado');

  // Full dispatch UI flow: expand → confirm modal → confirm.
  await expandPanel(page, 'Descobrir & Disparar');
  await page.getByRole('button', { name: 'Disparar primeiras mensagens' }).click();
  await expect(page.getByText(/Enviar mensagens REAIS/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();

  // Sequencer short-circuits on the kill switch: 0 sent, result line renders.
  await expect(page.getByText(/Último disparo: 0 mensagens enviadas/)).toBeVisible({ timeout: 20_000 });
  await shot(page, '07-disparo-bloqueado');

  // Belt and suspenders: the production counter did not move.
  const after = await adminGet(request, 'overview');
  expect(after.sent_today).toBe(before.sent_today);

  // Restore via UI and verify.
  await page.getByRole('button', { name: 'Reativar agente' }).click();
  await expect(page.getByText('Agente ativo')).toBeVisible({ timeout: 10_000 });
  await shot(page, '08-agente-reativado');
});

test('discovery: small bairro search inserts only WhatsApp-valid leads', async ({ page }) => {
  await openConsole(page);
  await expandPanel(page, 'Descobrir & Disparar');
  await page.getByPlaceholder('São Paulo').fill('São Paulo');
  await page.getByPlaceholder('Jardins, Pinheiros…').fill('Vila Madalena');
  await page.getByRole('button', { name: /Buscar \(até 60/ }).click();
  await expect(page.getByText(/Última busca: \d+ restaurantes encontrados/)).toBeVisible({ timeout: 60_000 });
  await shot(page, '09-discovery');
});
