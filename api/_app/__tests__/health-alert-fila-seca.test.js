'use strict';

/**
 * O fio inteiro: fila seca, crons saudáveis → o alerta SAI.
 *
 * Este é o teste que importa. `fila-seca.test.js` prova o julgamento puro, mas
 * o defeito real de 13/09/2026 não era de julgamento: era que ninguém
 * PERGUNTAVA. Com todos os crons verdes o health-alert retornava cedo e a fila
 * com 2 leads nunca chegava a lugar nenhum.
 */

jest.mock('../_lib/cron-health', () => ({ checkCronHealth: jest.fn() }));
jest.mock('../_lib/integration-probes', () => ({
  sondarIntegracoes: jest.fn(async () => ({ sondas: [] })),
  NIVEIS: { FALHA: 'falha', OK: 'ok' },
}));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: {} }));
jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: jest.fn(async () => ({ success: true })),
  isWhatsAppConfigured: jest.fn(() => true),
}));
jest.mock('../_lib/cron-tracker', () => ({ logCronRun: jest.fn(async () => {}) }));
jest.mock('../_lib/cron-config', () => ({ isCronEnabled: jest.fn(async () => true) }));
jest.mock('../_lib/prospecting/prospect-store', () => ({ selectIntroCandidates: jest.fn() }));
jest.mock('../_lib/prospecting/prospect-warmup', () => ({ currentCap: jest.fn(async () => 100) }));

const { checkCronHealth } = require('../_lib/cron-health');
const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
const { selectIntroCandidates } = require('../_lib/prospecting/prospect-store');
const handler = require('../_crons/health-alert');

const SAUDAVEL = {
  overall: 'healthy',
  summary: { healthy: 21, stale: 0, never_run: 0, errors_14d: 0 },
  jobs: [],
};

function req() {
  return { headers: { authorization: 'Bearer segredo' }, query: {} };
}
function res() {
  const r = { statusCode: 0, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

describe('health-alert × fila de prospecção', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'segredo';
    process.env.HEALTH_ALERT_PHONE = '+5511999999999';
    checkCronHealth.mockResolvedValue(SAUDAVEL);
  });

  it('crons verdes + fila com 2 leads → alerta SAI (o caso de 13/09)', async () => {
    selectIntroCandidates.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const r = res();
    await handler(req(), r);

    expect(r.body.alerted).toBe(true);
    expect(r.body.fila_seca).toBe(true);
    expect(r.body.fila_de_intro).toBe(2);
    expect(sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const texto = sendWhatsAppMessage.mock.calls[0][1];
    expect(texto).toContain('Fila de prospecção seca');
    expect(texto).toContain('2 lead(s)');
  });

  it('crons verdes + fila cheia → silêncio, e o número vem no relatório mesmo assim', async () => {
    selectIntroCandidates.mockResolvedValue(Array.from({ length: 40 }, (_, i) => ({ id: i })));
    const r = res();
    await handler(req(), r);

    expect(r.body.alerted).toBe(false);
    expect(r.body.fila_de_intro).toBe(40);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('a contagem explodindo não derruba o alerta de cron — vira alerta própria', async () => {
    selectIntroCandidates.mockRejectedValue(new Error('PostgREST fora do ar'));
    const r = res();
    await handler(req(), r);

    expect(r.body.alerted).toBe(true);
    expect(sendWhatsAppMessage.mock.calls[0][1]).toContain('não deu para contar');
  });

  it('cron degradado alerta como antes, e a fila cheia não apaga esse alerta', async () => {
    checkCronHealth.mockResolvedValue({
      overall: 'degraded',
      summary: { healthy: 18, stale: 3, never_run: 0, errors_14d: 0 },
      jobs: [{ name: 'send-campaigns', status: 'stale', age: '3d', errors_14d: 0 }],
    });
    selectIntroCandidates.mockResolvedValue(Array.from({ length: 200 }, (_, i) => ({ id: i })));
    const r = res();
    await handler(req(), r);

    expect(r.body.alerted).toBe(true);
    expect(r.body.fila_seca).toBe(false);
    const texto = sendWhatsAppMessage.mock.calls[0][1];
    expect(texto).toContain('Stale jobs');
    expect(texto).not.toContain('Fila de prospecção seca');
  });

  it('pergunta pela fila usando o MESMO seletor do dispatch, com o piso do alerta', async () => {
    selectIntroCandidates.mockResolvedValue([]);
    await handler(req(), res());
    expect(selectIntroCandidates).toHaveBeenCalledWith(40);
  });
});
