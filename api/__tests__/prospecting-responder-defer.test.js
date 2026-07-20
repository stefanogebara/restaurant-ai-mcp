/**
 * Responder — transient LLM failure must DEFER the turn, not hang the thread.
 *
 * Incident 2026-07-06: OpenRouter 402 (and an invalid fallback key) made
 * generateReply return { tipo:'nada', motivo:'erro LLM: …' }; the responder
 * treated it as deliberate silence and live threads hung with no retry. The
 * contract now: provider/budget failures re-queue via reply_apos (+15 min,
 * flush cron retries) and GIVE BACK the per-inbound claim so the retry can
 * claim the same wamid again. Deliberate/anomalous-but-content-dependent
 * silences (resposta vazia, truncada, tool 'ignorar') stay silent.
 */

process.env.PROSPECTING_IGNORE_HOURS = 'true';

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
}));

const store = require('../_lib/prospecting/prospect-store');
const { generateReply } = require('../_lib/prospecting/prospect-agent');
const { respondToProspect } = require('../_lib/prospecting/prospect-responder');

const NOW = new Date('2026-07-07T15:00:00Z').getTime();

function makeLead(extra = {}) {
  return {
    id: 'L1',
    name: 'Cantina Teste',
    prospect_state: 'conversando',
    last_in_at: new Date(NOW - 3600e3).toISOString(),
    whatsapp_send_status: 'read',
    reply_apos: null,
    whatsapp_phone: '5511999990000',
    conversa_fatos: null,
    conversa_resumo: null,
    ...extra,
  };
}

function primeHistory() {
  store.loadHistory.mockResolvedValue([
    { direcao: 'out', corpo: 'intro', tipo: 'template', wamid: 'wamid.OUT1' },
    { direcao: 'in', corpo: 'oi, pode falar', tipo: 'text', wamid: 'wamid.IN1' },
  ]);
}

describe('respondToProspect — transient LLM failure defers instead of hanging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    primeHistory();
    process.env.PROSPECTING_DRY_RUN = 'false'; // live path: claim + release em jogo
  });
  afterAll(() => {
    delete process.env.PROSPECTING_DRY_RUN;
  });

  test("motivo 'erro LLM: …' → reply_apos +15min, claim devolvido, evento registrado", async () => {
    generateReply.mockResolvedValue({ tipo: 'nada', motivo: 'erro LLM: OpenRouter API error 402' });

    await respondToProspect({ lead: makeLead(), from: '5511999990000', text: 'oi', nowMs: NOW, skipPacing: true });

    const patch = store.patchLead.mock.calls.at(-1)[1];
    expect(patch.reply_apos).toBe(new Date(NOW + 15 * 60 * 1000).toISOString());
    expect(store.releaseInbound).toHaveBeenCalledWith('L1', 'wamid.IN1');
    const eventos = store.recordEvent.mock.calls.map((c) => c[1]).join(' | ');
    expect(eventos).toMatch(/IA indisponível/);
  });

  test("motivo 'orçamento de LLM…' (corrida pós-gate) → mesmo defer", async () => {
    generateReply.mockResolvedValue({ tipo: 'nada', motivo: 'orçamento de LLM esgotado nesta hora' });

    await respondToProspect({ lead: makeLead(), from: '5511999990000', text: 'oi', nowMs: NOW, skipPacing: true });

    const patch = store.patchLead.mock.calls.at(-1)[1];
    expect(patch.reply_apos).toBe(new Date(NOW + 15 * 60 * 1000).toISOString());
    expect(store.releaseInbound).toHaveBeenCalledWith('L1', 'wamid.IN1');
  });

  test('nada por conteúdo (resposta vazia) continua silêncio deliberado — sem defer, sem release', async () => {
    generateReply.mockResolvedValue({ tipo: 'nada', motivo: 'resposta vazia do LLM' });

    await respondToProspect({ lead: makeLead(), from: '5511999990000', text: 'oi', nowMs: NOW, skipPacing: true });

    for (const [, patch] of store.patchLead.mock.calls) {
      expect(patch.reply_apos).toBeUndefined();
    }
    expect(store.releaseInbound).not.toHaveBeenCalled();
  });

  test('em dry-run não há claim → defer acontece, release não', async () => {
    process.env.PROSPECTING_DRY_RUN = 'true';
    generateReply.mockResolvedValue({ tipo: 'nada', motivo: 'erro LLM: 401 invalid x-api-key' });

    await respondToProspect({ lead: makeLead(), from: '5511999990000', text: 'oi', nowMs: NOW, skipPacing: true });

    const patch = store.patchLead.mock.calls.at(-1)[1];
    expect(patch.reply_apos).toBe(new Date(NOW + 15 * 60 * 1000).toISOString());
    expect(store.releaseInbound).not.toHaveBeenCalled();
  });
});

// Incidente 2026-07-20 (Meta #131000): a parte cujo ENVIO falhou era armazenada
// como turno 'out' mesmo assim — o histórico "acha" que respondeu, o guard
// last_message_is_ours bloqueia qualquer retry e o modelo nunca repete a
// mensagem que o lead nunca recebeu. Contrato novo: só parte ENTREGUE entra.
describe('sendReply — parte com envio falhado não vira turno fantasma', () => {
  const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');

  beforeEach(() => {
    jest.clearAllMocks();
    primeHistory();
    process.env.PROSPECTING_DRY_RUN = 'false';
  });
  afterAll(() => {
    delete process.env.PROSPECTING_DRY_RUN;
  });

  test('Meta 5xx no envio → NENHUM out armazenado (resgate do flush continua possível)', async () => {
    generateReply.mockResolvedValue({ tipo: 'responder', texto: 'olá! te mostro uma prévia?' });
    sendWhatsAppMessage.mockResolvedValueOnce({ success: false });

    await respondToProspect({ lead: makeLead(), from: '5511999990000', text: 'oi', nowMs: NOW, skipPacing: true });

    const outs = store.storeMessage.mock.calls.filter(([arg]) => arg && arg.direcao === 'out');
    expect(outs).toHaveLength(0);
  });

  test('envio ok → parte armazenada como out com o wamid (comportamento normal preservado)', async () => {
    generateReply.mockResolvedValue({ tipo: 'responder', texto: 'olá!' });

    await respondToProspect({ lead: makeLead(), from: '5511999990000', text: 'oi', nowMs: NOW, skipPacing: true });

    const outs = store.storeMessage.mock.calls.filter(([arg]) => arg && arg.direcao === 'out');
    expect(outs).toHaveLength(1);
    expect(outs[0][0].wamid).toBe('wamid.out');
  });
});
