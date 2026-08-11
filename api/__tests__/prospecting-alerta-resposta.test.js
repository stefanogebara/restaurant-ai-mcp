'use strict';

/**
 * Fiação do aviso ao fundador dentro do responder.
 *
 * O módulo puro (founder-alert) já é testado à parte. O que se prova AQUI é a
 * parte que eu de fato mexi: o gate de SILENT_STATE, que até 10/08/2026
 * engolia a resposta do lead sem avisar ninguém. É um caminho quente do
 * inbound, então também se prova que falha de aviso não derruba o inbound.
 */

process.env.PROSPECTING_DRY_RUN = 'false';

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'wamid.out' }),
}));
jest.mock('../_lib/rate-limit', () => ({
  acquireProcessingLock: jest.fn().mockResolvedValue(true),
  releaseProcessingLock: jest.fn().mockResolvedValue(true),
}));
jest.mock('../_lib/cron-config', () => ({ isCronEnabled: jest.fn().mockResolvedValue(true) }));
jest.mock('../_lib/redis-client', () => ({ createRedisClient: () => null }));
jest.mock('../_lib/prospecting/routing', () => ({ getProspectingPhoneNumberId: jest.fn(() => '999') }));
jest.mock('../_lib/prospecting/prospect-booking', () => ({
  bookingDisponivel: () => false,
  confirmarReuniao: jest.fn(),
  confirmarPendente: jest.fn(),
}));
jest.mock('../_lib/prospecting/prospect-agent', () => ({
  generateReply: jest.fn(),
  COMPANION_TEXT: { optout: 'ok', porta: 'porta' },
  AGENT_NAME: 'Olímpia',
  // Sem isto o canal WhatsApp do aviso nem é tentado.
  FOUNDER_WHATSAPP: '+5511999002121',
}));
jest.mock('../_lib/prospecting/prospect-store', () => ({
  loadHistory: jest.fn().mockResolvedValue([]),
  patchLead: jest.fn().mockResolvedValue(undefined),
  recordOptout: jest.fn().mockResolvedValue(undefined),
  storeMessage: jest.fn().mockResolvedValue(undefined),
  inboundFingerprint: jest.fn().mockResolvedValue('1|x'),
  claimInbound: jest.fn().mockResolvedValue(true),
  releaseInbound: jest.fn().mockResolvedValue(undefined),
  updateIntent: jest.fn().mockResolvedValue(undefined),
  recordEvent: jest.fn().mockResolvedValue(undefined),
  selectNoshowDue: jest.fn().mockResolvedValue([]),
  isOptedOut: jest.fn().mockResolvedValue(false),
}));
jest.mock('../_lib/email', () => ({
  sendProspectDigestEmail: jest.fn().mockResolvedValue(true),
}));

const store = require('../_lib/prospecting/prospect-store');
const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
const { sendProspectDigestEmail } = require('../_lib/email');
const { respondToProspect } = require('../_lib/prospecting/prospect-responder');
const { eventoDeAviso } = require('../_lib/prospecting/founder-alert');

const NOW = Date.parse('2026-08-10T15:00:00Z');

function lead(extra = {}) {
  return {
    id: 'L1',
    name: 'Bario Bar',
    owner_name: 'Leo',
    sector: 'restaurante',
    city: 'São Paulo',
    whatsapp_phone: '+55 11 91516-7135',
    prospect_state: 'handoff',
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  store.loadHistory.mockResolvedValue([]);
  sendWhatsAppMessage.mockResolvedValue({ success: true, messageId: 'wamid.out' });
  sendProspectDigestEmail.mockResolvedValue(true);
});

describe('lead em handoff responde', () => {
  it('o inbound continua silencioso, mas o fundador é avisado nos dois canais', async () => {
    const r = await respondToProspect({
      lead: lead(), from: '5511915167135', text: 'Bom dia! Podemos testar sim, como faz?', nowMs: NOW,
    });

    // O contrato antigo não muda: a agente segue muda neste estado.
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('silent_state:handoff');

    // O que mudou: alguém ficou sabendo.
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const [paraQuem, corpo] = sendWhatsAppMessage.mock.calls[0];
    expect(paraQuem).toBe('+5511999002121');
    expect(corpo).toContain('Bario Bar');
    expect(corpo).toContain('Podemos testar sim');

    expect(sendProspectDigestEmail).toHaveBeenCalledTimes(1);
    expect(sendProspectDigestEmail.mock.calls[0][0].subject).toContain('Bario Bar');

    expect(store.recordEvent).toHaveBeenCalledWith('L1', eventoDeAviso(['whatsapp', 'email']));
  });

  it('resposta automática de estabelecimento não vira aviso', async () => {
    const r = await respondToProspect({
      lead: lead(),
      from: '5511915167135',
      text: 'Agradecemos seu contato. Nossos horários de atendimento são: Quarta a Sexta 16hs às 23hs.',
      nowMs: NOW,
    });
    expect(r.reason).toBe('silent_state:handoff');
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(sendProspectDigestEmail).not.toHaveBeenCalled();
  });

  it('cooldown: segunda mensagem da rajada não realerta', async () => {
    store.loadHistory.mockResolvedValue([
      {
        direcao: 'sys',
        corpo: eventoDeAviso(['whatsapp']),
        created_at: new Date(NOW - 10 * 60 * 1000).toISOString(),
      },
    ]);
    await respondToProspect({ lead: lead(), from: '5511915167135', text: 'e aí, dá pra hoje?', nowMs: NOW });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });
});

describe('o aviso nunca derruba o inbound', () => {
  it('os dois canais falhando: inbound segue normal e o cooldown NÃO começa', async () => {
    sendWhatsAppMessage.mockRejectedValue(new Error('meta 500'));
    sendProspectDigestEmail.mockRejectedValue(new Error('resend down'));

    const r = await respondToProspect({
      lead: lead(), from: '5511915167135', text: 'oi, tenho interesse', nowMs: NOW,
    });

    expect(r.action).toBe('skip');
    expect(r.reason).toBe('silent_state:handoff');

    // Sem canal entregue o fundador não soube, então o próximo inbound tem
    // que tentar de novo em vez de cair num silêncio de 6 horas.
    const eventos = store.recordEvent.mock.calls.map((c) => c[1]);
    expect(eventos.some((e) => /falhou nos dois canais/.test(e))).toBe(true);
    expect(eventos.some((e) => /🔔 fundador avisado/.test(e))).toBe(false);
  });

  it('loadHistory explodindo não derruba o inbound', async () => {
    store.loadHistory.mockRejectedValue(new Error('db timeout'));
    const r = await respondToProspect({ lead: lead(), from: '5511915167135', text: 'oi', nowMs: NOW });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('silent_state:handoff');
  });
});

describe('estados que não são do fundador seguem intocados', () => {
  it('optout não gera aviso', async () => {
    await respondToProspect({
      lead: lead({ prospect_state: 'optout' }), from: '5511915167135', text: 'oi', nowMs: NOW,
    });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(sendProspectDigestEmail).not.toHaveBeenCalled();
  });
});
