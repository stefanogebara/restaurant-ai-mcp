'use strict';

/**
 * Isolamento entre restaurantes nas ferramentas de reserva do agente.
 *
 * Regressão de um vazamento real encontrado em 27/jul/2026: lookup, cancel e
 * modify consultavam `reservations` via `supabaseAdmin` — que ignora RLS —
 * filtrando SÓ por reservation_id ou telefone, sem restaurant_id. Efeitos:
 *
 *  - buscar por telefone devolvia nome, data, hora e tamanho do grupo das
 *    reservas daquele cliente em TODOS os restaurantes da plataforma, e a IA
 *    repassava na conversa;
 *  - o reservation_id não é secreto (vai por WhatsApp e e-mail ao cliente),
 *    então quem tivesse um ID de qualquer restaurante cancelava/alterava a
 *    reserva conversando com QUALQUER outro — inclusive por injeção de prompt.
 *
 * `create_reservation`, ao lado, sempre escopou certo. Estes testes prendem o
 * contrato nas três que ficaram para trás.
 */

const REST_A = 'rest-aaa';
const REST_B = 'rest-bbb';

/**
 * Construtor de query falso que REGISTRA os filtros aplicados. É isso que
 * permite afirmar "restaurant_id foi filtrado" sem subir um Postgres.
 */
function criarClienteFalso(linhas) {
  const chamadas = { select: [], update: [], filtros: [] };

  const criarQuery = (tabela, tipo) => {
    const filtros = [];
    const q = {
      eq(coluna, valor) { filtros.push([coluna, valor]); return q; },
      in(coluna, valores) { filtros.push([coluna, valores]); return q; },
      order() { return q; },
      limit() { return finalizar(); },
      select() { return q; },
      single() { return finalizar(true); },
      then(resolve, reject) { return finalizar().then(resolve, reject); },
    };

    function aplicar() {
      chamadas.filtros.push({ tabela, tipo, filtros });
      return linhas.filter((linha) => filtros.every(([coluna, valor]) => (
        Array.isArray(valor) ? valor.includes(String(linha[coluna])) : String(linha[coluna]) === String(valor)
      )));
    }

    function finalizar(unico = false) {
      const achadas = aplicar();
      if (tipo === 'update') chamadas.update.push(filtros);
      const data = unico ? (achadas[0] || null) : achadas;
      const error = unico && !achadas.length ? { message: 'no rows' } : null;
      return Promise.resolve({ data, error });
    }

    return q;
  };

  return {
    chamadas,
    from(tabela) {
      return {
        select: () => criarQuery(tabela, 'select'),
        update: () => criarQuery(tabela, 'update'),
        insert: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }),
      };
    },
  };
}

/** Uma reserva em cada restaurante, MESMO telefone — o cenário do vazamento. */
const LINHAS = [
  {
    id: 1, reservation_id: 'RES-DO-A', restaurant_id: REST_A, customer_name: 'Cliente no A',
    customer_phone: '5511999998888', date: '2026-08-01', time: '20:00', party_size: 2, status: 'confirmed',
  },
  {
    id: 2, reservation_id: 'RES-DO-B', restaurant_id: REST_B, customer_name: 'Cliente no B',
    customer_phone: '5511999998888', date: '2026-08-02', time: '21:00', party_size: 4, status: 'confirmed',
  },
];

let clienteFalso;

// O módulo sob teste faz `const { supabaseAdmin } = require(...)` no topo, ou
// seja, captura o VALOR uma única vez no carregamento. Um getter no mock não
// adianta: quando ele roda, o duble do teste ainda não existe. Por isso o mock
// devolve um objeto ESTÁVEL que só delega `from` para o duble corrente.
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: (tabela) => global.__clienteFalso.from(tabela) },
  canAccommodateParty: jest.fn().mockResolvedValue({ canAccommodate: true }),
}));

const { executeTool } = require('../_services/whatsapp/reservation-tools');

/** Sessão do cliente falando COM o restaurante A, do número compartilhado. */
const sessaoNoA = {
  restaurant: { id: REST_A, name: 'Restaurante A' },
  sender_phone: '5511999998888',
};

beforeEach(() => {
  clienteFalso = criarClienteFalso(LINHAS);
  global.__clienteFalso = clienteFalso;
});

/** Todo filtro aplicado em qualquer query desta chamada. */
const filtrouRestaurante = () => clienteFalso.chamadas.filtros
  .some((c) => c.filtros.some(([coluna]) => coluna === 'restaurant_id'));

describe('lookup_reservation — não pode enxergar outro restaurante', () => {
  test('busca por telefone devolve SÓ a reserva do restaurante da conversa', async () => {
    const r = await executeTool('lookup_reservation', { customer_phone: '5511999998888' }, sessaoNoA);
    expect(r.success).toBe(true);
    expect(filtrouRestaurante()).toBe(true);
    const ids = (r.reservations || []).map((x) => x.reservation_id);
    expect(ids).toContain('RES-DO-A');
    expect(ids).not.toContain('RES-DO-B'); // o vazamento
  });

  test('ID de outro restaurante não é encontrado', async () => {
    const r = await executeTool('lookup_reservation', { reservation_id: 'RES-DO-B' }, sessaoNoA);
    expect(r.success).toBe(false);
  });

  test('telefone inventado pelo modelo é ignorado — vale o de quem está falando', async () => {
    // Sem isto, bastava a IA ser convencida a chamar a ferramenta com o número
    // de outra pessoa pra devolver nome, data e horário de um terceiro.
    await executeTool('lookup_reservation', { customer_phone: '5511777776666' }, sessaoNoA);
    const filtroTelefone = clienteFalso.chamadas.filtros
      .flatMap((c) => c.filtros)
      .find(([coluna]) => coluna === 'customer_phone');
    expect(JSON.stringify(filtroTelefone)).toContain('5511999998888');
    expect(JSON.stringify(filtroTelefone)).not.toContain('5511777776666');
  });
});

describe('cancel_reservation — ID conhecido não cancela em outra casa', () => {
  test('cancelar reserva do próprio restaurante funciona', async () => {
    const r = await executeTool('cancel_reservation', { reservation_id: 'RES-DO-A' }, sessaoNoA);
    expect(r.success).toBe(true);
    expect(filtrouRestaurante()).toBe(true);
  });

  test('cancelar reserva de OUTRO restaurante é recusado', async () => {
    const r = await executeTool('cancel_reservation', { reservation_id: 'RES-DO-B' }, sessaoNoA);
    expect(r.success).toBe(false);
    expect(clienteFalso.chamadas.update).toHaveLength(0); // nenhum UPDATE disparado
  });

  test('o UPDATE em si também é escopado — não só a verificação anterior', async () => {
    await executeTool('cancel_reservation', { reservation_id: 'RES-DO-A' }, sessaoNoA);
    const filtrosDoUpdate = clienteFalso.chamadas.update[0] || [];
    expect(filtrosDoUpdate.some(([coluna]) => coluna === 'restaurant_id')).toBe(true);
  });
});

describe('modify_reservation — mesma regra', () => {
  test('alterar reserva de outro restaurante é recusado, sem UPDATE', async () => {
    const r = await executeTool('modify_reservation', { reservation_id: 'RES-DO-B', new_time: '22:00' }, sessaoNoA);
    expect(r.success).toBe(false);
    expect(clienteFalso.chamadas.update).toHaveLength(0);
  });

  test('alterar a própria reserva funciona e o UPDATE é escopado', async () => {
    const r = await executeTool('modify_reservation', { reservation_id: 'RES-DO-A', new_time: '22:00' }, sessaoNoA);
    expect(r.success).toBe(true);
    const filtrosDoUpdate = clienteFalso.chamadas.update[0] || [];
    expect(filtrosDoUpdate.some(([coluna]) => coluna === 'restaurant_id')).toBe(true);
  });
});
