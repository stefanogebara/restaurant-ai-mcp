/**
 * O SILÊNCIO QUE CUSTOU CINCO DIAS — 31/08/2026.
 *
 * `lerPaginaScrapingdog` devolvia '' para "sem chave" e para qualquer não-2xx,
 * sem log. Do lado de fora as duas causas viravam o mesmo `sem_html`. A caça ao
 * celular rodou de 26/08 a 31/08, carimbou 752 leads, achou zero — e não havia
 * uma linha em lugar nenhum dizendo por quê.
 *
 * O agravante foi de diagnóstico, não de código: havia um `HTTP 429` no mesmo
 * log e eu conclui que era o Scrapingdog. Aquele 429 vinha da busca de CNPJ,
 * que lê o site do restaurante DIRETO, sem passar por esta função. Li o log de
 * uma camada e concluí sobre outra.
 *
 * Estes testes travam a observabilidade: o motivo tem que sair no log, sempre,
 * e tem que ser distinguível.
 */

const mockLogger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };

jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: { from: jest.fn() } }));
jest.mock('../_lib/prospecting/prospect-enrich', () => ({
  enrichLead: jest.fn(), ENRICH_COOLDOWN_MS: 0,
}));
jest.mock('../_lib/prospecting/prospect-celular', () => ({ cacarCelularPendentes: jest.fn() }));
jest.mock('../_lib/cron-tracker', () => ({ logCronRun: jest.fn(), logCronError: jest.fn() }));
jest.mock('../_lib/cron-config', () => ({ isCronEnabled: jest.fn().mockResolvedValue(true) }));

const { lerPaginaScrapingdog } = require('../cron/prospect-enrich');

const CHAVE = 'sd_chave_de_teste';
let chaveOriginal;

beforeAll(() => { chaveOriginal = process.env.SCRAPINGDOG_API_KEY; });
afterAll(() => {
  if (chaveOriginal === undefined) delete process.env.SCRAPINGDOG_API_KEY;
  else process.env.SCRAPINGDOG_API_KEY = chaveOriginal;
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SCRAPINGDOG_API_KEY = CHAVE;
  global.fetch = jest.fn();
});

describe('lerPaginaScrapingdog: o motivo do vazio nunca é silencioso', () => {
  test('sem chave no ambiente: grita, e não tenta raspar nada', async () => {
    delete process.env.SCRAPINGDOG_API_KEY;

    const html = await lerPaginaScrapingdog('https://exemplo.com.br');

    expect(html).toBe('');
    // O ponto do teste: gastar zero requisição E dizer por quê.
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('SCRAPINGDOG_API_KEY ausente'));
  });

  test.each([
    [401, 'chave inválida'],
    [402, 'sem crédito'],
    [429, 'cota estourada'],
    [500, 'problema do fornecedor'],
  ])('HTTP %i (%s): o status aparece no log', async (status) => {
    global.fetch.mockResolvedValue({ ok: false, status, text: async () => '' });

    const html = await lerPaginaScrapingdog('https://exemplo.com.br');

    expect(html).toBe('');
    // Sem o número, 401 e 429 pedem ações opostas e viram a mesma linha muda.
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining(`Scrapingdog HTTP ${status}`));
  });

  test('sucesso: devolve o HTML e não polui o log de erro', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, text: async () => '<html>oi</html>' });

    const html = await lerPaginaScrapingdog('https://exemplo.com.br');

    expect(html).toBe('<html>oi</html>');
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('a chave não vaza para a mensagem de erro', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401, text: async () => '' });

    await lerPaginaScrapingdog('https://exemplo.com.br');

    const escrito = mockLogger.error.mock.calls.flat().join(' ');
    expect(escrito).not.toContain(CHAVE);
  });
});
