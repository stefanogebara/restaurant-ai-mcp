'use strict';

/**
 * Fome da fila de enriquecimento.
 *
 * ORIGEM (23/08/2026): o cron prospect-enrich moía em falso de hora em hora.
 * TODA rodada em `cron_runs` gravava `processados: 15, pulados: 15,
 * enriquecidos: 0` — e a base inteira tinha UM lead com CNPJ.
 *
 * Duas causas somadas, ambas cobertas aqui:
 *
 * 1. O skip por cooldown devolve ANTES de gravar. Lead que o enrich não
 *    resolve continua com `cnpj` nulo, continua no topo da ordenação, e volta
 *    na hora seguinte — para sempre.
 * 2. A fila fria só era lida quando a quente devolvia menos que o limite. Com
 *    879 quentes contra um lote de 15, isso nunca acontecia: os 3808 frios
 *    eram inalcançáveis POR CONSTRUÇÃO, não por prioridade.
 *
 * É a mesma forma do defeito da pontuação (12-13/08). O fake abaixo APLICA os
 * filtros num conjunto em memória em vez de espiar chamadas, para que remover
 * o filtro faça o teste cair de verdade.
 */

const DIA = 24 * 60 * 60 * 1000;
const AGORA = 1787000000000; // instante fixo — Date.now() é mockado abaixo

// Um lead da fila QUENTE, bloqueado por cooldown (tentado há 2 dias).
const bloqueado = (i) => ({
  id: `quente-bloq-${i}`,
  cnpj: null,
  prospect_state: 'pausada',
  last_in_at: `2026-08-2${i % 10}T12:00:00.000Z`,
  created_at: '2026-07-01T00:00:00.000Z',
  enrich_status: { cnpj: 'missing', attempted_at: new Date(AGORA - 2 * DIA).toISOString() },
});

// Quente trabalhável: cooldown vencido (tentado há 30 dias).
const quenteLivre = {
  id: 'quente-livre',
  cnpj: null,
  prospect_state: 'conversando',
  last_in_at: '2026-08-01T12:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  enrich_status: { cnpj: 'missing', attempted_at: new Date(AGORA - 30 * DIA).toISOString() },
};

// Frio nunca tentado — o que a fila quente entupida escondia.
const frio = {
  id: 'frio-virgem',
  cnpj: null,
  prospect_state: 'aguardando',
  last_in_at: null,
  created_at: '2026-06-01T00:00:00.000Z',
  enrich_status: null,
};

const mockLinhas = [...Array.from({ length: 20 }, (_, i) => bloqueado(i)), quenteLivre, frio];

function mockBuilder(rows) {
  let out = rows.slice();
  const api = {
    select: () => api,
    is: (col, val) => { if (val === null) out = out.filter((r) => r[col] === null); return api; },
    in: (col, vals) => { out = out.filter((r) => vals.includes(r[col])); return api; },
    not: (col, op, val) => {
      if (op === 'in') {
        const lista = String(val).replace(/^\(|\)$/g, '').split(',');
        out = out.filter((r) => !lista.includes(r[col]));
      }
      return api;
    },
    // Espelha o or() do PostgREST para as três cláusulas de filtroTrabalhavel().
    or: (expr) => {
      const clausulas = String(expr).split(',');
      out = out.filter((r) => clausulas.some((c) => {
        const es = r.enrich_status || {};
        if (c.startsWith('enrich_status->>cnpj.not.eq.')) {
          const v = c.split('not.eq.')[1];
          return es.cnpj != null && es.cnpj !== v;
        }
        if (c.startsWith('enrich_status->>attempted_at.is.null')) return es.attempted_at == null;
        if (c.startsWith('enrich_status->>attempted_at.lt.')) {
          const corte = c.split('.lt.')[1];
          return es.attempted_at != null && es.attempted_at < corte;
        }
        return false;
      }));
      return api;
    },
    order: (col, { ascending }) => {
      out.sort((a, b) => {
        const x = a[col] == null ? '' : String(a[col]);
        const y = b[col] == null ? '' : String(b[col]);
        return ascending ? x.localeCompare(y) : y.localeCompare(x);
      });
      return api;
    },
    limit: (n) => { out = out.slice(0, n); return api; },
    then: (resolve) => resolve({ data: out, error: null }),
  };
  return api;
}

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: () => mockBuilder(mockLinhas) },
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('../_lib/secure-compare', () => ({ bearerEquals: () => true }));
jest.mock('../_lib/cron-tracker', () => ({ logCronRun: jest.fn(), logCronError: jest.fn() }));
jest.mock('../_lib/prospecting/prospect-enrich', () => ({
  enrichLead: jest.fn(),
  ENRICH_COOLDOWN_MS: 7 * 24 * 60 * 60 * 1000,
}));

const { proximosLeads } = require('../cron/prospect-enrich');

describe('a fila de enrich não devolve mais lead bloqueado por cooldown', () => {
  beforeAll(() => { jest.spyOn(Date, 'now').mockReturnValue(AGORA); });
  afterAll(() => { Date.now.mockRestore(); });

  test('lead em cooldown fica FORA do lote', async () => {
    const ids = await proximosLeads(15);
    expect(ids.some((id) => String(id).startsWith('quente-bloq-'))).toBe(false);
  });

  test('o quente com cooldown vencido entra', async () => {
    expect(await proximosLeads(15)).toContain('quente-livre');
  });

  test('O CASO QUE MOTIVOU: o frio virgem passa a ser alcançável', async () => {
    // Antes do conserto os 20 bloqueados enchiam o lote de 15 e a fila fria
    // nunca era lida. Este é o teste que reprova quando o filtro sai.
    expect(await proximosLeads(15)).toContain('frio-virgem');
  });

  test('lote menor que a fila continua respeitando o limite', async () => {
    expect((await proximosLeads(1)).length).toBe(1);
  });
});
