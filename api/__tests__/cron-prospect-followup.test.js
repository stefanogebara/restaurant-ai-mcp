'use strict';

/**
 * 2ª fase do cron: follow-up de quem recebeu proposta e não respondeu.
 *
 * A decisão pura (followupDevido) é testada à parte. Aqui se prova a fiação e,
 * principalmente, o isolamento entre as fases: quando a 2ª fase roda, a 1ª JÁ
 * mandou e-mail de verdade, e uma falha no follow-up não pode apagar o
 * relatório desses envios nem o ponto no cron_runs.
 */

const mockLogCronRun = jest.fn().mockResolvedValue(undefined);
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: (...a) => mockLogCronRun(...a),
  logCronError: jest.fn(),
}));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));
jest.mock('../_lib/secure-compare', () => ({ bearerEquals: () => true }));
jest.mock('../_lib/cron-config', () => ({ isCronEnabled: async () => true }));

const mockPropostas = { leads: [] };
const mockFollowup = { candidatos: [], historico: [], erroSelect: null };
const mockRecordEvent = jest.fn().mockResolvedValue({ stored: true });
jest.mock('../_lib/prospecting/prospect-store', () => ({
  selectFounderEmailQueue: async () => mockPropostas.leads,
  selectFounderFollowupCandidates: async () => {
    if (mockFollowup.erroSelect) throw new Error(mockFollowup.erroSelect);
    return mockFollowup.candidatos;
  },
  loadHistory: async () => mockFollowup.historico,
  isOptedOut: async () => false,
  recordEvent: (...a) => mockRecordEvent(...a),
}));

jest.mock('../_lib/prospecting/prospect-agent', () => ({
  isFounderNumber: (fone) => fone === '+5511999002121',
}));

const mockSend = jest.fn().mockResolvedValue(true);
jest.mock('../_lib/email', () => ({ sendProspectProposalEmail: (...a) => mockSend(...a) }));

const handler = require('../_crons/prospect-founder-email');
const { eventoDeEnvio, eventoDeFollowup } = require('../_lib/prospecting/founder-email');

const DIA = 24 * 60 * 60 * 1000;

function lead(over = {}) {
  return {
    id: over.id || 'l1',
    name: over.name || 'Bario Bar',
    owner_name: 'Leo',
    prospect_email: over.prospect_email || 'compras@bario.com.br',
    prospect_state: 'handoff',
    whatsapp_phone: over.whatsapp_phone || '+5511915167135',
  };
}

/** Proposta enviada há N dias, do ponto de vista do relógio real do cron. */
function propostaHa(dias) {
  return {
    direcao: 'sys',
    corpo: eventoDeEnvio('compras@bario.com.br'),
    created_at: new Date(Date.now() - dias * DIA).toISOString(),
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
  mockPropostas.leads = [];
  mockFollowup.candidatos = [];
  mockFollowup.historico = [];
  mockFollowup.erroSelect = null;
  mockSend.mockResolvedValue(true);
  process.env.CRON_SECRET = 'segredo';
});

describe('follow-up sai quando o silêncio é real', () => {
  test('proposta antiga sem resposta vira follow-up', async () => {
    mockFollowup.candidatos = [lead()];
    mockFollowup.historico = [propostaHa(6)];

    const res = await chamar();

    expect(res.body.followups.enviados).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].subject).toMatch(/retomando o contato/i);
    expect(mockRecordEvent).toHaveBeenCalledWith('l1', eventoDeFollowup('compras@bario.com.br'));
  });

  test('dry-run mostra o follow-up sem enviar nem marcar', async () => {
    mockFollowup.candidatos = [lead()];
    mockFollowup.historico = [propostaHa(6)];

    const res = await chamar({ dry: true });

    expect(res.body.followups.enviados).toBe(0);
    expect(res.body.followups.resultados[0].dry).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });
});

describe('quem já falou não leva cobrança', () => {
  test('inbound depois da proposta cancela o follow-up', async () => {
    mockFollowup.candidatos = [lead()];
    mockFollowup.historico = [
      propostaHa(6),
      { direcao: 'in', corpo: 'vou ver aqui', created_at: new Date(Date.now() - 2 * DIA).toISOString() },
    ];

    const res = await chamar();

    expect(res.body.followups.enviados).toBe(0);
    expect(res.body.followups.resultados[0].motivo).toBe('lead_respondeu');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('proposta recente ainda não cobra', async () => {
    mockFollowup.candidatos = [lead()];
    mockFollowup.historico = [propostaHa(1)];

    const res = await chamar();

    expect(res.body.followups.resultados[0].motivo).toBe('cedo_demais');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('lead de teste do fundador nunca entra', async () => {
    mockFollowup.candidatos = [lead({ whatsapp_phone: '+5511999002121' })];
    mockFollowup.historico = [propostaHa(9)];

    const res = await chamar();
    expect(res.body.followups.enviados).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('as duas fases são independentes', () => {
  test('follow-up explodindo NÃO apaga as propostas já enviadas', async () => {
    mockPropostas.leads = [lead({ id: 'proposta1' })];
    mockFollowup.erroSelect = 'supabase caiu';

    const res = await chamar();

    // A proposta saiu de verdade antes da 2ª fase existir.
    expect(res.statusCode).toBe(200);
    expect(res.body.enviados).toBe(1);
    expect(res.body.followups.enviados).toBe(0);
    expect(res.body.followups.erro).toMatch(/supabase caiu/);

    // E o ponto no cron_runs foi batido, senão o cron pareceria morto.
    expect(mockLogCronRun).toHaveBeenCalledWith(
      'prospect-founder-email', expect.objectContaining({ enviados: 1 })
    );
  });

  test('o teto da rodada é compartilhado entre as duas fases', async () => {
    process.env.PROSPECTING_EMAIL_MAX_POR_RODADA = '1';
    jest.resetModules();
    const h = require('../_crons/prospect-founder-email');

    mockPropostas.leads = [lead({ id: 'p1' })];
    mockFollowup.candidatos = [lead({ id: 'f1' })];
    mockFollowup.historico = [propostaHa(9)];

    const res = {
      statusCode: null, body: null,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; return this; },
    };
    await h({ headers: { authorization: 'Bearer x' }, query: {} }, res);

    // A proposta gastou o teto; o follow-up espera a próxima rodada.
    expect(res.body.enviados).toBe(1);
    expect(res.body.followups.enviados).toBe(0);
    expect(res.body.followups.motivo).toBe('teto_da_rodada_gasto');

    delete process.env.PROSPECTING_EMAIL_MAX_POR_RODADA;
  });
});

describe('falha de envio do follow-up', () => {
  test('não marca como enviado, então o lead volta na próxima rodada', async () => {
    mockFollowup.candidatos = [lead()];
    mockFollowup.historico = [propostaHa(6)];
    mockSend.mockRejectedValueOnce(new Error('resend fora do ar'));

    const res = await chamar();

    expect(res.body.followups.enviados).toBe(0);
    expect(res.body.followups.resultados[0].motivo).toBe('send_failed');
    const eventos = mockRecordEvent.mock.calls.map((c) => c[1]);
    expect(eventos.some((e) => /falha ao enviar follow-up/.test(e))).toBe(true);
    expect(eventos.some((e) => /follow-up da proposta enviado/.test(e))).toBe(false);
  });
});
