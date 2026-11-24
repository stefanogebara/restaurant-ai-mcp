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
function respondeComAgente(agentPayload, { donoDaFerramenta = () => 'rest-1', statusDelete = () => 200, statusAgente = 200 } = {}) {
  const chamadas = [];
  mockFetch.mockImplementation(async (url, opts = {}) => {
    const method = opts.method || 'GET';
    chamadas.push({ url: String(url), method });
    if (String(url).includes('/agents/') && method === 'GET') {
      return { ok: true, json: async () => agentPayload };
    }
    if (String(url).includes('/agents/') && method === 'DELETE') {
      return { ok: statusAgente < 300, status: statusAgente, json: async () => ({}), text: async () => 'agent error' };
    }
    const toolId = idDaFerramenta(String(url));
    if (toolId && method === 'GET') {
      const dono = donoDaFerramenta(toolId);
      return { ok: true, status: 200, json: async () => ({ id: toolId, tool_config: { type: 'webhook', name: toolId,
        api_schema: { url: `https://seatable.one/api/elevenlabs-webhook?action=x${dono ? `&restaurant_id=${dono}` : ''}` } } }) };
    }
    if (toolId && method === 'DELETE') {
      const status = statusDelete(toolId);
      return { ok: status < 300, status, json: async () => ({}), text: async () => 'tool error' };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  });
  return chamadas;
}

// '.../tools/tool_a?force=true' -> 'tool_a'
const idDaFerramenta = (url) => (url.split('/tools/')[1] || '').split('?')[0] || null;
const deletesDeFerramenta = (chamadas) => chamadas
  .filter((c) => c.method === 'DELETE' && c.url.includes('/tools/'))
  .map((c) => idDaFerramenta(c.url));

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
    expect(deletesDeFerramenta(chamadas)).toEqual(['tool_a', 'tool_b', 'tool_c']);
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
    expect(deletesDeFerramenta(chamadas)).toEqual(['legado_1', 'legado_2']);
  });
});

// 15/11/2026: a limpeza do restaurante de teste mostrou as 7 ferramentas vivas
// depois de deleteAgent. A ElevenLabs RECUSA apagar ferramenta com agente
// dependente (e segue listando o agente apagado como dependente; o painel só
// apaga com "Force Delete"). deleteAgent apagava as ferramentas ANTES do
// agente, sem `force` e sem olhar a resposta: tudo falhava calado.
describe('apagar o agente leva as ferramentas junto', () => {
  test('o agente sai ANTES de qualquer ferramenta', async () => {
    const chamadas = respondeComAgente(comToolIds(['tool_a', 'tool_b']));
    await deleteAgent('rest-1');
    const ordem = chamadas.filter((c) => c.method === 'DELETE').map((c) => (c.url.includes('/agents/') ? 'agente' : 'ferramenta'));
    expect(ordem).toEqual(['agente', 'ferramenta', 'ferramenta']);
  });

  test('cada ferramenta é apagada com force=true', async () => {
    const chamadas = respondeComAgente(comToolIds(['tool_a']));
    await deleteAgent('rest-1');
    const del = chamadas.find((c) => c.method === 'DELETE' && c.url.includes('/tools/'));
    expect(new URL(del.url).searchParams.get('force')).toBe('true');
  });

  test('ferramenta que não é deste restaurante nunca é forçada', async () => {
    // force tira a ferramenta de QUALQUER agente que a use: só apagamos as que
    // apontam para este restaurante (restaurant_id na URL do webhook).
    const chamadas = respondeComAgente(comToolIds(['minha', 'de_outro', 'sem_dono']), {
      donoDaFerramenta: (id) => ({ minha: 'rest-1', de_outro: 'rest-9', sem_dono: null }[id]),
    });
    const r = await deleteAgent('rest-1');
    expect(deletesDeFerramenta(chamadas)).toEqual(['minha']);
    expect(r).toMatchObject({ success: true, tools_deleted: 1, tools_skipped: ['de_outro', 'sem_dono'] });
  });

  test('falha ao apagar ferramenta aparece no resultado e no log', async () => {
    respondeComAgente(comToolIds(['tool_a', 'tool_b']), { statusDelete: (id) => (id === 'tool_b' ? 400 : 200) });
    const r = await deleteAgent('rest-1');
    expect(r).toMatchObject({ success: true, tools_deleted: 1, tools_failed: ['tool_b'] });
    expect(mockLogger.error).toHaveBeenCalledWith('Failed to delete tool', expect.objectContaining({ toolId: 'tool_b', status: 400 }));
  });

  test('ferramenta que já não existe (404) conta como apagada', async () => {
    respondeComAgente(comToolIds(['tool_a']), { statusDelete: () => 404 });
    const r = await deleteAgent('rest-1');
    expect(r).toMatchObject({ success: true, tools_deleted: 1, tools_failed: [] });
  });

  test('se o agente não sai, nenhuma ferramenta é tocada', async () => {
    const chamadas = respondeComAgente(comToolIds(['tool_a']), { statusAgente: 500 });
    const r = await deleteAgent('rest-1');
    expect(r.success).toBe(false);
    expect(deletesDeFerramenta(chamadas)).toEqual([]);
  });
});
