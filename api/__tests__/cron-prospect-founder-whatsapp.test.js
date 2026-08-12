'use strict';

/**
 * 3ª fase do cron: WhatsApp do fundador (Fase 2 do plano).
 *
 * Prova a fiação e as três coisas que, se quebrarem, doem em produção:
 * texto livre NUNCA sai fora da janela de 24h (é o que a Meta bloqueia e o que
 * derruba a qualidade do número), o toque é gravado como OUT no histórico (sem
 * isso o monitor de resposta fica cego), e o resultado do sender é CHECADO (ele
 * devolve { success } em vez de estourar).
 */

const mockLogCronRun = jest.fn().mockResolvedValue(undefined);
jest.mock('../_lib/cron-tracker', () => ({ logCronRun: (...a) => mockLogCronRun(...a), logCronError: jest.fn() }));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));
jest.mock('../_lib/secure-compare', () => ({ bearerEquals: () => true }));
const mockSwitches = { valores: {} };
jest.mock('../_lib/cron-config', () => ({
  isCronEnabled: async (job) => (job in mockSwitches.valores ? mockSwitches.valores[job] : true),
}));

const mockWaQueue = { leads: [], historico: [] };
const mockRecordEvent = jest.fn().mockResolvedValue({ stored: true });
const mockStoreMessage = jest.fn().mockResolvedValue({ stored: true });
jest.mock('../_lib/prospecting/prospect-store', () => ({
  selectFounderEmailQueue: async () => [],
  selectFounderFollowupCandidates: async () => [],
  selectFounderWhatsappQueue: async () => mockWaQueue.leads,
  loadHistory: async () => mockWaQueue.historico,
  isOptedOut: async () => false,
  recordEvent: (...a) => mockRecordEvent(...a),
  storeMessage: (...a) => mockStoreMessage(...a),
}));

jest.mock('../_lib/prospecting/prospect-agent', () => ({
  isFounderNumber: (fone) => fone === '+5511999002121',
}));

const mockSendLivre = jest.fn().mockResolvedValue({ success: true, messageId: 'wamid.livre' });
const mockSendTemplate = jest.fn().mockResolvedValue({ success: true, messageId: 'wamid.tpl' });
jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: (...a) => mockSendLivre(...a),
  sendTemplateMessage: (...a) => mockSendTemplate(...a),
}));

jest.mock('../_lib/email', () => ({ sendProspectProposalEmail: jest.fn().mockResolvedValue(true) }));

const handler = require('../cron/prospect-founder-email');
const wa = require('../_lib/prospecting/founder-whatsapp');

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

function lead(over = {}) {
  return {
    id: over.id || 'l1',
    name: 'name' in over ? over.name : 'Bario Bar',
    owner_name: 'Leo',
    prospect_email: null,
    prospect_state: 'handoff',
    whatsapp_phone: over.whatsapp_phone || '+5511915167135',
  };
}
const inbound = (msAtras) => ({ direcao: 'in', corpo: 'oi', created_at: new Date(Date.now() - msAtras).toISOString() });
const introEnviada = (msAtras, via = 'template') => ({
  direcao: 'sys', corpo: wa.eventoDeIntro(via), created_at: new Date(Date.now() - msAtras).toISOString(),
});

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
  mockWaQueue.leads = [];
  mockWaQueue.historico = [];
  mockSendLivre.mockResolvedValue({ success: true, messageId: 'wamid.livre' });
  mockSendTemplate.mockResolvedValue({ success: true, messageId: 'wamid.tpl' });
  process.env.CRON_SECRET = 'segredo';
  // O disparo do fundador passa pelo MESMO guard do motor da Olímpia
  // (prospect-dry-run). Estes testes provam o caminho de envio, então armam o
  // ambiente explicitamente; o bloco no fim do arquivo prova o guard em si.
  process.env.PROSPECTING_DRY_RUN = 'false';
  process.env.PROSPECTING_PHONE_NUMBER_ID = '999';
  mockSwitches.valores = {};
});

describe('a janela de 24h decide o modo, e nunca o contrário', () => {
  test('sem inbound recente: sai TEMPLATE aprovado, nunca texto livre', () => {
    mockWaQueue.leads = [lead()];
    mockWaQueue.historico = [inbound(40 * HORA)];
    return chamar().then((res) => {
      expect(mockSendLivre).not.toHaveBeenCalled();
      expect(mockSendTemplate).toHaveBeenCalledTimes(1);

      const [fone, template, idioma, params] = mockSendTemplate.mock.calls[0];
      expect(fone).toBe('+5511915167135');
      expect(template).toBe('racha_fundador_intro');
      expect(idioma).toBe('pt_BR');
      expect(params).toEqual(['Leo', 'Bario Bar']);
      expect(res.body.whatsapp.enviados).toBe(1);
    });
  });

  test('com inbound recente: sai texto livre', async () => {
    mockWaQueue.leads = [lead()];
    mockWaQueue.historico = [inbound(2 * HORA)];
    await chamar();

    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockSendLivre).toHaveBeenCalledTimes(1);
    expect(mockSendLivre.mock.calls[0][1]).toMatch(/fundador do Racha/);
  });

  test('lead sem histórico nenhum ainda usa template (janela fechada por padrão)', async () => {
    mockWaQueue.leads = [lead()];
    mockWaQueue.historico = [];
    await chamar();
    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
    expect(mockSendLivre).not.toHaveBeenCalled();
  });
});

describe('o toque fica visível para o resto do sistema', () => {
  test('grava OUT no histórico, não só um evento', async () => {
    // Sem o OUT o monitor de resposta não sabe que houve toque, e o follow-up
    // não tem âncora temporal.
    mockWaQueue.leads = [lead()];
    await chamar();

    expect(mockStoreMessage).toHaveBeenCalledTimes(1);
    const arg = mockStoreMessage.mock.calls[0][0];
    expect(arg.direcao).toBe('out');
    expect(arg.leadId).toBe('l1');
    expect(arg.raw.fundador).toBe(true);
  });

  test('o evento registra por qual modo saiu', async () => {
    mockWaQueue.leads = [lead()];
    mockWaQueue.historico = [inbound(2 * HORA)];
    await chamar();
    expect(mockRecordEvent.mock.calls[0][1]).toBe(wa.eventoDeIntro('livre'));
  });
});

describe('follow-up por WhatsApp', () => {
  test('silêncio depois da intro vira follow-up com o template certo', async () => {
    mockWaQueue.leads = [lead()];
    mockWaQueue.historico = [introEnviada(6 * DIA)];
    const res = await chamar();

    expect(mockSendTemplate.mock.calls[0][1]).toBe('racha_fundador_followup');
    expect(res.body.whatsapp.resultados[0].tipo).toBe('followup');
  });

  test('quem respondeu depois da intro não leva cobrança', async () => {
    mockWaQueue.leads = [lead()];
    mockWaQueue.historico = [introEnviada(6 * DIA), inbound(5 * DIA)];
    const res = await chamar();

    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockSendLivre).not.toHaveBeenCalled();
    expect(res.body.whatsapp.enviados).toBe(0);
  });

  test('follow-up NUNCA sai como texto livre, mesmo com a janela aberta', async () => {
    // Janela aberta + follow-up devido seria uma segunda mensagem livre numa
    // conversa que o lead não retomou.
    mockWaQueue.leads = [lead()];
    mockWaQueue.historico = [introEnviada(6 * DIA), { direcao: 'out', corpo: 'x', created_at: new Date().toISOString() }];
    await chamar();
    expect(mockSendLivre).not.toHaveBeenCalled();
  });
});

describe('falha do sender não vira sucesso silencioso', () => {
  test('{ success: false } é tratado como falha e NÃO marca o lead', async () => {
    // O sender devolve envelope em vez de estourar. Não checar seria exatamente
    // o "envio silenciosamente falso" que já mordeu este projeto.
    mockWaQueue.leads = [lead()];
    mockSendTemplate.mockResolvedValue({ success: false, error: 'template pausado' });
    const res = await chamar();

    expect(res.body.whatsapp.enviados).toBe(0);
    expect(res.body.whatsapp.resultados[0].motivo).toBe('send_failed');
    expect(mockStoreMessage).not.toHaveBeenCalled();

    const eventos = mockRecordEvent.mock.calls.map((c) => c[1]);
    expect(eventos.some((e) => /falha no WhatsApp/.test(e))).toBe(true);
    expect(eventos.some((e) => /intro do fundador enviada/.test(e))).toBe(false);
  });
});

describe('filtros e limites', () => {
  test('lead sem nome não recebe (não inventa {{2}})', async () => {
    mockWaQueue.leads = [lead({ name: '' })];
    const res = await chamar();
    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(res.body.whatsapp.resultados[0].motivo).toBe('lead_sem_nome');
  });

  test('lead de teste do fundador é excluído', async () => {
    mockWaQueue.leads = [lead({ whatsapp_phone: '+5511999002121' })];
    await chamar();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('dry-run mostra a prévia sem enviar nem marcar', async () => {
    mockWaQueue.leads = [lead()];
    const res = await chamar({ dry: true });

    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockStoreMessage).not.toHaveBeenCalled();
    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(res.body.whatsapp.resultados[0].dry).toBe(true);
    expect(res.body.whatsapp.resultados[0].via).toBe('template');
  });

  test('o ponto no cron_runs registra as três fases', async () => {
    mockWaQueue.leads = [lead()];
    await chamar();
    expect(mockLogCronRun).toHaveBeenCalledWith(
      'prospect-founder-email',
      expect.objectContaining({ enviados: 0, followups: 0, whatsapp: 1 })
    );
  });
});

describe('o guard de dry-run do motor vale para o WhatsApp do fundador', () => {
  // prospect-dry-run.js e' A UNICA definicao de "isto manda de verdade?", e o
  // proprio arquivo documenta que o bug anterior nasceu de duas copias da regra.
  // Chamar o sender direto criaria uma terceira via: quem desarmasse o disparo
  // da Olimpia continuaria com o WhatsApp do fundador saindo.
  const salvo = {};
  beforeEach(() => {
    salvo.dry = process.env.PROSPECTING_DRY_RUN;
    salvo.phone = process.env.WHATSAPP_PHONE_NUMBER_ID;
    salvo.prospPhone = process.env.PROSPECTING_PHONE_NUMBER_ID;
  });
  afterEach(() => {
    for (const [k, v] of [
      ['PROSPECTING_DRY_RUN', salvo.dry],
      ['WHATSAPP_PHONE_NUMBER_ID', salvo.phone],
      ['PROSPECTING_PHONE_NUMBER_ID', salvo.prospPhone],
    ]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  test('PROSPECTING_DRY_RUN ausente segura o envio (fail-safe)', async () => {
    delete process.env.PROSPECTING_DRY_RUN;
    process.env.PROSPECTING_PHONE_NUMBER_ID = '999';
    mockWaQueue.leads = [lead()];

    const res = await chamar();

    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockStoreMessage).not.toHaveBeenCalled();
    expect(res.body.whatsapp.resultados[0].dry).toBe(true);
    expect(res.body.whatsapp.resultados[0].motivoDry).toBe('PROSPECTING_DRY_RUN');
  });

  test('sem numero de origem provisionado tambem segura', async () => {
    process.env.PROSPECTING_DRY_RUN = 'false';
    delete process.env.PROSPECTING_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    mockWaQueue.leads = [lead()];

    await chamar();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  test('so manda com a string exata false E numero provisionado', async () => {
    process.env.PROSPECTING_DRY_RUN = 'false';
    process.env.PROSPECTING_PHONE_NUMBER_ID = '999';
    mockWaQueue.leads = [lead()];

    await chamar();
    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
  });
});

describe('interruptor separado da fase de WhatsApp', () => {
  // Desligar o cron inteiro derrubaria o e-mail e o follow-up junto, que estao
  // saudaveis. Motivo real: os templates foram criados na WABA errada e o envio
  // falha com (#132001) a cada rodada — barulho constante treina qualquer um a
  // ignorar o log.
  test('desligado: WhatsApp nao envia e diz o motivo', async () => {
    mockSwitches.valores['prospect-founder-whatsapp'] = false;
    mockWaQueue.leads = [lead()];

    const res = await chamar();

    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockSendLivre).not.toHaveBeenCalled();
    expect(res.body.whatsapp.motivo).toBe('whatsapp_desligado_por_ops');
  });

  test('desligar o WhatsApp NAO derruba as outras fases', async () => {
    mockSwitches.valores['prospect-founder-whatsapp'] = false;
    mockWaQueue.leads = [lead()];

    const res = await chamar();

    // O cron continua respondendo 200 e batendo ponto: ocioso != morto.
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockLogCronRun).toHaveBeenCalledWith(
      'prospect-founder-email',
      expect.objectContaining({ whatsapp: 0 })
    );
  });

  test('sem linha no cron_config a fase roda (fail-open, como os outros)', async () => {
    mockSwitches.valores = {};
    mockWaQueue.leads = [lead()];

    await chamar();
    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
  });

  // A prévia é o que se inspeciona ANTES de armar a fase. Se o interruptor a
  // escondesse, o rollout que ele existe para proteger seria impossível de
  // percorrer — e foi exatamente o que aconteceu: rodei o dry-run em produção
  // com a fase desligada e voltou 'whatsapp_desligado_por_ops', repetindo, um
  // nível abaixo, o defeito que eu já tinha corrigido no kill switch do cron.
  test('desligado + ?dry=1: a prévia ATRAVESSA o interruptor', async () => {
    mockSwitches.valores['prospect-founder-whatsapp'] = false;
    mockWaQueue.leads = [lead()];

    const res = await chamar({ dry: true });

    expect(res.body.whatsapp.motivo).not.toBe('whatsapp_desligado_por_ops');
    expect(res.body.whatsapp.resultados).toHaveLength(1);
    expect(res.body.whatsapp.resultados[0].dry).toBe(true);
  });

  test('prévia com a fase desligada NÃO envia e NÃO grava', async () => {
    mockSwitches.valores['prospect-founder-whatsapp'] = false;
    mockWaQueue.leads = [lead()];

    await chamar({ dry: true });

    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockSendLivre).not.toHaveBeenCalled();
    expect(mockRecordEvent).not.toHaveBeenCalled();
    expect(mockStoreMessage).not.toHaveBeenCalled();
  });

  test('a prévia diz que o interruptor está desligado', async () => {
    // Sem isto o operador lê a prévia e acha que a fase já está no ar.
    mockSwitches.valores['prospect-founder-whatsapp'] = false;
    mockWaQueue.leads = [lead()];
    const desligada = await chamar({ dry: true });
    expect(desligada.body.whatsapp.interruptorDesligado).toBe(true);

    mockSwitches.valores['prospect-founder-whatsapp'] = true;
    const ligada = await chamar({ dry: true });
    expect(ligada.body.whatsapp.interruptorDesligado).toBe(false);
  });

  // ------------------------------------------------- de QUAL número isto sai
  /**
   * ACHADO ARMANDO A FASE EM PRODUÇÃO (11/08/2026). Com os templates já
   * APROVADOS, o primeiro envio real ainda falhou com (#132001). Não era a
   * WABA: era o NÚMERO. Nenhuma das duas chamadas passava `phoneNumberId`, e o
   * resolvePhoneNumberId do sender cai em WHATSAPP_PHONE_NUMBER_ID — o número
   * de RESERVAS, que os restaurantes clientes usam, e que vive noutra WABA.
   *
   * O erro da Meta foi sorte. Se o template existisse nos dois lugares, a
   * prospecção fria teria saído do número de que restaurante PAGANTE depende,
   * queimando a reputação que a separação de números existe para proteger.
   */
  test('o toque sai do número de PROSPECÇÃO, nunca do de reservas', async () => {
    process.env.PROSPECTING_PHONE_NUMBER_ID = '999';
    mockWaQueue.leads = [lead()];

    await chamar();

    expect(mockSendTemplate).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), expect.any(String), expect.any(Array),
      expect.objectContaining({ phoneNumberId: '999' })
    );
  });

  test('texto livre dentro da janela também sai do número de prospecção', async () => {
    process.env.PROSPECTING_PHONE_NUMBER_ID = '999';
    mockWaQueue.leads = [lead()];
    mockWaQueue.historico = [
      { direcao: 'in', corpo: 'opa', enviada_em: new Date(Date.now() - 3600e3).toISOString() },
    ];

    await chamar();

    expect(mockSendLivre).toHaveBeenCalledWith(
      expect.any(String), expect.any(String),
      expect.objectContaining({ phoneNumberId: '999' })
    );
  });

  test('sem número de prospecção NÃO cai no de reservas: não envia', async () => {
    // Falhar fechado. O default do sender é o número dos clientes, então
    // "não configurado" jamais pode virar "manda pelo número deles".
    delete process.env.PROSPECTING_PHONE_NUMBER_ID;
    mockWaQueue.leads = [lead()];

    await chamar();

    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockSendLivre).not.toHaveBeenCalled();
  });

  test('o kill switch do cron inteiro continua valendo', async () => {
    mockSwitches.valores['prospect-founder-email'] = false;
    mockWaQueue.leads = [lead()];

    const res = await chamar();
    expect(res.body.skipped).toBe('disabled_by_ops');
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });
});
