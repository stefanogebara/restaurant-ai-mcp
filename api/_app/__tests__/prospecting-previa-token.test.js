'use strict';

/**
 * Beacon da prévia fixa (Racha): o token `pl` que faz a abertura do demo
 * deixar de ser invisível.
 *
 * POR QUE (13/08/2026). O demo do Racha é UM link pra todo lead; dos 5 demos
 * já enviados, ninguém sabe se algum foi aberto — a reação-à-abertura só
 * funcionava pra prévia por-restaurante (token = demo_token no
 * restaurant_config). O `pl` assinado devolve o lead ao beacon sem tocar o
 * restaurant_config.
 *
 * Contratos que este arquivo prende:
 *  1. sign/verify é puro e redondo; adulteração e expiração caem com o motivo certo.
 *  2. criarPreviaDemo (Racha) anexa um `pl` que verifica de volta pro MESMO lead.
 *  3. Sem segredo, o link sai limpo — o beacon nunca pode quebrar o demo.
 *  4. O link com `pl` continua casando com a detecção de "demo já enviado"
 *     (previaLinkInHistory) — senão a idempotência quebraria e a agente
 *     mandaria o demo duas vezes.
 *  5. mapTokenToLead resolve o token assinado direto em prospect_leads.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

const LEAD_ID = '11111111-2222-4333-8444-555555555555';
const SECRET = 'segredo-de-teste-0123456789';
const NOW = 1_760_000_000_000;

const ENV_KEYS = ['PROSPECTING_PRODUCT', 'PROSPECTING_DECK_SECRET', 'CRON_SECRET', 'PROSPECTING_PREVIA_URL'];
const ENV_ORIGINAL = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ENV_ORIGINAL[k] === undefined) delete process.env[k];
    else process.env[k] = ENV_ORIGINAL[k];
  }
  jest.resetModules();
});

describe('previa-token — sign/verify puro', () => {
  const { signPreviaToken, verifyPreviaToken, DEFAULT_TTL_MS } = require('../_lib/prospecting/previa-token');

  test('roda redondo: mesmo leadId volta do verify', () => {
    const t = signPreviaToken(LEAD_ID, { nowMs: NOW, secret: SECRET });
    expect(verifyPreviaToken(t, { nowMs: NOW, secret: SECRET })).toEqual({ ok: true, leadId: LEAD_ID });
  });

  test('vale até o TTL e expira depois dele', () => {
    const t = signPreviaToken(LEAD_ID, { nowMs: NOW, secret: SECRET });
    expect(verifyPreviaToken(t, { nowMs: NOW + DEFAULT_TTL_MS, secret: SECRET }).ok).toBe(true);
    expect(verifyPreviaToken(t, { nowMs: NOW + DEFAULT_TTL_MS + 1, secret: SECRET }))
      .toEqual({ ok: false, reason: 'expirado' });
  });

  test('assinatura adulterada e lead trocado caem como assinatura_invalida', () => {
    const t = signPreviaToken(LEAD_ID, { nowMs: NOW, secret: SECRET });
    const [lead, exp, sig] = t.split('.');
    const outroLead = '99999999-8888-4777-8666-555555555555';
    expect(verifyPreviaToken(`${lead}.${exp}.${sig}x`, { nowMs: NOW, secret: SECRET }).reason).toBe('assinatura_invalida');
    expect(verifyPreviaToken(`${outroLead}.${exp}.${sig}`, { nowMs: NOW, secret: SECRET }).reason).toBe('assinatura_invalida');
  });

  test('sem segredo: sign devolve null e verify recusa', () => {
    delete process.env.PROSPECTING_DECK_SECRET;
    delete process.env.CRON_SECRET;
    expect(signPreviaToken(LEAD_ID, { nowMs: NOW })).toBeNull();
    expect(verifyPreviaToken('a.b.c', { nowMs: NOW })).toEqual({ ok: false, reason: 'sem_segredo' });
  });
});

describe('criarPreviaDemo (Racha) — o link fixo ganha o pl do lead', () => {
  function carregar() {
    jest.resetModules();
    jest.doMock('../_lib/secure-logger', () => ({
      createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
    }));
    jest.doMock('../_lib/supabase', () => ({ supabaseAdmin: { from: jest.fn(), schema: jest.fn() } }));
    return {
      demo: require('../_lib/prospecting/prospect-demo'),
      token: require('../_lib/prospecting/previa-token'),
    };
  }

  test('pl anexado verifica de volta pro mesmo lead', async () => {
    process.env.PROSPECTING_PRODUCT = 'racha';
    process.env.PROSPECTING_DECK_SECRET = SECRET;
    const { demo, token } = carregar();
    const r = await demo.criarPreviaDemo(LEAD_ID);
    expect(r.ok).toBe(true);
    expect(r.fixed).toBe(true);
    const pl = new URL(r.url).searchParams.get('pl');
    expect(pl).toBeTruthy();
    expect(token.verifyPreviaToken(pl, { secret: SECRET })).toEqual({ ok: true, leadId: LEAD_ID });
    // O param `t` do demo continua intacto — o pl entra por cima, não no lugar.
    expect(new URL(r.url).searchParams.get('t')).toBe('demoracha');
  });

  test('sem segredo o link sai limpo — o beacon nunca quebra o demo', async () => {
    process.env.PROSPECTING_PRODUCT = 'racha';
    delete process.env.PROSPECTING_DECK_SECRET;
    delete process.env.CRON_SECRET;
    const { demo } = carregar();
    const r = await demo.criarPreviaDemo(LEAD_ID);
    expect(r.ok).toBe(true);
    expect(r.url).not.toContain('pl=');
  });

  test('link com pl continua casando com a detecção de demo já enviado', async () => {
    process.env.PROSPECTING_PRODUCT = 'racha';
    process.env.PROSPECTING_DECK_SECRET = SECRET;
    const { demo } = carregar();
    const r = await demo.criarPreviaDemo(LEAD_ID);
    const history = [{ corpo: `é essa aqui, abre no celular 👇\n${r.url}` }];
    expect(demo.previaLinkInHistory(history)).toBeTruthy();
  });
});

describe('mapTokenToLead — o pl assinado resolve o lead direto', () => {
  test('token válido busca prospect_leads pelo id embutido', async () => {
    process.env.PROSPECTING_DECK_SECRET = SECRET;
    jest.resetModules();
    const mockMaybeSingle = jest.fn(async () => ({ data: { id: LEAD_ID, name: 'Bar Teste' } }));
    const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
    const mockSelect = jest.fn(() => ({ eq: mockEq }));
    const mockFrom = jest.fn(() => ({ select: mockSelect }));
    jest.doMock('../_lib/secure-logger', () => ({
      createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
    }));
    jest.doMock('../_lib/supabase', () => ({ supabaseAdmin: { from: mockFrom, schema: jest.fn() } }));
    const demo = require('../_lib/prospecting/prospect-demo');
    const { signPreviaToken } = require('../_lib/prospecting/previa-token');

    const lead = await demo.mapTokenToLead(signPreviaToken(LEAD_ID, { secret: SECRET }));
    expect(lead).toEqual({ id: LEAD_ID, name: 'Bar Teste' });
    expect(mockFrom).toHaveBeenCalledWith('prospect_leads');
    expect(mockEq).toHaveBeenCalledWith('id', LEAD_ID);
  });
});
