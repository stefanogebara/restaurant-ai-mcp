/**
 * Reproduz o incidente de 04/ago/2026: 23 de 67 donos receberam a abordagem
 * fria 2x ou 3x.
 *
 * Causa: `sendTemplateMessage` devolvia `{success:false}` tanto quando a Meta
 * RECUSAVA (nada saiu) quanto quando dava timeout (pode ter saído). O
 * sequencer tratava os dois como 'failed', e markIntro devolvia o lead para a
 * fila zerando `whatsapp_sent_at`. Sob a pressão de 60 envios numa invocação
 * só, o timeout virou comum — e cada um virou um reenvio de template que a
 * Meta já tinha entregue.
 *
 * A regra que estes testes prendem: incerteza NUNCA devolve o lead para a fila.
 */

const AMBIGUO = { success: false, ambiguo: true, error: 'network timeout' };
const RECUSADO = { success: false, error: '(#132000) Template does not exist' };
const OK = { success: true, messageId: 'wamid.TESTE123' };

// Sem isto o dispatch retorna no guard de dry-run e NENHUM teste aqui
// exercita o caminho de envio — todos passariam vazios, que foi exatamente o
// que aconteceu na primeira execução desta suíte.
process.env.PROSPECTING_DRY_RUN = 'false';
process.env.PROSPECTING_PHONE_NUMBER_ID = 'PNUM';

function montar(resultadoDoEnvio) {
  const patches = [];
  jest.resetModules();

  jest.doMock('../_lib/secure-logger', () => ({
    createSecureLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
  }));
  jest.doMock('../_lib/prospecting/routing', () => ({ getProspectingPhoneNumberId: () => 'PNUM' }));
  jest.doMock('../_lib/cron-config', () => ({ isCronEnabled: async () => true }));
  jest.doMock('../_lib/prospecting/prospect-warmup', () => ({
    consumeSendSlot: jest.fn(async () => ({ allowed: true, count: 1, cap: 100 })),
  }));
  jest.doMock('../_lib/prospecting/prospect-hours', () => ({
    dentroDaJanelaDisparo: () => true,
    dentroDoHorario: () => true,
    proximaAbertura: () => new Date().toISOString(),
    deferralDentroDaJanela: () => new Date().toISOString(),
    decisaoForaDeHorario: () => ({ acao: 'responder' }),
    computeRetornoAt: () => new Date().toISOString(),
    JANELA_CLAMP_MS: 1,
  }));
  jest.doMock('../_lib/whatsapp-sender', () => ({
    sendTemplateMessage: jest.fn(async () => resultadoDoEnvio),
    sendWhatsAppMessage: jest.fn(async () => ({ success: true })),
  }));
  jest.doMock('../_lib/prospecting/prospect-store', () => ({
    selectIntroCandidates: jest.fn(async () => ([
      { id: 'lead-1', name: 'Gula Gula Jardim Paulista', whatsapp_phone: '+5511962846820' },
    ])),
    claimIntro: jest.fn(async () => true),
    markIntro: jest.fn(async (id, campos) => { patches.push(campos); return true; }),
    patchLead: jest.fn(async () => true),
    storeMessage: jest.fn(async () => true),
    isOptedOut: jest.fn(async () => false),
    // pickTemplate é função LOCAL do sequencer e lê daqui. Lista vazia faz o
    // dispatch cair em preview-only e nenhum teste desta suíte exercita envio.
    listTemplates: jest.fn(async () => ([
      { variant_label: 'C', meta_template_name: 'olimpia_intro_c', template_lang: 'pt_BR', active: true },
    ])),
    selectDueTouches: jest.fn(async () => []),
    selectReferralIntroCandidates: jest.fn(async () => []),
    selectHandoffLeads: jest.fn(async () => []),
    reclaimHandoffToConversando: jest.fn(async () => ({ reclaimed: false })),
    selectReengageCandidates: jest.fn(async () => []),
    getLeadHistory: jest.fn(async () => []),
    recordEvent: jest.fn(async () => true),
  }));

  const seq = require('../_lib/prospecting/sequencer');
  return { seq, patches };
}

afterEach(() => { jest.resetModules(); });

describe('dispatchIntros — envio com resultado AMBÍGUO', () => {
  it('NÃO devolve o lead para a fila (o bug que reenviou para 23 donos)', async () => {
    const { seq, patches } = montar(AMBIGUO);
    await seq.dispatchIntros({ limit: 1 });

    // Prova que o caminho de envio FOI exercitado. Sem isto, um guard novo
    // (dry-run, janela, kill switch) faria a asserção abaixo passar vazia —
    // e um teste que passa sem rodar o código não protege nada.
    expect(patches.length).toBeGreaterThan(0);

    // Só 'failed' zera whatsapp_sent_at em markIntro; qualquer outro status
    // preserva o claim. A decisão do sequencer é o que decide se reenvia.
    expect(patches.map((p) => p.status)).not.toContain('failed');
  });

  it('marca como unknown, não como failed — o painel precisa ver a diferença', async () => {
    const { seq, patches } = montar(AMBIGUO);
    await seq.dispatchIntros({ limit: 1 });
    expect(patches.map((p) => p.status)).toContain('unknown');
    expect(patches.map((p) => p.status)).not.toContain('failed');
  });

  it('conta como ambíguo no resumo, sem inflar o contador de enviados', async () => {
    const { seq } = montar(AMBIGUO);
    const r = await seq.dispatchIntros({ limit: 1 });
    expect(r.ambiguos).toBe(1);
    expect(r.sent).toBe(0);
  });
});

describe('dispatchIntros — recusa EXPLÍCITA da Meta', () => {
  it('devolve o lead para a fila: aqui sabemos que nada saiu', async () => {
    const { seq, patches } = montar(RECUSADO);
    await seq.dispatchIntros({ limit: 1 });
    // 'failed' é o ÚNICO status que markIntro traduz em whatsapp_sent_at=null.
    expect(patches.map((p) => p.status)).toContain('failed');
  });

  it('conta como failed, não como ambíguo', async () => {
    const { seq } = montar(RECUSADO);
    const r = await seq.dispatchIntros({ limit: 1 });
    expect(r.failed).toBe(1);
    expect(r.ambiguos).toBeUndefined();
  });
});

describe('dispatchIntros — envio bem-sucedido segue igual', () => {
  it('mantém o claim e conta como enviado', async () => {
    const { seq, patches } = montar(OK);
    const r = await seq.dispatchIntros({ limit: 1 });
    expect(r.sent).toBe(1);
    expect(patches.map((p) => p.status)).toContain('sent');
    expect(patches.map((p) => p.status)).not.toContain('failed');
  });
});
