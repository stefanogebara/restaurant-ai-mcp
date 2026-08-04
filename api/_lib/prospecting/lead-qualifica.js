'use strict';

/**
 * Dois vazamentos do teto diário, medidos em 04/ago/2026 na leva das 10:57.
 *
 * O teto de warm-up é a coisa mais escassa da prospecção: 40 envios por dia.
 * Cada slot gasto num alvo errado é um restaurante bom que não foi abordado —
 * e o custo não é só o slot, é um ponto de reputação do número na Meta quando
 * quem recebe não faz ideia do que é reserva de mesa.
 *
 * VAZAMENTO 1 — fora do ICP. A fila ordena por porte (reviews_count), e
 * supermercado, centro cultural e farmácia têm MILHARES de avaliações. Eles
 * não competem com o restaurante médio: ganham dele e vão para o topo. Na
 * base inteira são 1% (36 de 3597); nos próximos 40 envios eram 7,5%. O erro
 * se concentra exatamente onde o teto alcança.
 *
 * VAZAMENTO 2 — telefone repetido. 37 grupos de leads distintos dividindo o
 * mesmo número (rede com várias unidades no Google, cada uma virando um lead).
 * Mandar duas vezes para o mesmo WhatsApp não é só slot perdido: para quem
 * recebe é a mesma mensagem duas vezes, que é a definição operacional de spam.
 *
 * Por que por NOME e não por categoria: `prospect_leads` não guarda o campo
 * `types` do Google — só `google_place_id`. Buscar Place Details de 3597 leads
 * para classificar é caro e lento; o nome resolve o caso que dói (rede grande
 * de varejo sempre se identifica no nome) e erra para o lado seguro, porque
 * um falso positivo só adia um lead, nunca manda para quem não devia.
 */

/**
 * INEQUÍVOCOS: quando a palavra aparece, em qualquer posição, não é
 * restaurante. 'supermercado' e 'drogaria' não entram em nome de restaurante.
 * NÃO inclui 'bar', 'padaria', 'café' — esses recebem reserva e são ICP.
 */
const FORA_SEMPRE = new RegExp([
  'supermercado', 'hipermercado', 'atacad[ãa]?o?', 'sacol[ãa]o', 'hortifruti',
  'farm[áa]cia', 'drogaria', 'centro cultural', 'pet shop', 'lavanderia',
  'papelaria', 'hospital', 'cl[íi]nica',
].join('|'), 'i');

/**
 * AMBÍGUOS: a palavra existe nos dois mundos, então só conta no INÍCIO do
 * nome — é assim que rede de varejo se identifica ("Mercado Municipal",
 * "Posto Ipiranga", "Academia Smart Fit"), enquanto no restaurante ela vem
 * depois ("Restaurante Mercado São Jorge", "Bar da Escola").
 *
 * A primeira versão tratava estes como inequívocos e barrava os dois
 * restaurantes acima. Falso positivo aqui é o erro caro: fora-do-ICP só gasta
 * um slot, mas barrar restaurante bom o remove da fila em silêncio.
 */
const FORA_NO_INICIO = new RegExp(
  '^\\s*(mercado|escola|igreja|banco|posto|academia|[óo]tica)\\b',
  'i',
);

/** PURA. true quando o nome indica um negócio que não recebe reserva. */
function foraDoIcp(nome) {
  const n = String(nome || '');
  return FORA_SEMPRE.test(n) || FORA_NO_INICIO.test(n);
}

/**
 * PURA. Filtra fora-do-ICP e colapsa duplicatas, preservando a ordem de
 * entrada — quem chega primeiro na lista já vem ordenado por prioridade, então
 * manter a ordem é manter a decisão de priorização do seletor.
 *
 * Deduplica por telefone E por google_place_id: são causas diferentes. Mesmo
 * telefone = rede com várias unidades. Mesmo place_id = o MESMO lugar gravado
 * duas vezes (reimportação), que o telefone às vezes não pega porque uma das
 * cópias tem o número em formato diferente.
 *
 * @param {Array<{name?:string, whatsapp_phone?:string, google_place_id?:string}>} leads
 * @returns {{ candidatos: Array, descartados: { fora_icp: number, dup_telefone: number, dup_place: number } }}
 */
function qualificar(leads) {
  const vistosTelefone = new Set();
  const vistosPlace = new Set();
  const candidatos = [];
  const descartados = { fora_icp: 0, dup_telefone: 0, dup_place: 0 };

  for (const lead of leads || []) {
    if (!lead) continue;
    if (foraDoIcp(lead.name)) { descartados.fora_icp++; continue; }

    // Normaliza para comparar: só os dígitos. '+55 11 9...' e '5511 9...' são
    // o mesmo número e precisam colidir aqui, senão a dedup não pega nada.
    const tel = String(lead.whatsapp_phone || '').replace(/\D/g, '');
    if (tel && vistosTelefone.has(tel)) { descartados.dup_telefone++; continue; }

    const place = lead.google_place_id || null;
    if (place && vistosPlace.has(place)) { descartados.dup_place++; continue; }

    if (tel) vistosTelefone.add(tel);
    if (place) vistosPlace.add(place);
    candidatos.push(lead);
  }

  return { candidatos, descartados };
}

module.exports = { qualificar, foraDoIcp, FORA_SEMPRE, FORA_NO_INICIO };
