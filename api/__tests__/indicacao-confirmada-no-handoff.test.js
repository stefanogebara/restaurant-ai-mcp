'use strict';

/**
 * A resposta da casa à pergunta da indicação NÃO morre no estado mudo.
 *
 * Piloto do Racha, 29/09/2026: com o lead em 'handoff' (registrar_responsavel
 * põe lá) e a indicação pendente, a casa respondeu "É o responsável" e "Chamar
 * esse número" — e o portão de estado calou tudo. Ninguém foi contatado.
 */

const AGORA_COMERCIAL_MS = Date.UTC(2026, 7, 25, 17, 0, 0); // terça 14:00 SP

function montar({ inbound, numeroIndicado = '+5511981443082', estado = 'handoff',
  contexto = 'indicado como "Rafael"; aguardando a casa confirmar',
  indicadoEm = new Date(AGORA_COMERCIAL_MS - 10 * 60000).toISOString(),
  historico = null }) {
  jest.resetModules();
  const criados = [];
  const disparos = [];
  const enviados = [];
  const avisos = [];
  const chamadasLLM = [];

  jest.doMock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));
  jest.doMock('../_lib/whatsapp-sender', () => ({ sendWhatsAppMessage: async (to, t) => { enviados.push(t); return { success: true, messageId: 'wamid.X' }; } }));
  jest.doMock('../_lib/rate-limit', () => ({ acquireProcessingLock: async () => true, releaseProcessingLock: async () => {} }));
  jest.doMock('../_lib/prospecting/prospect-dry-run', () => ({ isDryRun: () => false }));
  jest.doMock('../_lib/prospecting/routing', () => ({ getProspectingPhoneNumberId: () => '123' }));
  jest.doMock('../_lib/prospecting/prospect-agent', () => ({
    generateReply: async (a) => { chamadasLLM.push(a); return { tipo: 'responder', texto: 'oi' }; },
    FOUNDER_WHATSAPP: '+5511999990000',
    isFounderNumber: () => false,
  }));
  jest.doMock('../_lib/prospecting/founder-alert', () => ({
    deveAvisarFundador: () => true, buildFounderAlert: () => ({}), eventoDeAviso: () => '',
  }));
  jest.doMock('../_lib/prospecting/prospect-store', () => ({
    loadHistory: async () => historico || [
      { direcao: 'out', tipo: 'text', corpo: 'esse número é mesmo dele?', enviada_em: new Date(AGORA_COMERCIAL_MS - 120000).toISOString() },
      { direcao: 'in', tipo: 'text', corpo: inbound, wamid: 'w1', enviada_em: new Date(AGORA_COMERCIAL_MS - 60000).toISOString() },
    ],
    patchLead: async () => ({ ok: true }),
    recordEvent: async (id, t) => { avisos.push(t); },
    storeMessage: async () => ({}),
    isOptedOut: async () => false,
    recordOptout: async () => ({ ok: true }),
    inboundFingerprint: () => 'fp',
    claimInbound: async () => true,
    releaseInbound: async () => {},
    updateIntent: async () => {},
    findLeadByPhone: async () => null,
    createReferralLead: async (lead, numero) => { criados.push(numero); return { ok: true, created: true, leadId: 'REF1' }; },
  }));
  jest.doMock('../_lib/prospecting/sequencer', () => ({
    dispatchReferralIntros: async (a) => { disparos.push(a); return { sent: 1 }; },
  }));

  const { respondToProspect } = require('../_lib/prospecting/prospect-responder');
  const lead = {
    id: 'L1', name: 'Notizia', whatsapp_phone: '+5511900000000', prospect_state: estado,
    numero_indicado: numeroIndicado, numero_indicado_contexto: contexto, numero_indicado_em: indicadoEm,
    conversa_fatos: { nome_responsavel: 'Rafael' },
    last_in_at: new Date(AGORA_COMERCIAL_MS - 60000).toISOString(),
  };
  const rodar = () => respondToProspect({ lead, from: '5511900000000', text: inbound, nowMs: AGORA_COMERCIAL_MS });
  return { rodar, criados, disparos, enviados, avisos, chamadasLLM };
}

describe('a confirmação da indicação passa pelo estado mudo', () => {
  test.each(['É o responsável', 'Chamar esse número'])('"%s" → o indicado vira lead e recebe a intro', async (inbound) => {
    const t = montar({ inbound });
    await t.rodar();
    expect(t.criados).toEqual(['+5511981443082']);
    expect(t.disparos.length).toBe(1);
    expect(t.chamadasLLM.length).toBe(0); // decisão determinística, sem modelo
  });

  test('"não é ele" → descarta, sem contato', async () => {
    const t = montar({ inbound: 'não é ele' });
    await t.rodar();
    expect(t.criados).toEqual([]);
    expect(t.avisos.join(' ')).toMatch(/NEGOU/);
  });

  test('ambíguo continua mudo, com o fundador', async () => {
    const t = montar({ inbound: 'boa tarde, tudo bem?' });
    const r = await t.rodar();
    expect(r.reason).toBe('silent_state:handoff');
    expect(t.enviados).toEqual([]);
    expect(t.criados).toEqual([]);
  });

  test('handoff SEM indicação pendente continua mudo, mesmo com "sim"', async () => {
    const t = montar({ inbound: 'sim', numeroIndicado: null });
    const r = await t.rodar();
    expect(r.reason).toBe('silent_state:handoff');
  });

  test('indicação JÁ confirmada não reabre a porta: outro "sim" fica mudo', async () => {
    const t = montar({ inbound: 'sim', contexto: 'confirmado pela casa' });
    const r = await t.rodar();
    expect(r.reason).toBe('silent_state:handoff');
    expect(t.criados).toEqual([]);
  });

  test('cartão de robô (o fundador confirma à mão) não é confirmado por "sim"', async () => {
    const t = montar({ inbound: 'Sim', contexto: 'cartão enviado pelo atendimento AUTOMÁTICO como "Comercial"; o fundador confirma à mão' });
    const r = await t.rodar();
    expect(r.reason).toBe('silent_state:handoff');
    expect(t.criados).toEqual([]);
  });

  test('"sim" 3 dias depois da pergunta é resposta a outra coisa', async () => {
    const t = montar({ inbound: 'sim', indicadoEm: new Date(AGORA_COMERCIAL_MS - 72 * 3600000).toISOString() });
    const r = await t.rodar();
    expect(r.reason).toBe('silent_state:handoff');
    expect(t.criados).toEqual([]);
  });

  test('rajada: "sim" e logo depois "não é ele" — vale a ÚLTIMA, e nada é enviado', async () => {
    const t = montar({
      inbound: 'sim',
      historico: [
        { direcao: 'out', tipo: 'text', corpo: 'esse número é mesmo dele?', enviada_em: new Date(AGORA_COMERCIAL_MS - 120000).toISOString() },
        { direcao: 'in', tipo: 'text', corpo: 'sim', wamid: 'w1', enviada_em: new Date(AGORA_COMERCIAL_MS - 60000).toISOString() },
        { direcao: 'in', tipo: 'text', corpo: 'ah não, é o do meu irmão', wamid: 'w2', enviada_em: new Date(AGORA_COMERCIAL_MS - 50000).toISOString() },
      ],
    });
    const r = await t.rodar();
    expect(r.reason).toBe('silent_state:handoff');
    expect(t.criados).toEqual([]);
    expect(t.enviados).toEqual([]);
  });

  test('"sim" que responde OUTRA pergunta (a última nossa não é a do número) não confirma', async () => {
    const t = montar({
      inbound: 'sim',
      historico: [
        { direcao: 'out', tipo: 'text', corpo: 'esse número é mesmo dele?', enviada_em: new Date(AGORA_COMERCIAL_MS - 600000).toISOString() },
        { direcao: 'out', tipo: 'texto', corpo: 'Oi! Aqui é o Stefano. Posso te ligar amanhã?', enviada_em: new Date(AGORA_COMERCIAL_MS - 120000).toISOString() },
        { direcao: 'in', tipo: 'text', corpo: 'sim', wamid: 'w1', enviada_em: new Date(AGORA_COMERCIAL_MS - 60000).toISOString() },
      ],
    });
    const r = await t.rodar();
    expect(r.reason).toBe('silent_state:handoff');
    expect(t.criados).toEqual([]);
  });
});
