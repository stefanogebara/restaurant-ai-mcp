/**
 * O INTERRUPTOR DE OPS — 26/08/2026, escrito durante um incidente.
 *
 * A caça ao celular entrou neste cron e, na primeira noite, voltou
 * `sem_html: 8` de 8 em SEIS rodadas seguidas — o scrape não abriu uma página
 * sequer. O estrago não é só raspagem paga desperdiçada: cada rodada CARIMBA
 * os 8 leads como tentados e os joga em 7 dias de cooldown. Em seis horas, 48
 * restaurantes bons marcados como "já tentei" sem ninguém ter tentado.
 *
 * Aí veio a descoberta ruim: `prospect-enrich` era um dos POUCOS crons sem
 * interruptor. Não havia como parar sem um deploy — e deploy leva ~20 min,
 * durante os quais ele roda de novo. Foi preciso escrever o interruptor no
 * meio do incidente para conseguir desligá-lo.
 *
 * A regra que fica: todo cron que gasta dinheiro ou marca estado precisa poder
 * ser desligado por linha de banco, sem deploy.
 */

var mockIsCronEnabled = jest.fn();
var mockProximosLeads = jest.fn();

jest.mock('../_lib/cron-config', () => ({ isCronEnabled: mockIsCronEnabled }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
  logCronError: jest.fn().mockResolvedValue(undefined),
}));
// Fila vazia: este arquivo testa o PORTÃO, não a seleção (essa tem suíte
// própria em prospecting-enrich-fome.test.js). Sem um encadeamento válido aqui,
// proximosLeads estoura e cai no catch ANTES da caça — e o teste do caminho
// ligado mediria a exceção em vez do portão.
var mockChainVazio = {
  select: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue({ data: [], error: null }),
};
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: jest.fn(() => mockChainVazio) },
}));
jest.mock('../_lib/prospecting/prospect-enrich', () => ({
  enrichLead: jest.fn().mockResolvedValue({ enrich_status: { cnpj: 'missing' } }),
  ENRICH_COOLDOWN_MS: 7 * 24 * 60 * 60 * 1000,
}));
var mockCacar = jest.fn().mockResolvedValue({ processados: 0, achados: 0 });
jest.mock('../_lib/prospecting/prospect-celular', () => ({
  cacarCelularPendentes: mockCacar,
}));

const handler = require('../cron/prospect-enrich');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}
const req = (query = {}) => ({ headers: { authorization: 'Bearer segredo' }, query });

beforeAll(() => { process.env.CRON_SECRET = 'segredo'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => {
  jest.clearAllMocks();
  mockCacar.mockResolvedValue({ processados: 0, achados: 0 });
});

describe('cron/prospect-enrich — interruptor de ops', () => {
  it('desligado no banco: NÃO gasta uma raspagem sequer', async () => {
    mockIsCronEnabled.mockResolvedValue(false);
    const res = mockRes();

    await handler(req(), res);

    // O que importa não é o 200 — é que a caça nem foi chamada.
    expect(mockCacar).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ skipped: 'disabled_by_ops' }));
  });

  it('ligado: roda normalmente', async () => {
    mockIsCronEnabled.mockResolvedValue(true);
    const res = mockRes();

    await handler(req(), res);

    expect(mockCacar).toHaveBeenCalled();
  });

  /**
   * Lição de 09/08: o modo de inspeção não pode ser bloqueado pelo interruptor
   * que ele existe para validar. Sem isto, um cron desligado vira uma caixa
   * preta — não dá para conferir o que ele FARIA sem religá-lo em produção.
   */
  it('dry-run atravessa o interruptor', async () => {
    mockIsCronEnabled.mockResolvedValue(false);
    const res = mockRes();

    await handler(req({ dry: '1' }), res);

    expect(res.json).not.toHaveBeenCalledWith(
      expect.objectContaining({ skipped: 'disabled_by_ops' }));
  });

  it('sem CRON_SECRET correto, 401 antes de qualquer coisa', async () => {
    mockIsCronEnabled.mockResolvedValue(true);
    const res = mockRes();

    await handler({ headers: { authorization: 'Bearer errado' }, query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockCacar).not.toHaveBeenCalled();
  });
});
