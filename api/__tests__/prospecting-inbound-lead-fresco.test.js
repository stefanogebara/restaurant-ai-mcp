'use strict';

/**
 * Inbound — the lead handed to the responder must carry the FRESH last_in_at.
 *
 * Bug (found 2026-07-23 reading 14 stalled conversations): prospect-inbound read
 * the lead, wrote last_in_at via patchLead — which returns only { ok }, not the
 * updated row — and then passed the ORIGINAL object to the responder. The
 * responder gates the Meta 24h free-text window on lead.last_in_at, so the
 * inbound that JUST arrived was judged by the timestamp of the PREVIOUS one.
 * Because the resgate template fires at D+3 of silence, that previous inbound is
 * always >24h old → the reply was cancelled ("⏱ janela de 24h fechada"). The
 * lead came back and we silenced them; 6 such events across the sample.
 *
 * These tests fail if the local mirror (leadAtual = { ...lead, ...frescos }) is
 * removed.
 */

const ONTEM = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 dias: cenário do resgate

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../_lib/rate-limit', () => ({
  isMessageDuplicate: jest.fn().mockResolvedValue(false),
}));
jest.mock('../_lib/prospecting/prospect-parse', () => ({
  extractProspectCorpo: jest.fn(() => ({ tipo: 'text', corpo: 'voltei, me explica melhor', mediaId: null })),
}));
jest.mock('../_lib/prospecting/prospect-agent', () => ({
  placeholderMidia: jest.fn(() => null),
}));
jest.mock('../_lib/prospecting/prospect-responder', () => ({
  respondToProspect: jest.fn().mockResolvedValue({ action: 'responder' }),
}));
jest.mock('../_lib/prospecting/prospect-store', () => ({
  isOptedOut: jest.fn().mockResolvedValue(false),
  findLeadByPhone: jest.fn(),
  storeMessage: jest.fn().mockResolvedValue({ stored: true }),
  patchLead: jest.fn().mockResolvedValue({ ok: true }), // devolve só {ok} — a raiz do bug
  recordEvent: jest.fn().mockResolvedValue({ stored: true }),
}));

const { handleProspectInbound } = require('../_lib/prospecting/prospect-inbound');
const store = require('../_lib/prospecting/prospect-store');
const { respondToProspect } = require('../_lib/prospecting/prospect-responder');
const { extractProspectCorpo } = require('../_lib/prospecting/prospect-parse');

function req(msg = {}) {
  return {
    body: {
      entry: [{
        changes: [{
          value: {
            contacts: [{ profile: { name: 'Fulano' } }],
            messages: [{ from: '5511999998888', id: 'wamid.in.1', type: 'text', ...msg }],
          },
        }],
      }],
    },
  };
}

describe('prospect-inbound: lead fresco', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    extractProspectCorpo.mockReturnValue({ tipo: 'text', corpo: 'voltei, me explica melhor', mediaId: null });
    store.isOptedOut.mockResolvedValue(false);
    store.findLeadByPhone.mockResolvedValue({
      id: 'lead-1',
      whatsapp_phone: '+5511999998888',
      prospect_state: 'conversando',
      last_in_at: ONTEM, // o inbound ANTERIOR, de 3 dias atrás
    });
  });

  test('passa ao responder um last_in_at recém-atualizado, não o antigo', async () => {
    await handleProspectInbound(null, req());

    expect(respondToProspect).toHaveBeenCalledTimes(1);
    const { lead } = respondToProspect.mock.calls[0][0];

    // O ponto do teste: NÃO pode ser o timestamp velho (que fecharia a janela).
    expect(lead.last_in_at).not.toBe(ONTEM);
    const idadeMs = Date.now() - Date.parse(lead.last_in_at);
    expect(idadeMs).toBeLessThan(10_000); // acabou de chegar → janela aberta
  });

  test('espelha os demais campos do patch (snooze/touch/retorno zerados)', async () => {
    await handleProspectInbound(null, req());
    const { lead } = respondToProspect.mock.calls[0][0];
    expect(lead.snoozed_until).toBeNull();
    expect(lead.next_touch_at).toBeNull();
    expect(lead.retorno_em).toBeNull();
    expect(lead.retorno_motivo).toBeNull();
    // e preserva o resto do lead
    expect(lead.id).toBe('lead-1');
    expect(lead.prospect_state).toBe('conversando');
  });

  test('não muta o objeto original do lead (imutabilidade)', async () => {
    const original = await store.findLeadByPhone();
    await handleProspectInbound(null, req());
    expect(original.last_in_at).toBe(ONTEM);
  });

  test('lead desconhecido não quebra o fluxo', async () => {
    store.findLeadByPhone.mockResolvedValue(null);
    const r = await handleProspectInbound(null, req());
    expect(r).toEqual({ handled: true, reason: 'unknown_number' });
    expect(respondToProspect).not.toHaveBeenCalled();
  });
});

describe('prospect-inbound: falha de transcrição vira evento na timeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store.isOptedOut.mockResolvedValue(false);
    store.findLeadByPhone.mockResolvedValue({
      id: 'lead-audio', whatsapp_phone: '+5511999998888',
      prospect_state: 'conversando', last_in_at: ONTEM,
    });
    extractProspectCorpo.mockReturnValue({ tipo: 'audio', corpo: null, mediaId: 'media-1' });
  });

  test('Whisper falhando registra evento no lead (hoje morria no log)', async () => {
    jest.doMock('../_lib/whatsapp-interactions', () => ({
      transcribeVoiceMessage: jest.fn().mockRejectedValue(new Error('whisper 401')),
    }), { virtual: true });

    await handleProspectInbound(null, req({ type: 'audio' }));

    const chamadas = store.recordEvent.mock.calls.filter((c) => String(c[1]).includes('áudio não transcrito'));
    expect(chamadas.length).toBe(1);
    expect(chamadas[0][0]).toBe('lead-audio');
  });
});
