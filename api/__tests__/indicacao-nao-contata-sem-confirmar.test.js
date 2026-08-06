'use strict';

/**
 * A FIAÇÃO da trava de indicação.
 *
 * O módulo puro (indicacao.js) decide "confirmar antes de escrever". Este teste
 * garante que o responder OBEDECE — que registrar_responsavel para de criar
 * lead e disparar intro no mesmo turno, e que só confirmar_indicacao destrava.
 *
 * Existe porque quando a trava foi escrita, a suíte inteira passou sem mudar
 * uma linha: o teste de indicação cobria createReferralLead (store) e o
 * dispatcher, mas NINGUÉM cobria a decisão do responder de chamá-los. Mudei o
 * caminho mais sensível do sistema e nada quebrou — que é o sintoma de
 * cobertura ausente, não de mudança segura.
 */

const LEAD = {
  id: 'L1',
  name: 'Capim Santo',
  whatsapp_phone: '+5511981890082',
  prospect_state: 'conversando',
  conversa_fatos: {},
};

function montar({ acao, numeroIndicado = null, donoDoNumero = null }) {
  jest.resetModules();
  const criados = [];
  const disparos = [];
  const patches = [];
  const eventos = [];

  jest.doMock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));
  jest.doMock('../_lib/whatsapp-sender', () => ({ sendWhatsAppMessage: async () => ({ success: true, messageId: 'wamid.X' }) }));
  jest.doMock('../_lib/rate-limit', () => ({ acquireProcessingLock: async () => true, releaseProcessingLock: async () => {} }));
  jest.doMock('../_lib/prospecting/prospect-dry-run', () => ({ isDryRun: () => false }));
  jest.doMock('../_lib/prospecting/routing', () => ({ getProspectingPhoneNumberId: () => '123' }));
  jest.doMock('../_lib/prospecting/prospect-agent', () => ({
    generateReply: async () => acao,
    FOUNDER_WHATSAPP: '+5511999990000',
    isFounderNumber: () => false,
  }));
  jest.doMock('../_lib/prospecting/prospect-store', () => ({
    loadHistory: async () => [{ direcao: 'in', corpo: 'oi', enviada_em: new Date().toISOString() }],
    patchLead: async (id, p) => { patches.push({ id, p }); return { ok: true }; },
    recordEvent: async (id, txt) => { eventos.push(txt); },
    storeMessage: async () => ({}),
    isOptedOut: async () => false,
    recordOptout: async () => ({ ok: true }),
    inboundFingerprint: () => 'fp',
    claimInbound: async () => true,
    releaseInbound: async () => {},
    updateIntent: async () => {},
    findLeadByPhone: async () => donoDoNumero,
    createReferralLead: async (from, numero) => { criados.push(numero); return { ok: true, created: true, leadId: 'REF1' }; },
  }));
  jest.doMock('../_lib/prospecting/sequencer', () => ({
    dispatchReferralIntros: async (args) => { disparos.push(args); return { sent: 1 }; },
  }));

  const { respondToProspect } = require('../_lib/prospecting/prospect-responder');
  const lead = { ...LEAD, numero_indicado: numeroIndicado };
  return { respondToProspect, lead, criados, disparos, patches, eventos };
}

const registrar = { tipo: 'registrar_responsavel', numero: '+5511977117070', nome: 'Adriana', texto: '' };

describe('indicação não vira contato sem a casa confirmar', () => {
  test('registrar_responsavel NÃO cria lead nem dispara intro', async () => {
    const t = montar({ acao: registrar });
    await t.respondToProspect({ lead: t.lead, from: '5511981890082', text: 'o contato é esse' });

    expect(t.criados).toEqual([]);   // era aqui que o lead nascia
    expect(t.disparos).toEqual([]);  // e aqui que a intro saía
  });

  test('registrar_responsavel guarda a indicação como PENDENTE de confirmação', async () => {
    const t = montar({ acao: registrar });
    await t.respondToProspect({ lead: t.lead, from: '5511981890082', text: 'o contato é esse' });

    const patch = t.patches.find((p) => p.p && p.p.numero_indicado);
    expect(patch).toBeDefined();
    expect(patch.p.numero_indicado).toBe('+5511977117070');
    expect(String(patch.p.numero_indicado_contexto)).toMatch(/confirmar/i);
  });

  test('número que já é de outro lead nem chega a virar indicação pendente', async () => {
    const t = montar({ acao: registrar, donoDoNumero: { id: 'OUTRO', name: 'Bráz' } });
    await t.respondToProspect({ lead: t.lead, from: '5511981890082', text: 'o contato é esse' });

    expect(t.criados).toEqual([]);
    expect(t.patches.some((p) => p.p && p.p.numero_indicado)).toBe(false);
    expect(t.eventos.join(' ')).toMatch(/ja_e_de_outro_lead|já é de outro/i);
  });

  test('confirmar_indicacao(true) é o que finalmente cria o lead e dispara', async () => {
    const t = montar({
      acao: { tipo: 'confirmar_indicacao', confirmado: true, texto: 'perfeito!' },
      numeroIndicado: '+5511977117070',
    });
    await t.respondToProspect({ lead: t.lead, from: '5511981890082', text: 'sim, é ela' });

    expect(t.criados).toEqual(['+5511977117070']);
    expect(t.disparos.length).toBe(1);
  });

  test('confirmar_indicacao(false) descarta sem contatar ninguém', async () => {
    const t = montar({
      acao: { tipo: 'confirmar_indicacao', confirmado: false, texto: 'ah, entendi!' },
      numeroIndicado: '+5511977117070',
    });
    await t.respondToProspect({ lead: t.lead, from: '5511981890082', text: 'nao, esse ta errado' });

    expect(t.criados).toEqual([]);
    expect(t.disparos).toEqual([]);
    expect(t.eventos.join(' ')).toMatch(/NEGOU/);
  });

  test('confirmação sem indicação pendente não inventa contato', async () => {
    const t = montar({ acao: { tipo: 'confirmar_indicacao', confirmado: true, texto: 'ok' } });
    await t.respondToProspect({ lead: t.lead, from: '5511981890082', text: 'sim' });

    expect(t.criados).toEqual([]);
    expect(t.disparos).toEqual([]);
  });
});
