/**
 * prospect-sim — silent-'nada' observability.
 *
 * Incident 2026-07-06: generateReply failed platform-wide (OpenRouter 402)
 * and the gym transcript showed bare 'nada' turns with no reason, hiding a
 * full provider outage. The transcript must carry acao.motivo.
 */

jest.mock('../_lib/ai-client', () => ({
  getAI: () => ({
    messages: {
      // Sim-lead LLM: always answers something short.
      create: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Você é robô?' }] }),
    },
  }),
  AI_MODEL: 'anthropic/claude-sonnet-4',
  AI_MODEL_FAST: 'anthropic/claude-3.5-haiku',
}));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {},
  withRetry: async (fn) => fn(),
}));

jest.mock('../_lib/prospecting/prospect-agent', () => ({
  AGENT_NAME: 'Olímpia',
  COMPANION_TEXT: { optout: 'entendido' },
  generateReply: jest.fn().mockResolvedValue({ tipo: 'nada', motivo: 'erro LLM: OpenRouter API error 402' }),
}));

const { runSimulation } = require('../_lib/prospecting/prospect-sim');

describe('runSimulation transcript', () => {
  test("silent 'nada' turns carry the motivo (provider errors are visible)", async () => {
    const { transcript } = await runSimulation(
      { nome: 'teste', turns: 2, lead: { name: 'Casa X' } },
      { turns: 2 },
    );
    const nada = transcript.find((t) => t.acao === 'nada');
    expect(nada).toBeTruthy();
    expect(nada.texto).toBeNull();
    expect(nada.motivo).toBe('erro LLM: OpenRouter API error 402');
  });
});
