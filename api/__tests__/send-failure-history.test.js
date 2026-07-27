'use strict';

/**
 * Resposta que não foi entregue NÃO entra no histórico.
 *
 * Antes de jul/2026 a ordem era: grava o par user+assistant, depois envia. Se o
 * envio falhasse — janela de 24h fechada, token recusado, número sem WhatsApp —
 * o cliente ficava sem nada e o histórico guardava uma resposta do assistente
 * que nunca existiu. Nas mensagens seguintes a IA relia esse turno fantasma
 * como se já tivesse respondido, e o restaurante via uma conversa
 * aparentemente completa com um cliente que sumiu sem explicação.
 *
 * O turno do CLIENTE entra de qualquer jeito: ele falou de verdade, e descartar
 * isso apagaria o contexto da próxima mensagem.
 *
 * A auditoria de 27/jul apontou que falha de envio não tinha NENHUMA cobertura.
 */

const mockCreate = jest.fn();
jest.mock('../_lib/ai-client', () => ({
  getAI: () => ({ messages: { create: mockCreate } }),
  AI_MODEL: 'anthropic/claude-3.5-sonnet',
  AI_MODEL_FAST: 'anthropic/claude-3-haiku',
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const mockAtualizarHistorico = jest.fn().mockResolvedValue(true);
jest.mock('../_lib/whatsapp-sessions', () => ({
  getOrCreateSession: jest.fn().mockResolvedValue({
    id: 'sess-1',
    sender_phone: '5511999998888',
    restaurant: { id: 'rest-abc', name: 'Test Restaurant', agent_language: 'pt-BR' },
    conversation_history: [],
  }),
  setSessionRestaurant: jest.fn().mockResolvedValue(undefined),
  getSessionByPhone: jest.fn(),
  updateSessionConversationHistory: (...a) => mockAtualizarHistorico(...a),
}));

jest.mock('../_lib/rate-limit', () => ({
  isMessageDuplicate: jest.fn().mockResolvedValue(false),
  rejectOversizedBody: jest.fn().mockReturnValue(false),
  checkAndApplyRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  acquireProcessingLock: jest.fn().mockResolvedValue(true),
  releaseProcessingLock: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../_lib/restaurant-registry', () => ({
  getRestaurantByName: jest.fn().mockResolvedValue({ match: null, confidence: 0 }),
  getAllActiveRestaurants: jest.fn().mockResolvedValue([
    { id: 'rest-abc', restaurant_name: 'Test Restaurant', agent_language: 'pt-BR' },
  ]),
}));

jest.mock('../_lib/whatsapp-sender', () => ({
  getWhatsAppProvider: jest.fn().mockReturnValue({ sendMessage: jest.fn() }),
}));

jest.mock('../_lib/whatsapp-interactions', () => ({
  markAsRead: jest.fn().mockResolvedValue(undefined),
  simulateTypingDelay: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../_lib/supabase', () => {
  const chain = () => {
    const c = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'not', 'order', 'limit', 'insert', 'update']) {
      c[m] = jest.fn().mockReturnValue(c);
    }
    c.single = jest.fn().mockResolvedValue({ data: null, error: null });
    c.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    c.then = (r) => Promise.resolve({ data: [], error: null }).then(r);
    return c;
  };
  return {
    canAccommodateParty: jest.fn().mockResolvedValue({ success: true, can_accommodate: true, tables: [], total_capacity: 0 }),
    supabaseAdmin: { from: jest.fn(chain), schema: jest.fn().mockReturnValue({ from: jest.fn(chain) }) },
  };
});

jest.mock('../_lib/multi-tenant-supabase', () => ({
  getMultiTenantClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}));

jest.mock('../_lib/usage-tracking', () => ({ trackUsage: jest.fn().mockResolvedValue(true) }));
jest.mock('../_lib/secure-id', () => ({ generateSecureReservationId: jest.fn().mockReturnValue('RES-TEST') }));
const mockExtrairMemorias = jest.fn().mockResolvedValue(null);
jest.mock('../_services/memoryExtractor', () => ({ extractMemoriesFromWhatsApp: (...a) => mockExtrairMemorias(...a) }));
jest.mock('../_services/guestMemory', () => ({ buildGuestContext: jest.fn().mockResolvedValue('') }));
jest.mock('../_services/campaignService', () => ({ handleOptOut: jest.fn().mockResolvedValue(true) }));
jest.mock('../_services/feedbackService', () => ({
  findPendingFeedbackForPhone: jest.fn().mockResolvedValue(null),
  processFeedbackReply: jest.fn().mockResolvedValue(null),
}));
jest.mock('../_services/surveyReplyHandler', () => ({ handleSurveyReply: jest.fn().mockResolvedValue(null) }));

const { processMessage } = require('../_lib/channels/message-processor');

const respostaDaIA = (texto = 'Claro! Para quantas pessoas?') => ({
  content: [{ type: 'text', text: texto }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 10, output_tokens: 5 },
});

/** Adapter com retorno de envio configurável — é o eixo de todos os testes. */
function adapterQue(resultadoDoEnvio) {
  return {
    providerName: 'meta',
    markAsRead: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue(resultadoDoEnvio),
    addReaction: jest.fn().mockResolvedValue(undefined),
    removeReaction: jest.fn().mockResolvedValue(undefined),
  };
}

const mensagem = () => ({
  from: '5511999998888',
  messageId: 'wamid.ENTRADA',
  text: 'Quero fazer uma reserva',
  phoneNumberId: 'pn-1',
});

/** Os papéis gravados na última chamada de histórico. */
const papeisGravados = () => {
  const ultima = mockAtualizarHistorico.mock.calls.at(-1);
  if (!ultima) return null;
  return (ultima[1] || []).map((m) => m.role);
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue(respostaDaIA());
});

describe('envio entregue', () => {
  test('grava o par completo: cliente e assistente', async () => {
    await processMessage(adapterQue({ success: true, messageId: 'wamid.SAIDA' }), mensagem());
    expect(papeisGravados()).toEqual(['user', 'assistant']);
  });
});

describe('envio NÃO entregue — nada de resposta fantasma', () => {
  test.each([
    ['janela de 24h fechada', { success: false, code: 131047, error: 'Re-engagement message' }],
    ['token recusado', { success: false, code: 190, error: 'Invalid OAuth access token' }],
    ['número sem WhatsApp', { success: false, code: 131026, error: 'Message undeliverable' }],
    ['erro sem código', { success: false, error: 'boom' }],
  ])('%s → grava só o turno do cliente', async (_rotulo, resultado) => {
    await processMessage(adapterQue(resultado), mensagem());
    // O turno do cliente FICA (ele falou de verdade); o do assistente NÃO.
    expect(papeisGravados()).toEqual(['user']);
  });

  test('adapter que estoura no envio não derruba o processamento', async () => {
    const adapter = adapterQue(null);
    adapter.sendMessage = jest.fn().mockRejectedValue(new Error('rede caiu'));
    await expect(processMessage(adapter, mensagem())).resolves.toBeDefined();
    expect(papeisGravados()).toEqual(['user']);
  });

  test('não extrai memória de conversa que o cliente nunca viu', async () => {
    await processMessage(adapterQue({ success: false, code: 190 }), mensagem());
    expect(mockExtrairMemorias).not.toHaveBeenCalled();
  });
});

describe('ordem: envia ANTES de gravar', () => {
  test('quando o histórico falha, a mensagem já saiu — cliente não fica sem resposta', async () => {
    mockAtualizarHistorico.mockRejectedValueOnce(new Error('banco fora'));
    const adapter = adapterQue({ success: true, messageId: 'wamid.SAIDA' });
    await processMessage(adapter, mensagem());
    // Falha de banco é problema nosso; não pode virar silêncio pro cliente.
    expect(adapter.sendMessage).toHaveBeenCalled();
  });
});
