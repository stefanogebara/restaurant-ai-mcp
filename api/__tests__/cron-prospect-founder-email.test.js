'use strict';

/**
 * Cron da proposta autônoma por e-mail.
 *
 * O fundador optou por autonomia TOTAL de envio (08/08/2026). Estes testes
 * cobrem justamente os caminhos que impedem isso de virar incidente: dry-run,
 * bloqueio por claim, marcação só depois do envio confirmado, opt-out e teto.
 *
 * `buildProposalEmail` NÃO é mockado de propósito: o teste exercita o linter
 * real dentro do caminho de envio, que é onde ele precisa segurar.
 */

const mockLogCronRun = jest.fn().mockResolvedValue(undefined);
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: (...a) => mockLogCronRun(...a),
  logCronError: jest.fn(),
}));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));
jest.mock('../_lib/secure-compare', () => ({ bearerEquals: () => true }));

const mockCronEnabled = { valor: true };
jest.mock('../_lib/cron-config', () => ({ isCronEnabled: async () => mockCronEnabled.valor }));

const mockFila = { leads: [] };
const mockOptOut = { numeros: new Set() };
const mockRecordEvent = jest.fn().mockResolvedValue({ stored: true });
jest.mock('../_lib/prospecting/prospect-store', () => ({
  selectFounderEmailQueue: async () => mockFila.leads,
  isOptedOut: async (fone) => mockOptOut.numeros.has(fone),
  recordEvent: (...a) => mockRecordEvent(...a),
}));

jest.mock('../_lib/prospecting/prospect-agent', () => ({
  isFounderNumber: (fone) => fone === '+5511999002121',
}));

const mockSend = jest.fn().mockResolvedValue(true);
jest.mock('../_lib/email', () => ({ sendProspectProposalEmail: (...a) => mockSend(...a) }));

const handler = require('../cron/prospect-founder-email');

function lead(over = {}) {
  return {
    id: over.id || 'l1',
    name: over.name || 'Bario Bar',
    owner_name: 'owner_name' in over ? over.owner_name : 'Leo',
    prospect_email: over.prospect_email || 'compras@bario.com.br',
    prospect_state: 'handoff',
    whatsapp_phone: over.whatsapp_phone || '+5511915167135',
  };
}

function chamar({ dry = false } = {}) {
  const req = { headers: { authorization: 'Bearer x' }, query: dry ? { dry: '1' } : {} };
  const res = {
    statusCode: null, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  return handler(req, res).then(() => res);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCronEnabled.valor = true;
  mockFila.leads = [];
  mockOptOut.numeros = new Set();
  mockSend.mockResolvedValue(true);
  process.env.CRON_SECRET = 'segredo';
});

describe('dry-run', () => {
  test('monta o e-mail, devolve prévia e NÃO envia nem marca', async () => {
    mockFila.leads = [lead()];
    const res = await chamar({ dry: true });

    expect(res.statusCode).toBe(200);
    expect(res.body.dry).toBe(true);
    expect(res.body.enviados).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
    // Marcar no dry-run queimaria o lead: ele nunca mais entraria na fila.
    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(res.body.resultados[0].assunto).toMatch(/Bario Bar/);
  });
});

describe('envio real', () => {
  test('envia e só então grava o marcador de idempotência', async () => {
    mockFila.leads = [lead()];
    const res = await chamar();

    expect(res.body.enviados).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const arg = mockSend.mock.calls[0][0];
    expect(arg.to).toBe('compras@bario.com.br');
    // Resposta do prospect tem que cair na caixa do fundador, não no FROM.
    expect(arg.replyTo).toBeTruthy();

    const marcador = mockRecordEvent.mock.calls[0][1];
    expect(marcador).toMatch(/proposta enviada por e-mail/);
    expect(marcador).toContain('compras@bario.com.br');
  });

  test('falha de envio não marca como enviado (o lead volta na próxima)', async () => {
    mockFila.leads = [lead()];
    mockSend.mockRejectedValueOnce(new Error('resend: domain not verified'));
    const res = await chamar();

    expect(res.body.enviados).toBe(0);
    expect(res.body.resultados[0].motivo).toBe('send_failed');
    const evento = mockRecordEvent.mock.calls[0][1];
    expect(evento).toMatch(/falha ao enviar/);
    expect(evento).not.toMatch(/proposta enviada por e-mail/);
  });
});

describe('o linter segura dentro do caminho de envio', () => {
  test('dado de lead que injeta claim proibido bloqueia o envio daquele lead', async () => {
    // Nome de casa com preço dentro. Entra na abertura ("aí do <casa>") e
    // dispara preco-inventado. Lixo em prospect_leads é real, não hipótese.
    mockFila.leads = [lead({ id: 'ruim', name: 'Casa custa R$ 299 por mês' })];
    const res = await chamar();

    expect(mockSend).not.toHaveBeenCalled();
    expect(res.body.resultados[0].motivo).toBe('claim_blocked');
    expect(mockRecordEvent.mock.calls[0][1]).toMatch(/NÃO enviada/);
  });

  test('um lead bloqueado não derruba os outros da rodada', async () => {
    mockFila.leads = [lead({ id: 'ruim', name: 'Casa custa R$ 299 por mês' }), lead({ id: 'bom' })];
    const res = await chamar();

    expect(res.body.enviados).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

describe('filtros de segurança', () => {
  test('lead com opt-out não recebe proposta (LGPD)', async () => {
    mockOptOut.numeros = new Set(['+5511915167135']);
    mockFila.leads = [lead()];
    const res = await chamar();

    expect(mockSend).not.toHaveBeenCalled();
    expect(res.body.enviados).toBe(0);
  });

  test('o lead de teste do próprio fundador é excluído', async () => {
    mockFila.leads = [lead({ whatsapp_phone: '+5511999002121' })];
    const res = await chamar();
    expect(mockSend).not.toHaveBeenCalled();
    expect(res.body.enviados).toBe(0);
  });

  test('lead sem telefone passa pelo filtro de opt-out sem quebrar', async () => {
    mockFila.leads = [lead({ whatsapp_phone: null })];
    const res = await chamar();
    expect(res.body.enviados).toBe(1);
  });

  test('teto por rodada é respeitado', async () => {
    process.env.PROSPECTING_EMAIL_MAX_POR_RODADA = '2';
    jest.resetModules();
    const h = require('../cron/prospect-founder-email');
    mockFila.leads = [lead({ id: 'a' }), lead({ id: 'b' }), lead({ id: 'c' }), lead({ id: 'd' })];
    const res = {
      statusCode: null, body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    await h({ headers: { authorization: 'Bearer x' }, query: {} }, res);
    expect(res.body.enviados).toBe(2);
    delete process.env.PROSPECTING_EMAIL_MAX_POR_RODADA;
  });
});

describe('operação', () => {
  test('kill switch desligado não envia nada', async () => {
    mockCronEnabled.valor = false;
    mockFila.leads = [lead()];
    const res = await chamar();
    expect(res.body.skipped).toBe('disabled_by_ops');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('rodada vazia bate ponto no cron_runs (ocioso != morto)', async () => {
    mockFila.leads = [];
    await chamar();
    expect(mockLogCronRun).toHaveBeenCalledWith(
      'prospect-founder-email', expect.objectContaining({ enviados: 0 })
    );
  });
});
