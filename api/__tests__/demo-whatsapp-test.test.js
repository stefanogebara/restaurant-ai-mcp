'use strict';

/**
 * "Testar no MEU WhatsApp" — as DEFESAS são o contrato principal.
 *
 * Este endpoint envia WhatsApp para um número que o visitante digita, e cada
 * envio custa dinheiro. Duas coisas podem dar errado e são diferentes:
 * incomodar terceiros (digitar o telefone de outra pessoa, repetidamente) e
 * gerar custo (script disparando testes vira fatura). Os testes abaixo prendem
 * as duas, e prendem principalmente a ORDEM: nenhuma checagem cara ou paga
 * roda antes das baratas.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => mockLogger,
}));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn() }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { schema: () => mockQuery } }));
jest.mock('../_lib/rate-limit', () => ({
  checkRateLimit: (...a) => mockCheckRateLimit(...a),
  getClientId: () => 'ip-teste',
}));
jest.mock('../_lib/whatsapp-sender', () => ({
  isWhatsAppConfigured: () => mockConfigurado(),
  sendTemplateMessage: (...a) => mockSendTemplate(...a),
}));
jest.mock('../_lib/whatsapp-meta-templates', () => ({
  fetchApprovedMetaTestTemplates: () => mockAprovados(),
  buildMetaTemplateAttempts: (...a) => mockTentativas(...a),
  isTemplateTranslationMissing: (r) => /132001/.test(String(r?.error || '')),
}));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
const mockCheckRateLimit = jest.fn();
const mockSendTemplate = jest.fn();
const mockConfigurado = jest.fn();
const mockAprovados = jest.fn();
const mockTentativas = jest.fn();
const mockQuery = {
  from: () => mockQuery, select: () => mockQuery, eq: () => mockQuery,
  maybeSingle: async () => ({ data: { restaurant_name: 'Mocotó', agent_language: 'pt-BR' } }),
};

const handler = require('../demo-whatsapp-test');

/** Resposta fake com captura de status/corpo. */
function fakeRes() {
  const res = {
    statusCode: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  return res;
}

const LIBERADO = { allowed: true, limit: 1, remaining: 1, resetSeconds: 60, message: '' };
const BLOQUEADO = (msg) => ({ allowed: false, limit: 1, remaining: 0, resetSeconds: 3600, message: msg });

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue(LIBERADO);
  mockConfigurado.mockReturnValue(true);
  mockAprovados.mockResolvedValue([{ name: 'seatable_feedback_request', language: 'pt_BR', status: 'APPROVED' }]);
  mockTentativas.mockReturnValue([
    { templateName: 'seatable_feedback_request', language: 'pt_BR', bodyParameters: ['there', 'Mocotó'] },
  ]);
  mockSendTemplate.mockResolvedValue({ success: true, messageId: 'wamid.X' });
});

describe('validação do número — antes de qualquer gasto', () => {
  test.each([
    ['vazio', ''],
    ['curto', '119999'],
    ['longo demais', '5511999998888777666'],
    ['começando com zero', '011999998888'],
    ['só letras', 'abcdefghij'],
    ['nulo', null],
  ])('recusa número %s sem enviar nada', async (_rotulo, phone) => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { phone } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('INVALID_PHONE');
    expect(mockSendTemplate).not.toHaveBeenCalled();
    // Número inválido nem consome cota — senão errar de digitação gastaria
    // o limite do visitante.
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  test('aceita número válido com máscara e DDI', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { phone: '+55 (11) 99999-8888' } }, res);
    expect(res.statusCode).toBe(200);
    expect(mockSendTemplate).toHaveBeenCalledWith('5511999998888', 'seatable_feedback_request', 'pt_BR', expect.anything());
  });
});

describe('as três defesas', () => {
  test('limite POR NÚMERO bloqueia — protege quem não pediu nada', async () => {
    mockCheckRateLimit.mockResolvedValueOnce(BLOQUEADO('já enviamos'));
    const res = fakeRes();
    await handler({ method: 'POST', body: { phone: '5511999998888' } }, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('PHONE_COOLDOWN');
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('o limite por número é checado ANTES do de IP', async () => {
    // Ordem importa: o limite que protege terceiros é o mais rígido e não pode
    // ficar atrás de outro que um atacante consiga contornar.
    await handler({ method: 'POST', body: { phone: '5511999998888' } }, fakeRes());
    const chaves = mockCheckRateLimit.mock.calls.map(([, tipo]) => tipo);
    expect(chaves.indexOf('demo_wa_test_phone')).toBeLessThan(chaves.indexOf('demo_wa_test_ip'));
  });

  test('limite por IP bloqueia quem varia o número de destino', async () => {
    mockCheckRateLimit
      .mockResolvedValueOnce(LIBERADO)
      .mockResolvedValueOnce(BLOQUEADO('limite da conexão'));
    const res = fakeRes();
    await handler({ method: 'POST', body: { phone: '5511999998888' } }, res);

    expect(res.statusCode).toBe(429);
    expect(res.body.code).toBe('IP_LIMIT');
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('teto GLOBAL bloqueia e REGISTRA — é o limite que protege a fatura', async () => {
    mockCheckRateLimit
      .mockResolvedValueOnce(LIBERADO)
      .mockResolvedValueOnce(LIBERADO)
      .mockResolvedValueOnce(BLOQUEADO('indisponível'));
    const res = fakeRes();
    await handler({ method: 'POST', body: { phone: '5511999998888' } }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('GLOBAL_LIMIT');
    expect(mockSendTemplate).not.toHaveBeenCalled();
    // Teto estourado pode ser ataque em curso: alguém precisa OLHAR.
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('a resposta não revela se o número já havia testado antes', async () => {
    // Senão o endpoint vira oráculo: "este telefone já usou o produto?".
    mockCheckRateLimit.mockResolvedValueOnce(BLOQUEADO('Já enviamos um teste para esse número.'));
    const res = fakeRes();
    await handler({ method: 'POST', body: { phone: '5511999998888' } }, res);

    const corpo = JSON.stringify(res.body).toLowerCase();
    expect(corpo).not.toMatch(/outra pessoa|other user|já cadastrad|existing/);
  });
});

describe('envio', () => {
  test('provedor não configurado devolve 503 e deixa rastro', async () => {
    mockConfigurado.mockReturnValue(false);
    const res = fakeRes();
    await handler({ method: 'POST', body: { phone: '5511999998888' } }, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.code).toBe('PROVIDER_UNAVAILABLE');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test('erro 132001 tenta o próximo idioma; outro erro para na hora', async () => {
    mockTentativas.mockReturnValue([
      { templateName: 't', language: 'pt_BR', bodyParameters: [] },
      { templateName: 't', language: 'pt', bodyParameters: [] },
    ]);
    mockSendTemplate
      .mockResolvedValueOnce({ success: false, error: '132001 does not exist in the translation' })
      .mockResolvedValueOnce({ success: true, messageId: 'wamid.Y' });

    const res = fakeRes();
    await handler({ method: 'POST', body: { phone: '5511999998888' } }, res);

    expect(mockSendTemplate).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(200);
  });

  test('erro que não é de tradução não insiste — insistir só queima cota', async () => {
    mockTentativas.mockReturnValue([
      { templateName: 't', language: 'pt_BR', bodyParameters: [] },
      { templateName: 't', language: 'pt', bodyParameters: [] },
    ]);
    mockSendTemplate.mockResolvedValue({ success: false, error: 'template reprovado' });

    const res = fakeRes();
    await handler({ method: 'POST', body: { phone: '5511999998888' } }, res);

    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('SEND_FAILED');
  });

  test('falha de entrega é registrada com o que o suporte precisa', async () => {
    // Template reprovado na Meta é invisível do nosso lado: sem este log o dono
    // clica, nada chega, e não há o que investigar.
    mockSendTemplate.mockResolvedValue({ success: false, error: 'template not found' });
    await handler({ method: 'POST', body: { phone: '5511999998888' } }, fakeRes());

    const registrado = JSON.stringify(mockLogger.error.mock.calls);
    expect(registrado).toMatch(/template not found/);
    expect(registrado).toMatch(/aprovados_na_conta/);
  });
});

describe('privacidade e método', () => {
  test('o número não volta inteiro na resposta nem vai inteiro para o log', async () => {
    const res = fakeRes();
    await handler({ method: 'POST', body: { phone: '5511999998888' } }, res);

    expect(JSON.stringify(res.body)).not.toContain('5511999998888');
    expect(JSON.stringify(mockLogger.info.mock.calls)).not.toContain('5511999998888');
  });

  test('GET não envia nada', async () => {
    const res = fakeRes();
    await handler({ method: 'GET', body: {} }, res);
    expect(res.statusCode).toBe(405);
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });
});
