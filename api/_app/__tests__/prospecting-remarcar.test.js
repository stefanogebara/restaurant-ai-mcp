'use strict';

/**
 * Remarcar / no-show — the meeting lifecycle AFTER a booking exists (port of
 * Olivia's olivia-remarcar + olivia-noshow). The real prospect-remarcar module
 * runs through the REAL responder (mode 'remarcar') into mocked store/gcal/
 * agent — full sync of Calendar + state + message is what's under test.
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
}));
jest.mock('../_lib/prospecting/prospect-store', () => ({
  loadHistory: jest.fn(),
  patchLead: jest.fn().mockResolvedValue(undefined),
  recordOptout: jest.fn().mockResolvedValue(undefined),
  storeMessage: jest.fn().mockResolvedValue(undefined),
  inboundFingerprint: jest.fn().mockResolvedValue('1|x'),
  claimInbound: jest.fn().mockResolvedValue(true),
  releaseInbound: jest.fn().mockResolvedValue(undefined),
  updateIntent: jest.fn().mockResolvedValue(undefined),
  recordEvent: jest.fn().mockResolvedValue(undefined),
  selectNoshowDue: jest.fn().mockResolvedValue([]),
}));
jest.mock('../_lib/prospecting/prospect-gcal', () => ({
  getGoogleAccessToken: jest.fn().mockResolvedValue('tok'),
  ownerCalendarId: jest.fn(() => 'primary'),
  deleteEvent: jest.fn().mockResolvedValue({ ok: true, status: 204 }),
  patchEventTime: jest.fn().mockResolvedValue({ ok: true, status: 200, htmlLink: 'https://cal/x', meetLink: 'https://meet.google.com/x' }),
}));

const store = require('../_lib/prospecting/prospect-store');
const gcal = require('../_lib/prospecting/prospect-gcal');
const { isCronEnabled } = require('../_lib/cron-config');
const { generateReply } = require('../_lib/prospecting/prospect-agent');
const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
const { respondToProspect } = require('../_lib/prospecting/prospect-responder');
const { remarcarReuniao, sweepNoshows, NOSHOW_GRACE_MS } = require('../_lib/prospecting/prospect-remarcar');

const NOW = Date.parse('2026-07-08T15:00:00Z'); // Wednesday, business hours BRT

function makeLead(extra = {}) {
  return {
    id: 'L1',
    name: 'Cantina Teste',
    owner_name: 'João',
    sector: 'restaurante',
    city: 'São Paulo',
    nome_genero: null,
    conversa_fatos: null,
    conversa_resumo: null,
    whatsapp_phone: '+55 11 98888-7777',
    prospect_state: 'agendado',
    reuniao_at: '2026-07-08T12:00:00.000Z',
    reuniao_link: 'https://meet.google.com/old',
    calendar_event_id: 'ev1',
    assigned_rep_email: 'rep@seatable.one',
    last_in_at: new Date(NOW - 3600e3).toISOString(),
    ...extra,
  };
}

function historiaRecente() {
  return [
    { direcao: 'out', corpo: 'Confirmado então!', tipo: 'text', enviada_em: new Date(NOW - 7200e3).toISOString(), wamid: 'w0' },
    { direcao: 'in', corpo: 'até já!', tipo: 'text', enviada_em: new Date(NOW - 3600e3).toISOString(), wamid: 'w1' },
  ];
}

beforeEach(() => {
  jest.clearAllMocks();
  isCronEnabled.mockResolvedValue(true);
  store.loadHistory.mockResolvedValue(historiaRecente());
  gcal.getGoogleAccessToken.mockResolvedValue('tok');
  gcal.deleteEvent.mockResolvedValue({ ok: true, status: 204 });
  gcal.patchEventTime.mockResolvedValue({ ok: true, status: 200, htmlLink: 'https://cal/x', meetLink: 'https://meet.google.com/x' });
  generateReply.mockResolvedValue({ tipo: 'responder', texto: 'Oi! Tudo bem?' });
});

describe('remarcarReuniao — pedir', () => {
  it('cancels the event, reopens the scheduling, and Olímpia asks for a new time', async () => {
    const r = await remarcarReuniao(makeLead(), { motivo: 'pedir', nowMs: NOW });
    expect(r.ok).toBe(true);

    expect(gcal.deleteEvent).toHaveBeenCalledWith('tok', 'ev1', ['rep@seatable.one', 'primary']);
    expect(store.patchLead).toHaveBeenCalledWith('L1', expect.objectContaining({
      prospect_state: 'agendando',
      reuniao_at: null,
      reuniao_link: null,
      calendar_event_id: null,
      assigned_rep_email: null,
      slots: null,
      pending_slot_iso: null,
      noshow_em: null,
    }));

    const gen = generateReply.mock.calls[0][0];
    expect(gen.noTools).toBe(true);
    expect(gen.injectUserTurn).toMatch(/REMARCAR a reunião/);
    expect(sendWhatsAppMessage).toHaveBeenCalled();
    expect(r.mensagem.action).toBe('remarcar');
    expect(r.mensagem.sent).toBe(true);
  });

  it('works without token/event id — DB reset is the source of truth', async () => {
    gcal.getGoogleAccessToken.mockResolvedValue(null);
    const r = await remarcarReuniao(makeLead({ calendar_event_id: null }), { motivo: 'pedir', nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(gcal.deleteEvent).not.toHaveBeenCalled();
    expect(store.patchLead).toHaveBeenCalled();
    expect(sendWhatsAppMessage).toHaveBeenCalled();
  });
});

describe('remarcarReuniao — noshow', () => {
  it('same reset, stamps noshow_em (one-shot), gentle message', async () => {
    const r = await remarcarReuniao(makeLead(), { motivo: 'noshow', nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(store.patchLead).toHaveBeenCalledWith('L1', expect.objectContaining({
      prospect_state: 'agendando',
      noshow_em: new Date(NOW).toISOString(),
    }));
    expect(generateReply.mock.calls[0][0].injectUserTurn).toMatch(/NÃO apareceu/);
  });
});

describe('remarcarReuniao — definir', () => {
  const NOVO = '2026-07-10T14:00:00.000Z';

  it('MOVES the event (30 min), keeps agendado, confirms exactly the new time', async () => {
    const r = await remarcarReuniao(makeLead(), { motivo: 'definir', novoSlotIso: NOVO, nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(gcal.patchEventTime).toHaveBeenCalledWith(
      'tok', 'ev1', ['rep@seatable.one', 'primary'], NOVO, '2026-07-10T14:30:00.000Z',
    );
    expect(store.patchLead).toHaveBeenCalledWith('L1', expect.objectContaining({
      reuniao_at: NOVO,
      noshow_em: null, // re-arms the sweep for the new time
      reuniao_link: 'https://meet.google.com/x',
    }));
    // State must NOT be reset — the meeting still exists.
    expect(store.patchLead.mock.calls[0][1].prospect_state).toBeUndefined();
    expect(generateReply.mock.calls[0][0].injectUserTurn).toMatch(/REMARCADA para/);
  });

  it('invalid novo_slot_iso → error, nothing touched', async () => {
    const r = await remarcarReuniao(makeLead(), { motivo: 'definir', novoSlotIso: 'amanhã', nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(store.patchLead).not.toHaveBeenCalled();
    expect(gcal.patchEventTime).not.toHaveBeenCalled();
  });

  it('Calendar move failure → error, lead NOT patched (no divergence)', async () => {
    gcal.patchEventTime.mockResolvedValue({ ok: false, status: 403, htmlLink: null, meetLink: null });
    const r = await remarcarReuniao(makeLead(), { motivo: 'definir', novoSlotIso: NOVO, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(store.patchLead).not.toHaveBeenCalled();
  });
});

describe('responder mode remarcar — gates', () => {
  it('bypasses the silent-state gate (agendado) — a normal inbound stays silent', async () => {
    const semModo = await respondToProspect({ lead: makeLead(), from: '5511988887777', text: 'oi', nowMs: NOW });
    expect(semModo.action).toBe('skip');
    expect(semModo.reason).toBe('silent_state:agendado');

    const comModo = await respondToProspect({
      lead: makeLead(), from: '5511988887777', text: '', nowMs: NOW,
      skipPacing: true, mode: 'remarcar', remarcarMotivo: 'definir', novoHorarioLabel: 'sexta 11:00',
    });
    expect(comModo.action).toBe('remarcar');
    expect(generateReply.mock.calls[0][0].injectUserTurn).toContain('sexta 11:00');
  });

  it('respects the Meta 24h window — skips when the last inbound is stale', async () => {
    store.loadHistory.mockResolvedValue([
      { direcao: 'in', corpo: 'oi', tipo: 'text', enviada_em: new Date(NOW - 25 * 3600e3).toISOString(), wamid: 'w1' },
    ]);
    const r = await respondToProspect({
      lead: makeLead(), from: '5511988887777', text: '', nowMs: NOW,
      skipPacing: true, mode: 'remarcar', remarcarMotivo: 'pedir',
    });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('window_closed');
    expect(generateReply).not.toHaveBeenCalled();
  });

  it('never bypasses the global kill switch', async () => {
    isCronEnabled.mockResolvedValue(false);
    const r = await respondToProspect({
      lead: makeLead(), from: '5511988887777', text: '', nowMs: NOW,
      skipPacing: true, mode: 'remarcar', remarcarMotivo: 'pedir',
    });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('agent_disabled');
  });

  it('LLM silence (budget/provider) → skip with motivo, nothing sent', async () => {
    generateReply.mockResolvedValue({ tipo: 'nada', motivo: 'erro LLM: x' });
    const r = await respondToProspect({
      lead: makeLead(), from: '5511988887777', text: '', nowMs: NOW,
      skipPacing: true, mode: 'remarcar', remarcarMotivo: 'noshow',
    });
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('no_text');
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });
});

describe('sweepNoshows — automatic no-show (flush piggyback)', () => {
  it('kill switch off → does not touch anything', async () => {
    isCronEnabled.mockResolvedValue(false);
    const r = await sweepNoshows({ nowMs: NOW });
    expect(r.skipped).toBe('agent_disabled');
    expect(store.selectNoshowDue).not.toHaveBeenCalled();
  });

  it('selects meetings past the 2h grace and processes each once', async () => {
    store.selectNoshowDue.mockResolvedValue([
      makeLead({ id: 'L1' }),
      makeLead({ id: 'L2', calendar_event_id: 'ev2' }),
    ]);
    const r = await sweepNoshows({ nowMs: NOW });

    expect(store.selectNoshowDue).toHaveBeenCalledWith(new Date(NOW - NOSHOW_GRACE_MS).toISOString(), 5);
    expect(r).toEqual({ selected: 2, processed: 2, sent: 2, errors: 0 });
    expect(gcal.deleteEvent).toHaveBeenCalledTimes(2);
    // one-shot stamp on both
    for (const call of store.patchLead.mock.calls.filter((c) => ['L1', 'L2'].includes(c[0]))) {
      expect(call[1].noshow_em).toBe(new Date(NOW).toISOString());
    }
    expect(store.recordEvent).toHaveBeenCalledTimes(2);
  });

  it('one lead failing does not stop the batch', async () => {
    store.selectNoshowDue.mockResolvedValue([makeLead({ id: 'L1' }), makeLead({ id: 'L2' })]);
    store.patchLead.mockRejectedValueOnce(new Error('db down'));
    const r = await sweepNoshows({ nowMs: NOW });
    expect(r.processed).toBe(1);
    expect(r.errors).toBe(1);
  });
});
