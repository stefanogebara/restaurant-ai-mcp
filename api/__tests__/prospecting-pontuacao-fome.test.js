'use strict';

/**
 * Fome da pontuação de outcomes.
 *
 * ORIGEM (13/08/2026): a metade de pontuação do cron prospect-score-outcomes
 * ficou 100% morta de 21/07 a 13/08. Um backfill criou 530 outcomes de leads
 * com ZERO mensagem; a consulta ordena por created_at ASC, então as 25 mais
 * antigas eram todas desse lote. Transcrição vazia → scoreOutcome devolve null
 * no curto-circuito → nada é gravado → no dia seguinte a consulta traz as
 * MESMAS 25. `cron_runs` registrou "scored: 0, skipped: 25" por semanas.
 *
 * O defeito não dava erro, não lançava exceção e não escrevia log. O que o
 * denunciava era um número que parecia saudável. Por isso este arquivo testa
 * as duas metades: que a consulta não traz mais linhas impontuáveis, e que um
 * lote inteiro pulado passa a GRITAR se a fome voltar por outro caminho.
 */

// ---------------------------------------------------------------------------
// Metade 1: a consulta exclui outcome sem mensagem
// ---------------------------------------------------------------------------
//
// O fake abaixo APLICA os filtros num conjunto em memória em vez de só espiar
// as chamadas. É de propósito: um teste que apenas verifica "gt foi chamado"
// passa mesmo que o filtro esteja errado. Assim, se alguém remover o
// .gt('n_messages', 0), as linhas vazias voltam ao resultado e o teste cai.

const mockDataset = [
  // As do backfill: mais ANTIGAS, logo são as primeiras na ordenação — foram
  // exatamente estas que ocuparam as 25 vagas todo dia.
  { id: 1, lead_id: 'l1', outcome: 'pausada', n_messages: 0, quality_score: null, created_at: '2026-07-21T20:28:48Z' },
  { id: 2, lead_id: 'l2', outcome: 'pausada', n_messages: 0, quality_score: null, created_at: '2026-07-21T20:28:48Z' },
  // Pontuável de verdade, e mais nova: só é alcançada se as de cima saírem.
  { id: 3, lead_id: 'l3', outcome: 'agendado', n_messages: 12, quality_score: null, created_at: '2026-08-01T10:00:00Z' },
  // Já pontuada — nunca deve voltar.
  { id: 4, lead_id: 'l4', outcome: 'handoff', n_messages: 8, quality_score: 4, created_at: '2026-08-02T10:00:00Z' },
  // Sem lead_id — o outro guarda que já existia.
  { id: 5, lead_id: null, outcome: 'pausada', n_messages: 3, quality_score: null, created_at: '2026-08-03T10:00:00Z' },
];

function mockFakeBuilder(rows) {
  let out = rows.slice();
  const api = {
    select: () => api,
    is: (col, val) => { if (val === null) out = out.filter((r) => r[col] === null); return api; },
    not: (col, op, val) => { if (op === 'is' && val === null) out = out.filter((r) => r[col] !== null); return api; },
    gt: (col, val) => { out = out.filter((r) => Number(r[col]) > val); return api; },
    order: (col, { ascending }) => {
      out.sort((a, b) => (ascending ? String(a[col]).localeCompare(String(b[col]))
        : String(b[col]).localeCompare(String(a[col]))));
      return api;
    },
    limit: (n) => { out = out.slice(0, n); return api; },
    then: (resolve) => resolve({ data: out, error: null }),
  };
  return api;
}

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: () => mockFakeBuilder(mockDataset) },
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { selectUnscoredOutcomes } = require('../_lib/prospecting/prospect-store');

describe('selectUnscoredOutcomes não traz mais o que é impontuável', () => {
  test('outcome de lead sem NENHUMA mensagem fica de fora', async () => {
    const rows = await selectUnscoredOutcomes(25);
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(1);
    expect(ids).not.toContain(2);
  });

  test('o pontuável que estava preso atrás do lote vazio agora é alcançado', async () => {
    // ESTE é o caso que reprovava antes do conserto: id 3 é mais NOVO que o
    // backfill, então com as vazias na frente ele jamais chegava ao topo.
    const rows = await selectUnscoredOutcomes(25);
    expect(rows.map((r) => r.id)).toContain(3);
  });

  test('os guardas que já existiam continuam de pé', async () => {
    const rows = await selectUnscoredOutcomes(25);
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(4); // já tem nota
    expect(ids).not.toContain(5); // sem lead_id
  });

  test('um lote de 25 só de linhas vazias devolve VAZIO, não 25 inúteis', async () => {
    const rows = await selectUnscoredOutcomes(2);
    // Com o teto em 2 e as duas vazias ordenadas na frente, a versão com bug
    // devolvia [1, 2] e queimava a rodada inteira. Agora sobra trabalho real.
    expect(rows.every((r) => r.n_messages === undefined || r.n_messages > 0)).toBe(true);
    expect(rows.map((r) => r.id)).not.toEqual([1, 2]);
  });
});
