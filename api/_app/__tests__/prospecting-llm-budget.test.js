'use strict';

/**
 * Global hourly LLM budget (prospect-llm-budget) — the cost circuit-breaker
 * for the prospecting stack. No Upstash in tests → the in-memory path runs.
 * Integration: generateReply and extrairFatos degrade (never crash) when the
 * budget is exhausted.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const {
  DEFAULT_HOURLY_CAP,
  hourlyCap,
  hourKey,
  consumeLlmCall,
  usedThisHour,
  budgetDisponivel,
  exigirOrcamentoLlm,
  _resetMemory,
} = require('../_lib/prospecting/prospect-llm-budget');

// A fixed instant: 2026-07-06T14:30:00Z → hour bucket "…T14".
const NOW = Date.parse('2026-07-06T14:30:00Z');

afterEach(() => {
  _resetMemory();
  delete process.env.PROSPECTING_LLM_HOURLY_CAP;
});

describe('hourlyCap', () => {
  it('defaults without the env var', () => {
    expect(hourlyCap()).toBe(DEFAULT_HOURLY_CAP);
  });

  it('honors a positive integer override', () => {
    process.env.PROSPECTING_LLM_HOURLY_CAP = '10';
    expect(hourlyCap()).toBe(10);
  });

  it.each(['0', '-5', 'abc', ''])('falls back to the default on invalid value %p', (v) => {
    process.env.PROSPECTING_LLM_HOURLY_CAP = v;
    expect(hourlyCap()).toBe(DEFAULT_HOURLY_CAP);
  });
});

describe('hourKey', () => {
  it('buckets by UTC hour', () => {
    expect(hourKey(NOW)).toBe('prospect:llmcap:2026-07-06T14');
    expect(hourKey(Date.parse('2026-07-06T14:59:59Z'))).toBe(hourKey(NOW));
    expect(hourKey(Date.parse('2026-07-06T15:00:00Z'))).not.toBe(hourKey(NOW));
  });
});

describe('consumeLlmCall (memory path)', () => {
  it('allows up to the cap, blocks past it', async () => {
    process.env.PROSPECTING_LLM_HOURLY_CAP = '3';
    for (let i = 1; i <= 3; i++) {
      const r = await consumeLlmCall(NOW);
      expect(r).toEqual({ allowed: true, count: i, cap: 3 });
    }
    const over = await consumeLlmCall(NOW);
    expect(over.allowed).toBe(false);
    expect(over.count).toBe(4);
  });

  it('a new hour starts fresh', async () => {
    process.env.PROSPECTING_LLM_HOURLY_CAP = '1';
    await consumeLlmCall(NOW);
    expect((await consumeLlmCall(NOW)).allowed).toBe(false);
    const nextHour = Date.parse('2026-07-06T15:01:00Z');
    expect((await consumeLlmCall(nextHour)).allowed).toBe(true);
  });
});

describe('usedThisHour / budgetDisponivel', () => {
  it('reads without consuming', async () => {
    process.env.PROSPECTING_LLM_HOURLY_CAP = '2';
    expect(await usedThisHour(NOW)).toBe(0);
    expect(await budgetDisponivel(NOW)).toBe(true);
    expect(await usedThisHour(NOW)).toBe(0); // still zero — reads don't count

    await consumeLlmCall(NOW);
    expect(await usedThisHour(NOW)).toBe(1);
    expect(await budgetDisponivel(NOW)).toBe(true);

    await consumeLlmCall(NOW);
    expect(await budgetDisponivel(NOW)).toBe(false);
  });
});

describe('exigirOrcamentoLlm', () => {
  it('passes silently under the cap, throws at exhaustion', async () => {
    process.env.PROSPECTING_LLM_HOURLY_CAP = '1';
    await expect(exigirOrcamentoLlm(NOW)).resolves.toBeUndefined();
    await expect(exigirOrcamentoLlm(NOW)).rejects.toThrow(/orçamento de LLM esgotado/);
  });
});

describe('integration — generateReply degrades to nada when exhausted', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../_lib/ai-client');
    jest.dontMock('../_lib/prospecting/prospect-llm-budget');
  });

  it('returns { tipo: "nada" } without calling the LLM', async () => {
    jest.resetModules();
    const create = jest.fn();
    jest.doMock('../_lib/ai-client', () => ({ AI_MODEL: 'm', getAI: () => ({ messages: { create } }) }));
    jest.doMock('../_lib/prospecting/prospect-llm-budget', () => ({
      consumeLlmCall: async () => ({ allowed: false, count: 251, cap: 250 }),
    }));
    const { generateReply } = require('../_lib/prospecting/prospect-agent');
    const acao = await generateReply({
      lead: { name: 'Cantina X' },
      history: [{ direcao: 'in', corpo: 'Oi, quanto custa?', tipo: 'text' }],
      nowMs: NOW,
    });
    expect(acao.tipo).toBe('nada');
    expect(acao.motivo).toMatch(/orçamento/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('budget ok → the LLM is called normally', async () => {
    jest.resetModules();
    const create = jest.fn(async () => ({ content: [{ type: 'text', text: 'Oi!' }], stop_reason: 'end_turn' }));
    jest.doMock('../_lib/ai-client', () => ({ AI_MODEL: 'm', getAI: () => ({ messages: { create } }) }));
    jest.doMock('../_lib/prospecting/prospect-llm-budget', () => ({
      consumeLlmCall: async () => ({ allowed: true, count: 1, cap: 250 }),
    }));
    const { generateReply } = require('../_lib/prospecting/prospect-agent');
    const acao = await generateReply({
      lead: { name: 'Cantina X' },
      history: [{ direcao: 'in', corpo: 'Oi', tipo: 'text' }],
      nowMs: NOW,
    });
    expect(acao.tipo).toBe('responder');
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('integration — extrairFatos degrades to empty when exhausted', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../_lib/ai-client');
    jest.dontMock('../_lib/prospecting/prospect-llm-budget');
  });

  it('returns empty facts without calling the LLM', async () => {
    jest.resetModules();
    const create = jest.fn();
    jest.doMock('../_lib/ai-client', () => ({ AI_MODEL_FAST: 'f', getAI: () => ({ messages: { create } }) }));
    jest.doMock('../_lib/prospecting/prospect-llm-budget', () => ({
      exigirOrcamentoLlm: async () => { throw new Error('orçamento de LLM esgotado (251/250 nesta hora)'); },
      consumeLlmCall: async () => ({ allowed: false, count: 251, cap: 250 }),
    }));
    const { extrairFatos } = require('../_lib/prospecting/prospect-reflect');
    const out = await extrairFatos([{ direcao: 'in', corpo: 'Somos 80 lugares', tipo: 'text' }]);
    expect(out).toEqual({ fatos: {}, intent: null });
    expect(create).not.toHaveBeenCalled();
  });
});
