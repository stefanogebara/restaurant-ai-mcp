'use strict';

/**
 * `limit: 0` no disparo de intro significa ZERO.
 *
 * INCIDENTE QUE ORIGINOU ESTE ARQUIVO (30/jul): o handler fazia
 *   `Math.min(Math.max(parseInt(body.limit, 10) || 20, 1), 100)`
 * e `parseInt(0) || 20` é 20 — então `limit: 0` virava VINTE em silêncio. Uma
 * chamada feita como sonda ("me diga o estado sem enviar nada") selecionou 20
 * leads reais e tentou enviar. Não houve dano porque a Meta recusou todas (o
 * template não estava aprovado) e `markIntro('failed')` liberou os claims —
 * mas isso foi acidente, não desenho.
 *
 * Num endpoint que fala com gente real, a quantidade pedida pelo operador não
 * pode ser reinterpretada. Estes testes prendem isso nas duas camadas: o
 * handler que traduz o corpo, e o sequencer que decide se consulta candidatos.
 */

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));

const mockDispatchIntros = jest.fn();
jest.mock('../_lib/prospecting/sequencer', () => ({
  dispatchIntros: (...a) => mockDispatchIntros(...a),
}));

const handler = require('../prospect-dispatch');

function fakeRes() {
  return {
    statusCode: null, body: null,
    setHeader() {},
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

const SEGREDO = 'segredo-de-teste';

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = SEGREDO;
  mockDispatchIntros.mockResolvedValue({ candidates: 0, sent: 0, dryRun: true });
});
afterEach(() => { delete process.env.CRON_SECRET; });

const chamar = (body) => handler(
  { method: 'POST', headers: { authorization: `Bearer ${SEGREDO}` }, body },
  fakeRes(),
);

describe('tradução do limit no handler', () => {
  test('limit 0 chega ao sequencer como 0 — NÃO como 20', async () => {
    await chamar({ limit: 0 });
    expect(mockDispatchIntros).toHaveBeenCalledWith(expect.objectContaining({ limit: 0 }));
  });

  test('limit ausente usa o default 20', async () => {
    await chamar({});
    expect(mockDispatchIntros).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  test('limit inválido cai no default em vez de virar 0 ou NaN', async () => {
    // Um NaN escapando daqui viraria `.limit(NaN)` no PostgREST — comportamento
    // indefinido num caminho que envia mensagem.
    for (const v of ['abc', null, {}, undefined]) {
      mockDispatchIntros.mockClear();
      await chamar({ limit: v });
      expect(mockDispatchIntros).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    }
  });

  test('limit negativo é fixado em 0, não vira default', async () => {
    await chamar({ limit: -5 });
    expect(mockDispatchIntros).toHaveBeenCalledWith(expect.objectContaining({ limit: 0 }));
  });

  test('teto de 100 continua valendo', async () => {
    await chamar({ limit: 5000 });
    expect(mockDispatchIntros).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  test('fracionário é truncado', async () => {
    await chamar({ limit: 7.9 });
    expect(mockDispatchIntros).toHaveBeenCalledWith(expect.objectContaining({ limit: 7 }));
  });
});

/**
 * Defesa em profundidade no sequencer: não depender de quantas linhas
 * `.limit(0)` devolve no driver. A diferença entre zero e vinte, num caminho
 * que manda mensagem para gente real, não pode ser detalhe do PostgREST.
 */
describe('o sequencer não consulta candidatos com limit 0', () => {
  function carregar() {
    jest.resetModules();
    const mockSelect = jest.fn().mockResolvedValue([]);
    const mockEnviar = jest.fn();
    jest.doMock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));
    jest.doMock('../_lib/prospecting/routing', () => ({ getProspectingPhoneNumberId: () => 'pn-1' }));
    jest.doMock('../_lib/cron-config', () => ({ isCronEnabled: async () => true }));
    jest.doMock('../_lib/prospecting/prospect-warmup', () => ({
      consumeSendSlot: jest.fn(async () => ({ allowed: true, count: 1, cap: 40 })),
    }));
    jest.doMock('../_lib/whatsapp-sender', () => ({ sendTemplateMessage: mockEnviar }));
    jest.doMock('../_lib/prospecting/prospect-store', () => ({
      isOptedOut: async () => false,
      selectIntroCandidates: mockSelect,
      listTemplates: async () => [],
      selectDueTouches: async () => [],
      selectDueReengages: async () => [],
      selectReferralIntroCandidates: async () => [],
      selectHandoffLeads: async () => [],
      reclaimHandoffToConversando: jest.fn(),
      loadLastMessage: jest.fn(),
      claimIntro: jest.fn(async () => true), markIntro: jest.fn(),
      storeMessage: jest.fn(), patchLead: jest.fn(), recordEvent: jest.fn(),
    }));
    process.env.PROSPECTING_IGNORE_HOURS = 'true';
    // requireActual é OBRIGATÓRIO aqui: o `jest.mock` no topo do arquivo (que
    // existe para testar o handler) faria um `require` normal devolver o mock
    // do sequencer, e o teste passaria a medir o próprio mock — sempre 0
    // chamadas ao select, independente do código real.
    const { dispatchIntros } = jest.requireActual('../_lib/prospecting/sequencer');
    return { dispatchIntros, mockSelect, mockEnviar };
  }

  afterEach(() => { delete process.env.PROSPECTING_IGNORE_HOURS; });

  // Um único carregamento para os dois casos: repetir resetModules+doMock no
  // mesmo arquivo faz o segundo require voltar do cache com os mocks do
  // primeiro, e o teste falha por isolamento — não por bug no código.
  test('limit 0 não consulta nem envia; limit > 0 consulta', async () => {
    const { dispatchIntros, mockSelect, mockEnviar } = carregar();

    const zero = await dispatchIntros({ limit: 0 });
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockEnviar).not.toHaveBeenCalled();
    expect(zero.candidates).toBe(0);
    expect(zero.sent).toBe(0);

    await dispatchIntros({ limit: 5 });
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockSelect.mock.calls[0][0]).toBe(5);
  });
});
