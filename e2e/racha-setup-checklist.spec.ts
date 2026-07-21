/**
 * LIVE (racha-gray.vercel.app): checklist de implantação no admin — o wizard
 * de 4 passos do playbook como estado vivo.
 *
 * Padrão do auth-live.test.js do racha: cria um DONO efêmero via service-role
 * (GoTrue admin) + faz o password-grant programático pra injetar a sessão no
 * localStorage — nenhum dado real, e o afterAll apaga usuário e casa (cascade).
 * Percorre o fluxo real: onboarding cria a casa → checklist "1 de 4" →
 * mesa real "2 de 4" → mesa de treino "3 de 4" → passo Recebimento pendente
 * em tom de alerta com âncora → roteiro da equipe com a frase do garçom.
 *
 * Env: lê C:\Users\stefa\racha\.env (SUPABASE_URL / SERVICE_ROLE / PUBLISHABLE).
 */
import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.RACHA_BASE || 'https://racha-gray.vercel.app';

function loadRachaEnv(): Record<string, string> {
  const file = path.join('C:', 'Users', 'stefa', 'racha', '.env');
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const env = loadRachaEnv();
const SUPABASE_URL = env.SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = env.SUPABASE_PUBLISHABLE_KEY;

test.describe('racha admin — checklist de implantação (prod)', () => {
  let admin: SupabaseClient;
  let userId: string | null = null;
  let venueId: string | null = null;
  const email = `e2e.setup.${Date.now()}@teste.demo`;
  const password = 'x'.repeat(16);
  let session: { access_token: string; refresh_token: string; expires_in: number; expires_at: number; user: unknown };

  test.beforeAll(async () => {
    expect(SUPABASE_URL, 'racha .env sem SUPABASE_URL').toBeTruthy();
    admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`createUser: ${error.message}`);
    userId = data.user.id;

    // Password grant programático (mesma chamada que o app faz) → sessão pra injetar.
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: PUBLISHABLE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    session = await r.json();
    if (!session.access_token) throw new Error('password grant falhou');
  });

  test.afterAll(async () => {
    // Cascade: apagar a venue remove members + tables; depois o usuário efêmero.
    if (venueId) await admin.from('venues').delete().eq('id', venueId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  test('onboarding → 4 passos vivos → roteiro da equipe', async ({ page }) => {
    // Injeta a sessão Supabase no localStorage do domínio (chave sb-<ref>-auth-token).
    const ref = new URL(SUPABASE_URL).hostname.split('.')[0];
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [`sb-${ref}-auth-token`, JSON.stringify({
        access_token: session.access_token,
        token_type: 'bearer',
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        refresh_token: session.refresh_token,
        user: session.user,
      })] as const,
    );
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Onboarding: cria a casa (dono efêmero não tem nenhuma).
    await expect(page.getByText('Cadastre seu restaurante')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('Nome do restaurante').fill('Casa Teste E2E');
    await page.getByRole('button', { name: 'Criar restaurante' }).click();

    // Aterrissa na gestão de mesas com o checklist: casa ✓, resto pendente.
    await expect(page.getByText('Implantação')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('1 de 4')).toBeVisible();
    venueId = new URL(page.url()).searchParams.get('v');
    expect(venueId).toBeTruthy();

    // Passo 3 pendente absorveu o banner âmbar: aviso + âncora pro Recebimento.
    await expect(page.getByText(/cobrança real não tem para onde liquidar/)).toBeVisible();
    const resolver = page.locator('a[href="#recebimento"]');
    await expect(resolver).toBeVisible();

    // Mesa real → "2 de 4".
    await page.getByPlaceholder('Ex.: Mesa 12').fill('Mesa 1');
    await page.getByRole('button', { name: 'Adicionar' }).click();
    await expect(page.getByText('2 de 4')).toBeVisible({ timeout: 10000 });

    // Segunda mesa vira mesa de treino → "3 de 4" (a real continua contando).
    await page.getByPlaceholder('Ex.: Mesa 12').fill('Mesa Treino');
    await page.getByRole('button', { name: 'Adicionar' }).click();
    await page.locator('.checkrow', { hasText: 'Mesa Treino' }).getByRole('button', { name: 'treino', exact: true }).click();
    await expect(page.getByText('3 de 4')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('mesa de treino marcada')).toBeVisible();

    // Roteiro da equipe: workshop + a frase do garçom + gate de ativação.
    await page.getByText('Roteiro da equipe').click();
    await expect(page.getByText(/no próprio celular/)).toBeVisible();
    await expect(page.getByText(/a gorjeta vai direto pra gente/)).toBeVisible();
    await expect(page.getByText(/≥25% das contas pelo QR/)).toBeVisible();
    // O mesmo href existe também no cabeçalho de Mesas — escopa ao roteiro.
    await expect(page.locator('details').locator(`a[href="/qrs?v=${encodeURIComponent(venueId!)}"]`)).toBeVisible();

    await page.screenshot({ path: 'e2e-artifacts/racha-setup-checklist.png', fullPage: true });
  });
});
