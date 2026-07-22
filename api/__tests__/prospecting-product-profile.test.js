/**
 * Product profile (Olímpia sells Racha by default; Seatable via env).
 *
 * Contracts:
 *  - PROSPECTING_PRODUCT selects the profile; default is 'racha' (the wedge).
 *  - buildSystemPrompt swaps the product-specific copy (o-que-faz / objetivo /
 *    prévia) per profile — Racha pitches pagar-na-mesa; Seatable pitches CRM/IA.
 *  - The Racha prévia is the FIXED interactive demo link (criarPreviaDemo returns
 *    it with no DB write), and previaLinkInHistory detects that link for
 *    once-per-thread idempotency.
 *  - Flipping PROSPECTING_PRODUCT=seatable restores the original behavior.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
}));
jest.mock('../_lib/ai-client', () => ({ getAI: jest.fn(), AI_MODEL: 'test-model' }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: jest.fn(), schema: jest.fn() } }));

const LEAD = { name: 'Bar do Zé', city: 'São Paulo', sector: 'bar', nome_genero: 'm' };
const AGORA = 'segunda-feira, 22 de julho de 2026, 15:00 (horário de Brasília)';

function withProduct(product, fn) {
  const prev = process.env.PROSPECTING_PRODUCT;
  if (product) process.env.PROSPECTING_PRODUCT = product; else delete process.env.PROSPECTING_PRODUCT;
  jest.resetModules();
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.PROSPECTING_PRODUCT; else process.env.PROSPECTING_PRODUCT = prev;
  }
}

describe('prospect-product — profile selection', () => {
  test('default product is racha', () => {
    withProduct(undefined, () => {
      const { getProduct, getProfile } = require('../_lib/prospecting/prospect-product');
      expect(getProduct()).toBe('racha');
      expect(getProfile().company).toBe('Racha');
      expect(getProfile().daCompany).toBe('do Racha');
      expect(getProfile().previaFixed).toBe(true);
      expect(getProfile().previaUrl).toMatch(/demoracha/);
    });
  });

  test('PROSPECTING_PRODUCT=seatable switches the profile', () => {
    withProduct('seatable', () => {
      const { getProduct, getProfile } = require('../_lib/prospecting/prospect-product');
      expect(getProduct()).toBe('seatable');
      expect(getProfile().company).toBe('Seatable');
      expect(getProfile().previaFixed).toBe(false);
    });
  });

  test('an unknown product falls back to racha', () => {
    withProduct('nope', () => {
      const { getProduct } = require('../_lib/prospecting/prospect-product');
      expect(getProduct()).toBe('racha');
    });
  });
});

describe('buildSystemPrompt — product-specific pitch', () => {
  test('racha: pitches pagar-na-mesa, not the Seatable CRM', () => {
    withProduct('racha', () => {
      const { buildSystemPrompt } = require('../_lib/prospecting/prospect-agent');
      const p = buildSystemPrompt(LEAD, AGORA);
      expect(p).toMatch(/do Racha/);
      expect(p).toMatch(/pagar a conta na mesa/i);
      expect(p).toMatch(/QR/);
      expect(p).toMatch(/gorjeta/i);
      expect(p).not.toMatch(/CRM com IA/i);
      expect(p).not.toMatch(/anti no-show/i);
    });
  });

  test('seatable: restores the reservation/CRM pitch', () => {
    withProduct('seatable', () => {
      const { buildSystemPrompt } = require('../_lib/prospecting/prospect-agent');
      const p = buildSystemPrompt(LEAD, AGORA);
      expect(p).toMatch(/da Seatable/);
      expect(p).toMatch(/CRM com IA/i);
      expect(p).not.toMatch(/pagar a conta na mesa/i);
    });
  });
});

describe('prospect-demo — fixed Racha prévia', () => {
  test('criarPreviaDemo returns the fixed demo link with no DB write', async () => {
    await withProduct('racha', async () => {
      const demo = require('../_lib/prospecting/prospect-demo');
      const { getProfile } = require('../_lib/prospecting/prospect-product');
      const r = await demo.criarPreviaDemo('lead-1');
      expect(r).toEqual({ ok: true, token: null, url: getProfile().previaUrl, fixed: true });
    });
  });

  test('previaLinkInHistory detects the fixed link (idempotency)', () => {
    withProduct('racha', () => {
      const demo = require('../_lib/prospecting/prospect-demo');
      const { getProfile } = require('../_lib/prospecting/prospect-product');
      const url = getProfile().previaUrl;
      expect(demo.previaLinkInHistory([{ direcao: 'out', corpo: `é essa aqui 👇\n${url}` }])).toBe(url);
      expect(demo.previaLinkInHistory([{ direcao: 'in', corpo: 'oi, tudo bem?' }])).toBeNull();
    });
  });
});
