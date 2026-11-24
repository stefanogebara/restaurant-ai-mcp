'use strict';

/**
 * Cron que roda e não tem o que fazer PRECISA bater ponto.
 *
 * ACHADO (investigação 01/08/2026): três crons apareciam mortos no vigia e
 * nenhum deles estava. Todos saíam cedo no caminho "nada a fazer" sem chamar
 * logCronRun, então sumiam de cron_runs justamente nos períodos saudáveis:
 *
 *   generate-reflections   0 candidatos → return 200 sem log. Última observação
 *                          de hóspede tem 94 dias, então ele estava ocioso
 *                          havia 64 dias parecendo defunto.
 *   cleanup-expired-demos  0 demos expirados → return 200 sem log. Só aparecia
 *                          vivo no dia em que deletava algo.
 *   refresh-restaurant-...  erro de consulta → return success:true sem log.
 *
 * "Ocioso" e "morto" viravam o mesmo estado observável, e o vigia não alerta
 * never_run. Provado invocando os dois não-destrutivos em produção: HTTP 200,
 * corpo de sucesso, zero linhas gravadas.
 */

const mockLogCronRun = jest.fn().mockResolvedValue(undefined);
const mockLogCronError = jest.fn().mockResolvedValue(undefined);
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: (...a) => mockLogCronRun(...a),
  logCronError: (...a) => mockLogCronError(...a),
}));

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));
jest.mock('../_lib/cron-config', () => ({ isCronEnabled: async () => true }));
jest.mock('../_lib/sentry', () => ({ initSentry: () => {}, captureMessage: () => {} }));
jest.mock('../_lib/secure-compare', () => ({ bearerEquals: () => true }));

// Resultado que a consulta do handler devolve — cada teste ajusta.
const mockConsulta = { resultado: { data: [], error: null } };

jest.mock('../_lib/supabase', () => {
  const encadeia = () => {
    const chain = {
      then: (resolve, reject) => Promise.resolve(mockConsulta.resultado).then(resolve, reject),
    };
    for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'limit', 'not', 'is', 'schema', 'from', 'update', 'delete']) {
      chain[m] = () => chain;
    }
    return chain;
  };
  return { supabaseAdmin: encadeia() };
});

function resposta() {
  const r = { code: null, corpo: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.corpo = b; return r; };
  return r;
}
const req = { headers: { authorization: 'Bearer x' }, method: 'GET', query: {} };

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  mockConsulta.resultado = { data: [], error: null };
});

describe('caminho ocioso bate ponto', () => {
  test('generate-reflections: 0 candidatos ainda registra execução', async () => {
    process.env.CRON_SECRET = 'x';
    const handler = require('../_crons/generate-reflections');
    const res = resposta();
    await handler(req, res);

    expect(res.code).toBe(200);
    expect(res.corpo).toMatchObject({ success: true, reflections: 0 });
    expect(mockLogCronRun).toHaveBeenCalledWith('generate-reflections', expect.objectContaining({ ocioso: true }));
  });

  test('cleanup-expired-demos: 0 demos expirados ainda registra execução', async () => {
    process.env.CRON_SECRET = 'x';
    const handler = require('../_crons/cleanup-expired-demos');
    const res = resposta();
    await handler(req, res);

    expect(res.code).toBe(200);
    expect(mockLogCronRun).toHaveBeenCalledWith('cleanup-expired-demos', expect.objectContaining({ deleted: 0 }));
  });

  test('refresh-restaurant-profiles: nenhum registro stale ainda bate ponto', async () => {
    process.env.CRON_SECRET = 'x';
    const handler = require('../_crons/refresh-restaurant-profiles');
    const res = resposta();
    await handler(req, res);

    expect(res.code).toBe(200);
    expect(mockLogCronRun).toHaveBeenCalledWith('refresh-restaurant-profiles', expect.objectContaining({ ocioso: true }));
  });
});

describe('refresh-restaurant-profiles separa migration pendente de erro real', () => {
  test('tabela inexistente (42P01) = migration pendente, registra execução normal', async () => {
    process.env.CRON_SECRET = 'x';
    mockConsulta.resultado = { data: null, error: { code: '42P01', message: 'relation does not exist' } };
    const handler = require('../_crons/refresh-restaurant-profiles');
    const res = resposta();
    await handler(req, res);

    expect(mockLogCronRun).toHaveBeenCalledWith('refresh-restaurant-profiles', expect.objectContaining({ migracao_pendente: true }));
    expect(mockLogCronError).not.toHaveBeenCalled();
  });

  test('coluna inexistente (42703) é ERRO, não sucesso silencioso', async () => {
    // Este é o caso REAL de produção: a tabela existe, o join é que quebra
    // porque restaurant_config.profile_generated_at não existe. O código
    // antigo devolvia success:true e o cron passou a vida sem nunca funcionar.
    process.env.CRON_SECRET = 'x';
    mockConsulta.resultado = {
      data: null,
      error: { code: '42703', message: 'column restaurant_config_1.profile_generated_at does not exist' },
    };
    const handler = require('../_crons/refresh-restaurant-profiles');
    const res = resposta();
    await handler(req, res);

    expect(mockLogCronError).toHaveBeenCalledWith('refresh-restaurant-profiles', expect.stringContaining('42703'));
    expect(res.corpo.success).toBe(false);
    // 200 de propósito: erro visível no vigia, sem rajada de retry da Vercel.
    expect(res.code).toBe(200);
  });
});
