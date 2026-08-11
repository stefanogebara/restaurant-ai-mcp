'use strict';

/**
 * Modelo do cérebro da Olímpia + o buraco que a configurabilidade abriu.
 *
 * CONTEXTO (11/08/2026). prospect-agent.js sozinho foi 98,5% do gasto de IA
 * das últimas 24h ($2,5684 de $2,6075, medido em public.ai_spend). Trocar
 * AI_MODEL global resolveria o custo e levaria junto o Manager AI, que atende
 * restaurante PAGANTE — daí uma env própria.
 *
 * O PERIGO QUE ISSO CRIOU: enquanto todo slug era 'anthropic/...', o
 * failover de 402 (OpenRouter sem crédito → Anthropic direto) funcionava por
 * acidente. Com o modelo configurável, apontar o agente para Gemini/GPT faria
 * toAnthropicModel devolver um id inexistente, e a API da Anthropic recusaria
 * — transformando "acabou o crédito" em erro duro. A agente emudeceria
 * exatamente no cenário que o plano B existe para cobrir, que é o cenário que
 * o fundador estava vivendo no dia em que este código foi escrito.
 */

const CAMINHO = '../_lib/ai-client';

function carregarLimpo(env = {}) {
  jest.resetModules();
  const antes = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const mod = require(CAMINHO);
  process.env = antes;
  return mod;
}

describe('AI_MODEL_AGENT — o cérebro tem env própria', () => {
  test('default é o haiku-4.5 (3x mais barato que o sonnet-4 que estava lá)', () => {
    const { AI_MODEL_AGENT } = carregarLimpo({ PROSPECTING_AGENT_MODEL: undefined });
    expect(AI_MODEL_AGENT).toBe('anthropic/claude-haiku-4.5');
  });

  test('PROSPECTING_AGENT_MODEL sobrescreve — reverter é uma env, não um deploy', () => {
    const { AI_MODEL_AGENT } = carregarLimpo({ PROSPECTING_AGENT_MODEL: 'anthropic/claude-sonnet-4' });
    expect(AI_MODEL_AGENT).toBe('anthropic/claude-sonnet-4');
  });

  test('mexer no agente NÃO mexe no modelo padrão do resto do produto', () => {
    // O Manager AI (restaurante pagante) lê AI_MODEL. Ajuste de custo de
    // prospecção não pode vazar para ele.
    const { AI_MODEL, AI_MODEL_AGENT } = carregarLimpo({
      PROSPECTING_AGENT_MODEL: 'google/gemini-2.5-flash', AI_MODEL: undefined,
    });
    expect(AI_MODEL_AGENT).toBe('google/gemini-2.5-flash');
    expect(AI_MODEL).toBe('anthropic/claude-sonnet-4');
  });
});

describe('toAnthropicModel — o plano B não pode morrer com slug estrangeiro', () => {
  test('slugs conhecidos continuam mapeando para o id datado', () => {
    const { toAnthropicModel } = carregarLimpo();
    expect(toAnthropicModel('anthropic/claude-sonnet-4')).toBe('claude-sonnet-4-20250514');
    expect(toAnthropicModel('anthropic/claude-haiku-4.5')).toBe('claude-haiku-4-5-20251001');
  });

  test('anthropic/ desconhecido só perde o prefixo (comportamento antigo)', () => {
    const { toAnthropicModel } = carregarLimpo();
    expect(toAnthropicModel('anthropic/claude-futuro-9')).toBe('claude-futuro-9');
  });

  test('slug NÃO-anthropic vira modelo real, nunca um id inventado', () => {
    // Antes devolvia 'google/gemini-2.5-flash' inteiro para a API da Anthropic.
    const { toAnthropicModel } = carregarLimpo();
    for (const estrangeiro of ['google/gemini-2.5-flash', 'openai/gpt-5-mini', 'deepseek/deepseek-chat']) {
      const r = toAnthropicModel(estrangeiro);
      expect(r).toBe('claude-haiku-4-5-20251001');
      expect(r).not.toContain('/');
    }
  });

  test('ANTHROPIC_FALLBACK_MODEL manda no modelo de emergência', () => {
    const { toAnthropicModel } = carregarLimpo({ ANTHROPIC_FALLBACK_MODEL: 'claude-sonnet-4-20250514' });
    expect(toAnthropicModel('google/gemini-2.5-flash')).toBe('claude-sonnet-4-20250514');
  });

  test('vazio/nulo também cai no de emergência, não em string vazia', () => {
    const { toAnthropicModel } = carregarLimpo();
    expect(toAnthropicModel(null)).toBe('claude-haiku-4-5-20251001');
    expect(toAnthropicModel('')).toBe('claude-haiku-4-5-20251001');
  });
});
