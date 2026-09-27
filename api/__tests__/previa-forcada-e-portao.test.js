'use strict';

/**
 * A FIAÇÃO das duas travas do diagnóstico de 27/09/2026:
 *  1. Pergunta sobre o produto ou "já resolvido" → o turno É a prévia, mesmo
 *     quando o modelo só responde texto (36 respostas, 0 prévias em 30 dias).
 *  2. Toda resposta passa pelo portão de claims: "a gorjeta vai direto pro
 *     garçom" não sai, e a linha do tempo mostra por quê.
 */

const AGORA_COMERCIAL_MS = Date.UTC(2026, 7, 25, 17, 0, 0); // terça 14:00 SP

const LEAD = { id: 'L1', name: 'Bar Teste', whatsapp_phone: '+5511981890082', prospect_state: 'conversando', conversa_fatos: {} };

function montar({ acao, inbound, previaJaEnviada = false }) {
  jest.resetModules();
  const enviados = [];
  const eventos = [];
  const patches = [];
  const chamadas = [];

  jest.doMock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));
  jest.doMock('../_lib/whatsapp-sender', () => ({
    sendWhatsAppMessage: async (to, texto) => { enviados.push(texto); return { success: true, messageId: 'wamid.X' }; },
  }));
  jest.doMock('../_lib/rate-limit', () => ({ acquireProcessingLock: async () => true, releaseProcessingLock: async () => {} }));
  jest.doMock('../_lib/prospecting/prospect-dry-run', () => ({ isDryRun: () => false }));
  jest.doMock('../_lib/prospecting/routing', () => ({ getProspectingPhoneNumberId: () => '123' }));
  jest.doMock('../_lib/prospecting/prospect-agent', () => ({
    generateReply: async (args) => { chamadas.push(args); return acao; },
    FOUNDER_WHATSAPP: '+5511999990000',
    isFounderNumber: () => false,
  }));
  jest.doMock('../_lib/prospecting/prospect-demo', () => ({
    criarPreviaDemo: async () => ({ ok: true, url: 'https://useracha.app/previa/abc' }),
    previaLinkInHistory: () => (previaJaEnviada ? 'https://useracha.app/previa/old' : null),
  }));
  jest.doMock('../_lib/prospecting/prospect-store', () => ({
    loadHistory: async () => [{ direcao: 'in', corpo: inbound, enviada_em: new Date(AGORA_COMERCIAL_MS - 60000).toISOString() }],
    patchLead: async (id, p) => { patches.push(p); return { ok: true }; },
    recordEvent: async (id, txt) => { eventos.push(txt); },
    storeMessage: async () => ({}),
    isOptedOut: async () => false,
    recordOptout: async () => ({ ok: true }),
    inboundFingerprint: () => 'fp',
    claimInbound: async () => true,
    releaseInbound: async () => {},
    updateIntent: async () => {},
    findLeadByPhone: async () => null,
  }));

  const { respondToProspect } = require('../_lib/prospecting/prospect-responder');
  const rodar = () => respondToProspect({ lead: { ...LEAD }, from: '5511981890082', text: inbound, nowMs: AGORA_COMERCIAL_MS });
  return { rodar, enviados, eventos, patches, chamadas };
}

describe('prévia por garantia', () => {
  test('"o q é racha?" + modelo só responde texto → sai a prévia com link', async () => {
    const t = montar({
      inbound: 'o q é esse racha?',
      acao: { tipo: 'responder', texto: 'é pagar a conta pelo QR, cada um a sua parte. como vocês fecham a conta hoje?' },
    });
    await t.rodar();
    const tudo = t.enviados.join('\n');
    expect(tudo).toContain('https://useracha.app/previa/abc');
    expect(tudo).toContain('é pagar a conta pelo QR');
    expect(tudo).not.toMatch(/como vocês fecham a conta hoje\?/); // a sondagem sai
    expect(t.eventos.join(' ')).toMatch(/prévia enviada/);
    expect(String(t.chamadas[0].injectUserTurn)).toMatch(/criar_demo/);
  });

  test('"a gente já divide na maquininha" → prévia uma vez', async () => {
    const t = montar({
      inbound: 'a gente já divide a conta na maquininha, funciona bem',
      acao: { tipo: 'responder', texto: 'faz sentido.' },
    });
    await t.rodar();
    expect(t.enviados.join('\n')).toContain('https://useracha.app/previa/abc');
  });

  test('prévia já enviada → nada é forçado (não repete o link)', async () => {
    const t = montar({
      inbound: 'como funciona?',
      acao: { tipo: 'responder', texto: 'é pelo QR da mesa' },
      previaJaEnviada: true,
    });
    await t.rodar();
    expect(t.enviados.join('\n')).not.toContain('previa/abc');
    expect(t.chamadas[0].injectUserTurn || null).toBeNull();
  });

  test('conversa comum não é forçada', async () => {
    const t = montar({ inbound: 'bom dia', acao: { tipo: 'responder', texto: 'bom dia!' } });
    await t.rodar();
    expect(t.enviados).toEqual(['bom dia!']);
  });
});

describe('portão de claims no envio', () => {
  test('"a gorjeta vai direto pro garçom" NÃO sai, e o bloqueio fica registrado', async () => {
    const t = montar({
      inbound: 'bom dia',
      acao: { tipo: 'responder', texto: 'cada um paga a sua parte e a gorjeta vai direto pro garçom' },
    });
    await t.rodar();
    expect(t.enviados).toEqual([]);
    expect(t.eventos.join(' ')).toMatch(/BLOQUEADA.*gorjeta-direta/);
  });
});
