'use strict';

/**
 * Trava o payload de POST /agents/create.
 *
 * ORIGEM: em 24/08/2026 a ElevenLabs virou dois defaults do widget do agente —
 * `mic_muting_enabled` e `transcript_enabled` — de `false` para `true`. O repo
 * monta `platform_settings.widget_config` com APENAS `avatar_url` e `title`, e
 * os dois campos que mudaram são HERDADOS do default do fornecedor. Resultado:
 * todo agente criado a partir daquela data nasce diferente, sem que uma linha
 * deste repositório tenha mudado, e nada acusa.
 *
 * Isso é o `known_gaps` do intel.config.json acontecendo ao vivo: "não há
 * snapshot do payload de criação do agente ElevenLabs em nenhum teste — mudança
 * de default vinda do fornecedor não seria travada por nada". Dos cinco testes
 * de ElevenLabs, só `elevenlabs-tool-cleanup.test.js` chegava perto, e ele
 * afirma apenas o formato de `tool_ids`.
 *
 * O QUE ESTE ARQUIVO PROTEGE, e a distinção importa: ele NÃO impede a ElevenLabs
 * de mudar defaults — ninguém aqui pode. Ele garante que, quando o payload que
 * NÓS enviamos mudar, o CI acuse; e que os campos sensíveis a default do
 * fornecedor sejam enviados EXPLICITAMENTE, para que o default deixe de ser
 * consultado.
 *
 * Mesmo padrão de mock do teste irmão: o serviço usa o `fetch` global do Node
 * (>=18), resolvido a cada chamada, então o mock é de `global.fetch`.
 */

process.env.ELEVENLABS_API_KEY = 'sk-teste';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));

// createAgent com restaurantId null não toca o Supabase, mas o módulo o
// importa no carregamento — o mock precisa existir mesmo sem ser exercido.
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    }),
  },
}));

const { createAgent } = require('../_services/elevenlabsAgentService');

const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

/**
 * Responde aos POST /tools (o endpoint é `/tools`, NÃO `/tools/create` — a
 * primeira versão deste mock errou isso e createAgent abortou antes de montar
 * o payload, com `toolIds.length === 0`) e ao /agents/create.
 */
function wireFetch() {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes('/agents/create')) return ok({ agent_id: 'agent_novo' });
    if (u.endsWith('/tools')) return ok({ id: 'tool_x' });
    return ok({});
  });
}

/** O corpo do POST /agents/create, já desserializado. */
function corpoDoCreate() {
  const chamada = mockFetch.mock.calls.find(([u]) => String(u).includes('/agents/create'));
  if (!chamada) throw new Error('POST /agents/create não foi chamado');
  return JSON.parse(chamada[1].body);
}

const ARGS = {
  restaurantId: null,          // sem id => não consulta o Supabase
  restaurant_name: 'Cantina do Zé',
  voice_id: '21m00Tcm4TlvDq8ikWAM',
  language: 'pt',
  phone: '+5511999998888',
  address: 'Rua Augusta, 100',
  business_hours: {},
};

describe('payload de criação do agente ElevenLabs', () => {
  beforeEach(wireFetch);

  it('cria o agente e chama POST /agents/create uma vez', async () => {
    const r = await createAgent(ARGS);
    expect(r).toMatchObject({ success: true, agent_id: 'agent_novo' });
    expect(mockFetch.mock.calls.filter(([u]) => String(u).includes('/agents/create'))).toHaveLength(1);
  });

  /**
   * O guarda central. Qualquer mudança no que ENVIAMOS quebra aqui — de
   * propósito: a quebra é o aviso de que alguém precisa olhar.
   */
  it('envia exatamente esta forma de conversation_config', async () => {
    await createAgent(ARGS);
    const body = corpoDoCreate();

    expect(body.name).toBe('Cantina do Zé AI Host');
    expect(body.conversation_config.agent.prompt.llm).toBe('gpt-4o-mini');
    expect(Array.isArray(body.conversation_config.agent.prompt.tool_ids)).toBe(true);
    expect(body.conversation_config.agent.language).toBe('pt');
    // pt usa o modelo multilíngue; só 'en' usa o flash v2 puro.
    expect(body.conversation_config.tts.model_id).toBe('eleven_flash_v2_5');
    expect(body.conversation_config.tts.voice_id).toBe(ARGS.voice_id);
    expect(body.conversation_config.conversation.turn_timeout).toBe(8);
    expect(body.conversation_config.conversation.client_events).toEqual([
      'agent_response',
      'agent_response_correction',
      'user_transcript',
      'internal_tentative_agent_response',
    ]);
    expect(body.conversation_config.asr).toEqual({ quality: 'high', provider: 'elevenlabs' });
  });

  it('usa eleven_flash_v2 quando o idioma é en', async () => {
    await createAgent({ ...ARGS, language: 'en' });
    expect(corpoDoCreate().conversation_config.tts.model_id).toBe('eleven_flash_v2');
  });

  /**
   * O motivo de este arquivo existir. Os dois campos precisam ser ENVIADOS,
   * não herdados — herdar é o que permitiu a mudança de 24/08 passar em branco.
   */
  it('envia mic_muting_enabled e transcript_enabled EXPLICITAMENTE', async () => {
    await createAgent(ARGS);
    const w = corpoDoCreate().platform_settings.widget_config;

    expect(w).toHaveProperty('mic_muting_enabled');
    expect(w).toHaveProperty('transcript_enabled');
    expect(typeof w.mic_muting_enabled).toBe('boolean');
    expect(typeof w.transcript_enabled).toBe('boolean');
    expect(w.avatar_url).toBe('https://seatable.one/logo.png');
    expect(w.title).toBe('Cantina do Zé AI Host');
  });

  it('não deixa nenhum campo do widget_config sem valor declarado', async () => {
    await createAgent(ARGS);
    // Lista fechada: acrescentar campo ao widget_config exige atualizar aqui,
    // que é o ponto em que alguém para e pensa se o valor é o desejado.
    expect(Object.keys(corpoDoCreate().platform_settings.widget_config).sort()).toEqual(
      ['avatar_url', 'mic_muting_enabled', 'title', 'transcript_enabled'],
    );
  });
});
