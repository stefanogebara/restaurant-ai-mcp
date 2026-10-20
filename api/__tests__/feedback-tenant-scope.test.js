'use strict';

/**
 * Bug #66 — a nota podia ir para a casa errada.
 *
 * `findPendingFeedbackForPhone` e `handleSurveyReply` buscavam SÓ POR TELEFONE,
 * via supabaseAdmin (que ignora RLS), e rodavam ANTES de o restaurante ser
 * resolvido no pipeline. Cliente com pesquisa pendente no restaurante A que
 * mandasse "5" para o restaurante B tinha a nota gravada em A — e o B nunca
 * via. Mesma família do vazamento entre inquilinos consertado em 27/jul:
 * consulta por telefone sem escopo de restaurante.
 *
 * O contrato que estes testes prendem: quando o chamador SABE o restaurante,
 * a consulta é obrigada a filtrar por ele.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

/**
 * Espião de query encadeada do Supabase. Registra cada `.eq()` para que o teste
 * possa afirmar que o filtro de restaurante existiu — é a diferença entre
 * "achei uma pesquisa" e "achei a pesquisa DESTA casa".
 */
function criarQueryFake(resultado) {
  const filtros = [];
  const q = {
    filtros,
    select: () => q,
    eq: (col, val) => { filtros.push([col, val]); return q; },
    or: (expr) => { filtros.push(['or', expr]); return q; },
    gte: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: async () => resultado,
    single: async () => resultado,
    schema: () => q,
    from: () => q,
    insert: async () => ({ error: null }),
    update: () => q,
  };
  return q;
}

const mockFrom = jest.fn();
const mockSchema = jest.fn();
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: (...a) => mockFrom(...a),
    schema: (...a) => mockSchema(...a),
  },
}));

const RESTAURANTE_A = 'rest-aaa-111';
const RESTAURANTE_B = 'rest-bbb-222';
const TELEFONE = '5511999998888';

describe('findPendingFeedbackForPhone — escopo de restaurante', () => {
  const { findPendingFeedbackForPhone } = require('../_services/feedbackService');

  beforeEach(() => mockFrom.mockReset());

  test('com restaurantId, a consulta FILTRA por ele', async () => {
    const q = criarQueryFake({ data: { id: 'fb-1', restaurant_id: RESTAURANTE_B }, error: null });
    mockFrom.mockReturnValue(q);

    await findPendingFeedbackForPhone(TELEFONE, RESTAURANTE_B);

    expect(q.filtros).toContainEqual(['restaurant_id', RESTAURANTE_B]);
  });

  test('feedback pendente de OUTRA casa não é devolvido', async () => {
    // O banco, já filtrado por restaurante, não devolve a linha do A.
    const q = criarQueryFake({ data: null, error: null });
    mockFrom.mockReturnValue(q);

    const r = await findPendingFeedbackForPhone(TELEFONE, RESTAURANTE_B);

    expect(r).toBeNull();
    expect(q.filtros).toContainEqual(['restaurant_id', RESTAURANTE_B]);
  });

  test('sem restaurantId segue como antes — compatível com chamadores que não sabem', async () => {
    const q = criarQueryFake({ data: { id: 'fb-1', restaurant_id: RESTAURANTE_A }, error: null });
    mockFrom.mockReturnValue(q);

    const r = await findPendingFeedbackForPhone(TELEFONE);

    expect(r).toEqual({ feedbackId: 'fb-1', restaurantId: RESTAURANTE_A });
    expect(q.filtros.some(([c]) => c === 'restaurant_id')).toBe(false);
  });
});

test('feedback persiste o identificador da mensagem na mesma atualização da nota', async () => {
  const { processFeedbackReply } = require('../_services/feedbackService');
  const pending = criarQueryFake({ data: { id: 'feedback-1' }, error: null });
  const updated = criarQueryFake({ data: { id: 'feedback-1', rating: 5 }, error: null });
  const update = jest.fn(() => updated);
  pending.update = update;
  mockFrom.mockReset().mockReturnValue(pending);
  await processFeedbackReply(RESTAURANTE_B, TELEFONE, '5', 'inbound-reply:exact-key');
  expect(update).toHaveBeenCalledWith(expect.objectContaining({
    rating: 5, whatsapp_inbound_key: 'inbound-reply:exact-key',
  }));
});

describe('handleSurveyReply — escopo de restaurante', () => {
  const { handleSurveyReply } = require('../_services/surveyReplyHandler');

  beforeEach(() => {
    mockFrom.mockReset();
    mockSchema.mockReset();
  });

  test('com restaurantId, a busca do service_record FILTRA por ele', async () => {
    const q = criarQueryFake({ data: null, error: null });
    mockFrom.mockReturnValue(q);

    await handleSurveyReply(TELEFONE, '5', RESTAURANTE_B);

    expect(q.filtros).toContainEqual(['restaurant_id', RESTAURANTE_B]);
  });

  test('"5" mandado para o restaurante B NÃO vira nota do A', async () => {
    // Cenário do bug: só o A tem pesquisa pendente. Filtrado por B, nada volta.
    const q = criarQueryFake({ data: null, error: null });
    mockFrom.mockReturnValue(q);

    const r = await handleSurveyReply(TELEFONE, '5', RESTAURANTE_B);

    expect(r).toBeNull();
  });

  test('mensagem que não é nota nem consulta o banco', async () => {
    const r = await handleSurveyReply(TELEFONE, 'mesa pra 4 amanhã', RESTAURANTE_B);
    expect(r).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('survey persiste o identificador da mensagem junto com a avaliação', async () => {
    const service = criarQueryFake({ data: {
      id: 'service-1', restaurant_id: RESTAURANTE_B, customer_name: 'Guest', reservation_id: null,
    }, error: null });
    const existing = criarQueryFake({ data: null, error: null });
    const inserted = criarQueryFake({ data: null, error: null });
    inserted.insert = jest.fn(async () => ({ error: null }));
    mockFrom.mockReturnValue(service);
    mockSchema.mockReturnValue({ from: jest.fn().mockReturnValueOnce(existing).mockReturnValueOnce(inserted) });
    await handleSurveyReply(TELEFONE, '5', RESTAURANTE_B, 'inbound-reply:exact-key');
    expect(inserted.insert).toHaveBeenCalledWith(expect.objectContaining({
      restaurant_id: RESTAURANTE_B, rating: 5,
      whatsapp_inbound_key: 'inbound-reply:exact-key',
    }));
  });
});
