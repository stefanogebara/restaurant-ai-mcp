'use strict';

/**
 * Ordem de prioridade dos disparos de intro.
 *
 * POR QUE ISTO IMPORTA: o cap diário de warm-up é pequeno, então cada slot
 * gasto num lead fraco é um slot que o lead forte não recebeu. A ordem antiga
 * era `created_at asc` — os mais ANTIGOS primeiro, o que não tem relação
 * nenhuma com qualidade. Na lista real de produção isso misturava o Santana
 * Burger (712 avaliações) com "Shake Saudável" (2 avaliações, provavelmente
 * nem trabalha com reserva).
 *
 * O DETALHE QUE DECIDE TUDO é `nullsFirst: false`. Em produção os 3643 leads
 * elegíveis têm `lead_score` NULL (nunca passaram pelo enrich, que é quem
 * calcula o score). No Postgres, `ORDER BY x DESC` põe NULLs PRIMEIRO por
 * padrão — sem essa flag, ordenar por score colocaria justamente os NÃO
 * classificados na frente, o oposto da intenção.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

/** Query encadeada que registra cada `.order()` na sequência em que foi pedida. */
function criarQueryEspia(resultado) {
  const ordens = [];
  const selects = [];
  const faixas = [];
  const q = {
    ordens,
    selects,
    faixas,
    select: (cols) => { selects.push(cols); return q; },
    eq: () => q,
    is: () => q,
    not: () => q,
    in: () => q,
    or: () => q,
    gte: (col, val) => { faixas.push({ op: 'gte', col, val }); return q; },
    lte: (col, val) => { faixas.push({ op: 'lte', col, val }); return q; },
    order: (col, opts) => { ordens.push({ col, ...(opts || {}) }); return q; },
    limit: async () => resultado,
  };
  return q;
}

// Prefixo `mock` é obrigatório: o Jest recusa variáveis fora de escopo dentro
// da factory de jest.mock(), exceto as que começam com "mock".
let mockQuery;
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: () => mockQuery },
}));

const { selectIntroCandidates } = require('../_lib/prospecting/prospect-store');

beforeEach(() => {
  mockQuery = criarQueryEspia({ data: [], error: null });
});

describe('selectIntroCandidates — ordem de prioridade', () => {
  test('prioriza lead_score, depois reviews_count, e fecha com created_at', async () => {
    await selectIntroCandidates(10);
    expect(mockQuery.ordens.map((o) => o.col)).toEqual([
      'lead_score', 'reviews_count', 'created_at',
    ]);
  });

  test('lead_score NULL vai para o FIM — sem isto a ordem se inverte na prática', async () => {
    // Os 3643 elegíveis em produção têm score NULL. Com o default do Postgres
    // (NULLs primeiro em DESC), eles ocupariam os 10 primeiros lugares e a
    // mudança não teria efeito nenhum — pior, daria a impressão de ter.
    await selectIntroCandidates(10);
    const score = mockQuery.ordens.find((o) => o.col === 'lead_score');
    expect(score.ascending).toBe(false);
    expect(score.nullsFirst).toBe(false);
  });

  test('reviews_count também é desc com NULLs no fim — é o desempate que funciona hoje', async () => {
    await selectIntroCandidates(10);
    const rev = mockQuery.ordens.find((o) => o.col === 'reviews_count');
    expect(rev.ascending).toBe(false);
    expect(rev.nullsFirst).toBe(false);
  });

  test('created_at fecha ascendente — determinismo entre execuções', async () => {
    // Sem um critério final estável, dois leads empatados alternariam de ordem
    // a cada rodada e o claim atômico disputaria linhas diferentes.
    await selectIntroCandidates(10);
    const criado = mockQuery.ordens.at(-1);
    expect(criado.col).toBe('created_at');
    expect(criado.ascending).toBe(true);
  });

  test('traz lead_score e reviews_count no select — ordenar por coluna não pedida é erro silencioso', async () => {
    await selectIntroCandidates(10);
    expect(mockQuery.selects[0]).toMatch(/lead_score/);
    expect(mockQuery.selects[0]).toMatch(/reviews_count/);
  });

  test('erro na consulta devolve lista vazia em vez de explodir o dispatch', async () => {
    mockQuery = criarQueryEspia({ data: null, error: { message: 'timeout' } });
    expect(await selectIntroCandidates(10)).toEqual([]);
  });
});

/**
 * A faixa de qualidade. Sem TETO de avaliações, ordenar por popularidade traz
 * Mercado Municipal (201 mil) e sete shoppings antes de qualquer restaurante —
 * o Google Places rotula shopping como "restaurante" por causa da praça de
 * alimentação, então o campo `sector` não separa.
 */
describe('faixa de qualidade do lead', () => {
  test('exige um PISO de avaliações — sem volume não há dor de reserva', async () => {
    // 120 desde 23/08/2026 (era 150). O piso não mudou de ideia: o pool acima
    // de 150 foi consumido — a ordenação prioriza justamente esses — e sobraram
    // 3 leads alcançáveis, com o dispatch registrando `candidates: 0` em dia
    // útil. Ver a nota de revisão em prospect-store.js.
    await selectIntroCandidates(10);
    expect(mockQuery.faixas).toContainEqual({ op: 'gte', col: 'reviews_count', val: 120 });
  });

  test('exige um TETO — é o que impede shopping e rede no topo da fila', async () => {
    // Medido: com teto de 15000 a lista enche de mercado, Outback e Coco Bambu
    // (decisão corporativa, ciclo longo, provavelmente já têm sistema).
    await selectIntroCandidates(10);
    expect(mockQuery.faixas).toContainEqual({ op: 'lte', col: 'reviews_count', val: 5000 });
  });

  test('exige nota mínima — abaixo de 4.3 o problema do restaurante não é reserva', async () => {
    await selectIntroCandidates(10);
    expect(mockQuery.faixas).toContainEqual({ op: 'gte', col: 'rating', val: 4.3 });
  });

  test('traz rating no select, já que filtra por ele', async () => {
    await selectIntroCandidates(10);
    expect(mockQuery.selects[0]).toMatch(/rating/);
  });
});
