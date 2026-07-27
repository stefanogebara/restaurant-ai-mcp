'use strict';

/**
 * A reserva chega até a IA — os dois caminhos que a engoliam.
 *
 * O módulo puro (rating-reply.test.js) prova que "4 pessoas amanhã 20h" não é
 * nota. Estes testes provam a consequência que importa: os DOIS handlers que
 * rodam antes da IA devolvem null e deixam a mensagem passar.
 *
 * Caminho 1 — surveyReplyHandler: olhava `charAt(0)`; achava a pesquisa das
 * últimas 48h e gravava a nota. Cliente recebia "⭐⭐⭐⭐" e perdia a mesa.
 *
 * Caminho 2 — feedbackService: marcava o pedido de feedback como 'answered'
 * mesmo SEM nota nenhuma, e devolvia truthy. O processador então respondia
 * "Obrigado pelo seu feedback!" e encerrava. Pior: a busca não tinha janela de
 * tempo, então um pedido de terça engolia a reserva de sexta.
 */

const REST = 'rest-1';

// ---------- duble do Supabase ----------
// A fábrica do jest.mock não enxerga variável do escopo do arquivo (é içada
// para antes das declarações), por isso tudo passa por `global.__cenario`.
let cenario;

jest.mock('../_lib/supabase', () => {
  const consulta = (tabela) => {
    const filtros = [];
    const q = {
      eq(c, v) { filtros.push([c, v]); return q; },
      gte(c, v) { filtros.push([`${c}>=`, v]); return q; },
      or() { return q; },
      order() { return q; },
      limit() { return q; },
      select() { return q; },
      maybeSingle: async () => ({ data: global.__cenario.linhaDe(tabela, filtros), error: null }),
      single: async () => ({ data: global.__cenario.linhaDe(tabela, filtros), error: null }),
      then(res, rej) { return Promise.resolve({ data: null, error: null }).then(res, rej); },
    };
    return q;
  };
  const tabelaCom = (prefixo) => (t) => ({
    select: () => consulta(prefixo + t),
    update: (u) => { global.__cenario.atualizados.push({ tabela: t, updates: u }); return consulta(prefixo + t); },
    insert: (linha) => { global.__cenario.inseridos.push({ tabela: t, linha }); return Promise.resolve({ error: null }); },
  });
  return {
    supabaseAdmin: {
      schema: () => ({ from: tabelaCom('schema:') }),
      from: tabelaCom(''),
    },
  };
});

jest.mock('../_lib/whatsapp-sender', () => ({ sendWhatsAppMessage: jest.fn() }));

const { handleSurveyReply } = require('../_services/surveyReplyHandler');
const { processFeedbackReply, findPendingFeedbackForPhone } = require('../_services/feedbackService');

const TELEFONE = '5511999998888';

/** Cenário padrão: existe pesquisa E pedido de feedback pendentes há 1 dia. */
function cenarioPadrao() {
  const ontem = new Date(Date.now() - 24 * 3600_000).toISOString();
  return {
    inseridos: [],
    atualizados: [],
    linhaDe(tabela) {
      if (tabela === 'service_records') {
        return { id: 'sr1', restaurant_id: REST, customer_name: 'Cliente', reservation_id: null, survey_sent_at: ontem };
      }
      if (tabela === 'guest_feedback') return { id: 'gf1', restaurant_id: REST };
      if (tabela === 'schema:survey_responses') return null; // ainda não respondeu
      return null;
    },
  };
}

beforeEach(() => { cenario = cenarioPadrao(); global.__cenario = cenario; });

describe('pesquisa pós-visita não pode sequestrar reserva', () => {
  test.each([
    '4 pessoas amanhã 20h',
    '2 pessoas',
    '5 lugares',
    '3 adultos',
    '2 para hoje',
    '5 pessoas às 21h',
  ])('"%s" passa direto para a IA', async (texto) => {
    const r = await handleSurveyReply(TELEFONE, texto);
    expect(r).toBeNull();
    expect(cenario.inseridos).toHaveLength(0); // nada gravado como avaliação
  });

  test('a avaliação de verdade continua sendo gravada', async () => {
    const r = await handleSurveyReply(TELEFONE, '5 comida excelente');
    expect(r).toEqual({ rating: 5, comment: 'comida excelente' });
    expect(cenario.inseridos).toHaveLength(1);
    expect(cenario.inseridos[0].linha.rating).toBe(5);
  });

  test('nota sozinha também', async () => {
    expect(await handleSurveyReply(TELEFONE, '4')).toEqual({ rating: 4, comment: null });
  });
});

describe('pedido de feedback pendente não pode sequestrar reserva', () => {
  test('mensagem sem nota devolve null e NÃO marca como respondido', async () => {
    const r = await processFeedbackReply(REST, TELEFONE, 'Oi, quero mesa pra 4 sábado às 20h');
    expect(r).toBeNull();
    expect(cenario.atualizados).toHaveLength(0); // o pedido segue pendente
  });

  test('mensagem que começa com dígito mas é reserva também passa', async () => {
    const r = await processFeedbackReply(REST, TELEFONE, '4 pessoas amanhã 20h');
    expect(r).toBeNull();
    expect(cenario.atualizados).toHaveLength(0);
  });

  test('nota de verdade marca como respondido', async () => {
    await processFeedbackReply(REST, TELEFONE, '5 tudo ótimo');
    expect(cenario.atualizados).toHaveLength(1);
    expect(cenario.atualizados[0].updates.rating).toBe(5);
    expect(cenario.atualizados[0].updates.status).toBe('answered');
  });
});

describe('pedido de feedback antigo não fica pendente para sempre', () => {
  test('a busca filtra por sent_at dentro da janela', async () => {
    const filtrosVistos = [];
    cenario.linhaDe = (tabela, filtros) => {
      if (tabela === 'guest_feedback') { filtrosVistos.push(...filtros); return { id: 'gf1', restaurant_id: REST }; }
      return null;
    };
    await findPendingFeedbackForPhone(TELEFONE);
    // Sem esta janela, um pedido de meses atrás seguia disputando cada
    // mensagem nova daquele número.
    expect(filtrosVistos.some(([c]) => c === 'sent_at>=')).toBe(true);
  });
});
