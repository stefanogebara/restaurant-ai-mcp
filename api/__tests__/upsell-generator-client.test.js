'use strict';

/**
 * Por onde o upsell fala com a IA.
 *
 * Estes testes existem porque o upsell era o ÚNICO caminho de IA que
 * instanciava o SDK da Anthropic sozinho, em vez de usar o cliente
 * compartilhado. Quando a ANTHROPIC_API_KEY foi revogada, o agente seguiu
 * funcionando pelo OpenRouter e só o upsell quebrou — e quebrou EM SILÊNCIO,
 * porque o chamador cai num template quando a geração falha. Ninguém percebeu
 * até uma sonda de integração perguntar (30/jul).
 *
 * A suíte que já existia (upsell-generator.test.js) cobre só as funções puras e
 * nunca mockou cliente nenhum — ela passava idêntica antes e depois da
 * refatoração, então não protegia esta fiação. Daí este arquivo.
 */

const mockCreate = jest.fn();
const mockGetAI = jest.fn(() => ({ messages: { create: mockCreate } }));

jest.mock('../_lib/ai-client', () => ({
  getAI: (...a) => mockGetAI(...a),
  AI_MODEL_FAST: 'anthropic/claude-haiku-4.5',
  AI_MODEL: 'anthropic/claude-sonnet-4',
}));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));

const {
  generateUpsellMessage, buildFallbackMessage, MAX_MESSAGE_LENGTH,
} = require('../_lib/upsell-generator');

const CONTEXTO = {
  lang: 'pt-BR',
  customerName: 'Ana',
  restaurantName: 'Cantina Bella',
  reservationTime: '20:00',
  partySize: 2,
};

const respostaCom = (texto) => ({ content: [{ type: 'text', text: texto }] });

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue(respostaCom('Oi Ana! Amanhã tem cappelletti fresco.'));
});

describe('usa o cliente compartilhado, não o SDK direto', () => {
  test('chama getAI() em vez de instanciar a Anthropic', async () => {
    await generateUpsellMessage(CONTEXTO);
    expect(mockGetAI).toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  test('funciona SEM ANTHROPIC_API_KEY no ambiente', async () => {
    // O ponto da refatoração: com OpenRouter configurado, a ausência (ou morte)
    // da chave da Anthropic não pode derrubar o upsell.
    const salvo = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const msg = await generateUpsellMessage(CONTEXTO);
      expect(msg).toMatch(/cappelletti/);
    } finally {
      if (salvo !== undefined) process.env.ANTHROPIC_API_KEY = salvo;
    }
  });

  test('usa a constante de modelo compartilhada, não um ID datado', async () => {
    // 'claude-haiku-4-5-20251001' só existia na API direta da Anthropic; pelo
    // OpenRouter o slug é outro, e um ID datado precisa de troca manual a cada
    // atualização de modelo.
    await generateUpsellMessage(CONTEXTO);
    const params = mockCreate.mock.calls[0][0];
    expect(params.model).toBe('anthropic/claude-haiku-4.5');
    expect(params.model).not.toMatch(/\d{8}/);
  });

  test('mantém os parâmetros de geração', async () => {
    await generateUpsellMessage(CONTEXTO);
    const params = mockCreate.mock.calls[0][0];
    expect(params.max_tokens).toBe(300);
    expect(typeof params.system).toBe('string');
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe('user');
  });
});

describe('falha continua propagando para o chamador cair no template', () => {
  test('erro do provedor sobe (não vira string silenciosa)', async () => {
    mockCreate.mockRejectedValue(new Error('401 authentication_error'));
    await expect(generateUpsellMessage(CONTEXTO)).rejects.toThrow(/401/);
  });

  test('resposta vazia sobe como erro', async () => {
    mockCreate.mockResolvedValue({ content: [] });
    await expect(generateUpsellMessage(CONTEXTO)).rejects.toThrow(/Empty AI response/);
  });

  test('com pratos cadastrados, o template do chamador ainda gera mensagem', async () => {
    // Prova que a degradação é graciosa: com a IA fora, ainda sai mensagem —
    // foi por isso que o 401 passou meses sem ninguém notar.
    const msg = buildFallbackMessage({
      ...CONTEXTO,
      signatureDishes: [{ name: 'Cappelletti', description: 'massa fresca' }],
    });
    expect(typeof msg).toBe('string');
    expect(msg).toMatch(/Cappelletti/);
  });

  test('SEM pratos cadastrados o fallback é null — não há upsell a enviar', async () => {
    // Contrato real do módulo: sem prato não dá para recomendar nada, e o
    // chamador precisa distinguir "template pronto" de "não mande nada".
    expect(buildFallbackMessage(CONTEXTO)).toBeNull();
  });
});

describe('limite de tamanho', () => {
  test('corta no máximo configurado', async () => {
    mockCreate.mockResolvedValue(respostaCom('x'.repeat(MAX_MESSAGE_LENGTH + 250)));
    const msg = await generateUpsellMessage(CONTEXTO);
    expect(msg).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  test('mensagem dentro do limite passa intacta', async () => {
    mockCreate.mockResolvedValue(respostaCom('curta'));
    expect(await generateUpsellMessage(CONTEXTO)).toBe('curta');
  });
});
