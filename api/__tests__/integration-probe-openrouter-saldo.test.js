'use strict';

/**
 * Sonda do OpenRouter: chave válida NÃO basta — o saldo da conta decide.
 *
 * Incidente que originou isto (31/07): a conta chegou a US$-0,03 (325,03 usados
 * de 325) com o painel 100% verde — a sonda antiga só validava a CHAVE. O
 * OpenRouter é o provedor ÚNICO do agente desde 30/07: saldo zero = Olímpia
 * muda em produção, degradando pra silêncio por design (generateReply → 'nada').
 * Um painel verde durante uma condição dessas treina a ignorar o painel.
 */

const { sondarOpenRouter, NIVEIS } = require('../_lib/integration-probes');

function mocks({ keyStatus = 200, total = 325, usage = 0, creditosQuebrado = false }) {
  return jest.fn(async (url) => {
    if (String(url).includes('/api/v1/key')) {
      return { ok: keyStatus === 200, status: keyStatus, json: async () => ({ data: { label: 'k' } }) };
    }
    return {
      ok: true, status: 200,
      json: async () => (creditosQuebrado ? { unexpected: true } : { data: { total_credits: total, total_usage: usage } }),
    };
  });
}

let fetchOriginal;
beforeEach(() => { fetchOriginal = global.fetch; });
afterEach(() => { global.fetch = fetchOriginal; });

const ENV = { OPENROUTER_API_KEY: 'sk-or-teste' };

describe('saldo decide o veredito', () => {
  test('saldo NEGATIVO é falha — o cenário real de 31/07 (325,03 de 325)', async () => {
    global.fetch = mocks({ total: 325, usage: 325.033898778 });
    const r = await sondarOpenRouter(ENV);
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).toMatch(/SALDO ESGOTADO/);
    expect(r.detalhe).toMatch(/recarregar/);
  });

  test('saldo exatamente zero também é falha', async () => {
    global.fetch = mocks({ total: 100, usage: 100 });
    const r = await sondarOpenRouter(ENV);
    expect(r.nivel).toBe(NIVEIS.FALHA);
  });

  test('saldo baixo (< US$5) é atenção', async () => {
    global.fetch = mocks({ total: 325, usage: 322 });
    const r = await sondarOpenRouter(ENV);
    expect(r.nivel).toBe(NIVEIS.ATENCAO);
    expect(r.detalhe).toMatch(/quase no fim/);
  });

  test('saldo saudável é ok e mostra o número', async () => {
    global.fetch = mocks({ total: 325, usage: 100 });
    const r = await sondarOpenRouter(ENV);
    expect(r.nivel).toBe(NIVEIS.OK);
    expect(r.detalhe).toMatch(/US\$225\.00/);
  });
});

describe('bordas', () => {
  test('chave recusada é falha com o diagnóstico certo (agente sem cérebro)', async () => {
    global.fetch = mocks({ keyStatus: 401 });
    const r = await sondarOpenRouter(ENV);
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).toMatch(/SEM cérebro/);
  });

  test('saldo ilegível vira atenção, nunca ok silencioso', async () => {
    // O buraco original: fingir saúde quando não se sabe. Se o formato do
    // /credits mudar, o painel avisa em vez de voltar ao verde cego.
    global.fetch = mocks({ creditosQuebrado: true });
    const r = await sondarOpenRouter(ENV);
    expect(r.nivel).toBe(NIVEIS.ATENCAO);
    expect(r.detalhe).toMatch(/não consegui ler o saldo/);
  });

  test('sem a env é não-configurado, sem chamada de rede', async () => {
    global.fetch = jest.fn();
    const r = await sondarOpenRouter({});
    expect(r.nivel).toBe(NIVEIS.NAO_CONFIGURADO);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
