'use strict';

/**
 * deleteAgent precisa apagar os tools que createAgent criou.
 *
 * BUG (achado 31/07, verificado no arquivo vivo): os dois lados usam caminhos
 * DIFERENTES do mesmo objeto.
 *   createAgent grava em conversation_config.agent.prompt.tool_ids  (L902)
 *   deleteAgent  lê    de conversation_config.agent.tools           (L353)
 * `tools` vem undefined, a lista sai vazia e o loop de DELETE nunca roda.
 *
 * Consequência real: o cron diário de limpeza de demos chama deleteAgent, então
 * CADA demo expirado deixa os webhook tools órfãos na conta da ElevenLabs — de
 * forma invisível, porque o código "funciona" (deleta o agente, não erra).
 */

// ANTES do require: o serviço pode resolver a chave no carregamento do módulo,
// e definir isto num beforeEach chegaria tarde demais.
process.env.ELEVENLABS_API_KEY = 'sk-teste';

// O serviço usa o `fetch` global do Node (>=18) e o resolve a cada chamada,
// então substituir `global.fetch` aqui intercepta tudo o que ele dispara.
// Antes ele fazia `require('node-fetch')` e capturava a referência no load do
// módulo — nessa época mockar o global deixava a requisição sair de verdade
// (chegou a aparecer um 401 real da ElevenLabs no diagnóstico) e só o mock do
// módulo funcionava.
const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));

const mockConfig = { elevenlabs_agent_id: 'agent_123', elevenlabs_kb_doc_id: null };
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockConfig, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mockConfig, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  },
}));

const { deleteAgent } = require('../_services/elevenlabsAgentService');

/**
 * Responde ao GET do agente com o shape REAL que a plataforma devolve — o
 * mesmo que createAgent enviou: tool_ids dentro de prompt.
 */
function respondeComAgente(agentPayload) {
  const chamadas = [];
  mockFetch.mockImplementation(async (url, opts = {}) => {
    chamadas.push({ url: String(url), method: opts.method || 'GET' });
    if (String(url).includes('/agents/') && (opts.method || 'GET') === 'GET') {
      return { ok: true, json: async () => agentPayload };
    }
    return { ok: true, json: async () => ({}) };
  });
  return chamadas;
}

/** Shape que a plataforma devolve — o mesmo que createAgent enviou (L902). */
const comToolIds = (toolIds) => ({
  conversation_config: {
    agent: { prompt: { prompt: 'oi', llm: 'gpt-4o-mini', tool_ids: toolIds } },
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.elevenlabs_agent_id = 'agent_123';
});

describe('limpeza de tools ao deletar agente', () => {
  test('APAGA os tools gravados em prompt.tool_ids', async () => {
    const chamadas = respondeComAgente(comToolIds(['tool_a', 'tool_b', 'tool_c']));
    await deleteAgent('rest-1');
    const deletes = chamadas.filter((c) => c.method === 'DELETE' && c.url.includes('/tools/'));
    expect(deletes.map((d) => d.url.split('/tools/')[1])).toEqual(['tool_a', 'tool_b', 'tool_c']);
  });

  test('ainda apaga o AGENTE (o que já funcionava não pode quebrar)', async () => {
    const chamadas = respondeComAgente(comToolIds(['tool_a']));
    await deleteAgent('rest-1');
    expect(chamadas.some((c) => c.method === 'DELETE' && /\/agents\/agent_123$/.test(c.url))).toBe(true);
  });

  test('agente sem tools não tenta deletar nada e não quebra', async () => {
    const chamadas = respondeComAgente(comToolIds([]));
    const r = await deleteAgent('rest-1');
    expect(chamadas.filter((c) => c.url.includes('/tools/'))).toHaveLength(0);
    expect(r.success).toBe(true);
  });

  test('compatibilidade: agente ANTIGO com tools em agent.tools também é limpo', async () => {
    // Não sabemos o shape de agentes criados por versões anteriores; aceitar os
    // dois caminhos custa uma linha e evita deixar órfão de novo.
    const chamadas = respondeComAgente({
      conversation_config: { agent: { tools: [{ id: 'legado_1' }, { id: 'legado_2' }] } },
    });
    await deleteAgent('rest-1');
    const alvos = chamadas.filter((c) => c.method === 'DELETE' && c.url.includes('/tools/'))
      .map((c) => c.url.split('/tools/')[1]);
    expect(alvos).toEqual(['legado_1', 'legado_2']);
  });
});
