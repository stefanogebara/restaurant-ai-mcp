'use strict';

/**
 * Repescagem de jobs raros no vigia de cron.
 *
 * PROBLEMA (medido em produção 01/08/2026): checkCronHealth varre cron_runs
 * ordenado por ran_at desc com teto de 1000 linhas — que é o teto do SERVIDOR,
 * pedir mais não adianta. A ~375 execuções/dia isso cobre ~64h, não os 14 dias
 * que a query pede. Job de baixa frequência cai fora, some do lastRunMap e sai
 * como `never_run` — status que health-alert.js NÃO alerta. Resultado: job
 * semanal morto era indistinguível de job semanal vivo, os dois silenciosos.
 *
 * Isso mordeu o registro de prospect-nudge: tolerância de 70h contra janela de
 * 64,8h significava que ele jamais poderia ser reportado stale.
 *
 * A repescagem pergunta individualmente por quem não apareceu na varredura
 * larga — poucos jobs, consultas minúsculas.
 */

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => mockLogger }));

// Prefixo `mock` é obrigatório: o babel-plugin-jest-hoist iça o jest.mock pro
// topo do arquivo e proíbe a factory de tocar em qualquer outro nome de fora.
const mockEstado = { consultas: 0, alvos: [], varredura: { data: [], error: null }, porJob: {} };

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      mockEstado.consultas += 1;
      // Quem chamou .eq('job_name', X) é consulta dirigida; quem não chamou é a
      // varredura larga. Distinguir pelo formato da consulta, não pela ordem em
      // que veio — ordem é premissa frágil e esconde regressão.
      const ctx = { job: null };
      const chain = {
        select: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: () => chain,
        eq: (_coluna, valor) => {
          ctx.job = valor;
          mockEstado.alvos.push(valor);
          return chain;
        },
        then: (resolve, reject) => {
          const r = ctx.job === null
            ? mockEstado.varredura
            : { data: mockEstado.porJob[ctx.job] || [], error: null };
          return Promise.resolve(r).then(resolve, reject);
        },
      };
      return chain;
    },
  },
}));

const { checkCronHealth, CRON_JOBS } = require('../cron/health');

const TETO = 1000;
const agora = () => new Date().toISOString();
const PRESENTE = 'check-late-reservations';
const RARO = 'proactive-comms'; // semanal: nunca cabe na varredura larga

/** Varredura larga que BATEU o teto contendo só o job informado. */
function varreduraCheia(job) {
  mockEstado.varredura = {
    data: Array.from({ length: TETO }, () => ({ job_name: job, ran_at: agora(), meta: {} })),
    error: null,
  };
}

beforeEach(() => {
  mockEstado.consultas = 0;
  mockEstado.alvos = [];
  mockEstado.porJob = {};
  mockEstado.varredura = { data: [], error: null };
});

describe('repescagem quando a varredura larga enche o teto', () => {
  test('todo job ausente da varredura é perguntado individualmente', async () => {
    varreduraCheia(PRESENTE);
    const r = await checkCronHealth();

    const esperados = CRON_JOBS.map((j) => j.name).filter((n) => n !== PRESENTE);
    expect(mockEstado.alvos.sort()).toEqual(esperados.sort());
    expect(r).not.toBeNull();
  });

  test('job raro VIVO deixa de ser never_run e vira healthy', async () => {
    varreduraCheia(PRESENTE);
    mockEstado.porJob[RARO] = [{ ran_at: new Date(Date.now() - 24 * 3600e3).toISOString(), meta: {} }];

    const alvo = (await checkCronHealth()).jobs.find((j) => j.name === RARO);
    expect(alvo.status).toBe('healthy');
    expect(alvo.last_ran_at).not.toBeNull();
  });

  test('job raro MORTO agora aparece como stale, não como never_run silencioso', async () => {
    varreduraCheia(PRESENTE);
    // proactive-comms é semanal (10080min → tolera 14 dias). 20 dias parado.
    mockEstado.porJob[RARO] = [{ ran_at: new Date(Date.now() - 20 * 24 * 3600e3).toISOString(), meta: {} }];

    expect((await checkCronHealth()).jobs.find((j) => j.name === RARO).status).toBe('stale');
  });

  test('job que realmente nunca rodou continua never_run', async () => {
    varreduraCheia(PRESENTE);
    // Sem entrada em porJob a consulta dirigida volta vazia — é o caso honesto.
    expect((await checkCronHealth()).jobs.find((j) => j.name === RARO).status).toBe('never_run');
  });

  test('job morto há MAIS de 14 dias vira stale, não never_run silencioso', async () => {
    // Este é o buraco que sobrou depois da primeira repescagem: com filtro de
    // data na consulta dirigida, um job morto além dos 14 dias voltava vazio e
    // era indistinguível de um que nunca existiu. generate-reflections (cron
    // DIÁRIO) passou 64 dias morto exatamente assim, sem um alerta.
    varreduraCheia(PRESENTE);
    mockEstado.porJob['generate-reflections'] = [
      { ran_at: new Date(Date.now() - 65 * 24 * 3600e3).toISOString(), meta: {} },
    ];
    const alvo = (await checkCronHealth()).jobs.find((j) => j.name === 'generate-reflections');
    expect(alvo.status).toBe('stale');
    expect(alvo.age).toMatch(/d /); // idade real, não "nunca"
  });

  test('erro antigo não infla errors_14d do job ressuscitado', async () => {
    // A busca de freshness perdeu o corte de data de propósito; o de ERRO não.
    varreduraCheia(PRESENTE);
    mockEstado.porJob[RARO] = [
      { ran_at: new Date(Date.now() - 2 * 24 * 3600e3).toISOString(), meta: { status: 'error' } },
      { ran_at: new Date(Date.now() - 40 * 24 * 3600e3).toISOString(), meta: { status: 'error' } },
    ];
    expect((await checkCronHealth()).jobs.find((j) => j.name === RARO).errors_14d).toBe(1);
  });

  test('erros do job raro entram em errors_14d', async () => {
    varreduraCheia(PRESENTE);
    mockEstado.porJob[RARO] = [
      { ran_at: agora(), meta: { status: 'error' } },
      { ran_at: agora(), meta: {} },
      { ran_at: agora(), meta: { status: 'error' } },
    ];
    expect((await checkCronHealth()).jobs.find((j) => j.name === RARO).errors_14d).toBe(2);
  });
});

describe('sem repescagem desnecessária', () => {
  test('varredura folgada já cobre 14 dias — não dispara consulta extra', async () => {
    // Vir com menos que o teto significa que a varredura alcançou o início do
    // período; quem falta de fato nunca rodou. Perguntar de novo seriam ~28
    // round-trips jogados fora em toda checagem de saúde.
    mockEstado.varredura = { data: [{ job_name: PRESENTE, ran_at: agora(), meta: {} }], error: null };
    await checkCronHealth();
    expect(mockEstado.alvos).toHaveLength(0);
    expect(mockEstado.consultas).toBe(1);
  });
});
