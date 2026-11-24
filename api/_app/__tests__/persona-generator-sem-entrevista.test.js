'use strict';

/**
 * O polimento por LLM sobrevive ao fim da entrevista.
 *
 * `regeneratePersona` — que o cron refresh-restaurant-profiles roda toda
 * segunda — exigia uma entrevista CONCLUÍDA e devolvia null sem ela. Com as
 * doze perguntas fora do caminho (ago/2026), isso deixaria todo restaurante
 * novo preso no perfil determinístico, sem nunca receber a síntese.
 *
 * E havia um segundo furo, anterior a este: o bloco do prompt chamado
 * "INTELLIGENCE DATA (from web research)" vinha de `restaurant_intelligence`,
 * que está vazio desde que o gather de 3 tiers foi adiado por estourar a
 * lambda. O prompt prometia pesquisa e passava `{}`. O `scraped_data` — a
 * pesquisa que de fato existe — nunca era lido aqui.
 */

const mockCreate = jest.fn();
const mockUpdates = [];
var mockDados = {};

jest.mock('../_services/restaurantIntelligence', () => ({
  getAnthropicClient: () => ({ messages: { create: mockCreate } }),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_services/managerMemory', () => ({
  seedManagerMemoryFromInterview: jest.fn().mockResolvedValue(undefined),
}));

var mockCadeia = function (tabela) {
  const c = {};
  c.select = () => c;
  c.eq = () => c;
  c.order = () => c;
  c.limit = () => c;
  c.single = () => Promise.resolve({ data: mockDados[tabela] ?? null, error: mockDados[tabela] ? null : { message: 'not found' } });
  c.update = (payload) => { mockUpdates.push({ tabela, payload }); return c; };
  return c;
};

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: () => ({ from: (t) => mockCadeia(t) }),
  },
}));

const { regeneratePersona } = require('../_services/personaGenerator');

const PERFIL_LLM = {
  persona_summary: 'Casa nordestina com alma de boteco.',
  cuisine_identity: { primary_cuisine: 'Brazilian' },
  greeting_preview: 'Oi! Mocotó, bom dia.',
};

const SCRAPE = {
  editorial_summary: 'Restaurante nordestino contemporâneo.',
  cuisine_type: 'Brazilian',
  price_level: 2,
  insights: { vibe_tags: ['casual'], praise_themes: ['comida autêntica'] },
  menu: { popular_dishes: ['Dadinho de tapioca'] },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdates.length = 0;
  mockDados = {};
  mockCreate.mockResolvedValue({ content: [{ text: JSON.stringify(PERFIL_LLM) }] });
});

describe('regeneratePersona sem entrevista', () => {
  test('sintetiza a partir da PESQUISA quando não houve entrevista', async () => {
    mockDados.learning_interviews = null;
    mockDados.restaurant_config = { restaurant_name: 'Mocotó', scraped_data: SCRAPE, restaurant_profile: { version: 1 } };

    const r = await regeneratePersona('rest-1');

    expect(r).not.toBeNull();
    expect(r.restaurant_profile.persona_summary).toBe(PERFIL_LLM.persona_summary);
    expect(mockCreate).toHaveBeenCalled();
  });

  // O prompt prometia "web research" e mandava {} desde que o gather foi
  // adiado. Agora manda o que existe.
  test('o scraped_data ENTRA no prompt — antes ele nunca era lido', async () => {
    mockDados.learning_interviews = null;
    mockDados.restaurant_config = { restaurant_name: 'Mocotó', scraped_data: SCRAPE };

    await regeneratePersona('rest-1');

    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Restaurante nordestino contemporâneo.');
    expect(prompt).toContain('Dadinho de tapioca');
    expect(prompt).toContain('comida autêntica');
  });

  test('o perfil registra que veio de pesquisa, não de entrevista', async () => {
    mockDados.learning_interviews = null;
    mockDados.restaurant_config = { restaurant_name: 'Mocotó', scraped_data: SCRAPE };

    const r = await regeneratePersona('rest-1');

    expect(r.restaurant_profile._origem).toBe('pesquisa');
    expect(r.restaurant_profile.session_id).toBeNull();
  });

  // Sem a guarda, o caminho da pesquisa dispararia um UPDATE com id = null na
  // tabela de entrevistas — que casaria com zero linhas hoje, e com sabe-se lá
  // o quê se alguém trocar o predicado.
  test('NÃO tenta marcar entrevista concluída quando não houve entrevista', async () => {
    mockDados.learning_interviews = null;
    mockDados.restaurant_config = { restaurant_name: 'Mocotó', scraped_data: SCRAPE };

    await regeneratePersona('rest-1');

    expect(mockUpdates.some((u) => u.tabela === 'learning_interviews')).toBe(false);
    expect(mockUpdates.some((u) => u.tabela === 'restaurant_config')).toBe(true);
  });

  // Devolver null aqui é honesto: o perfil determinístico já gravado continua
  // valendo, e sintetizar do nada seria inventar.
  test('sem entrevista E sem pesquisa, devolve null sem chamar o LLM', async () => {
    mockDados.learning_interviews = null;
    mockDados.restaurant_config = { restaurant_name: 'Mocotó', scraped_data: null };

    const r = await regeneratePersona('rest-1');

    expect(r).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  test('a versão continua incrementando a partir do perfil atual', async () => {
    mockDados.learning_interviews = null;
    mockDados.restaurant_config = { restaurant_name: 'Mocotó', scraped_data: SCRAPE, restaurant_profile: { version: 7 } };

    const r = await regeneratePersona('rest-1');

    expect(r.restaurant_profile.version).toBe(8);
  });
});

describe('regeneratePersona com entrevista (caminho antigo, intacto)', () => {
  test('continua usando a entrevista quando ela existe', async () => {
    mockDados.learning_interviews = { id: 'sess-1', restaurant_config_id: 'rest-1', extracted_knowledge: { tom: 'caloroso' } };
    mockDados.restaurant_config = { restaurant_name: 'Mocotó', scraped_data: SCRAPE };

    const r = await regeneratePersona('rest-1');

    expect(r.restaurant_profile._origem).toBe('entrevista');
    expect(r.restaurant_profile.session_id).toBe('sess-1');
    const prompt = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('caloroso');
    // E a entrevista é marcada como concluída, como sempre foi.
    expect(mockUpdates.some((u) => u.tabela === 'learning_interviews')).toBe(true);
  });
});
