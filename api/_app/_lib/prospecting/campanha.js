'use strict';

/**
 * CAMPANHA — uma lista de leads escolhida à mão (o piloto do Racha: bares de
 * SP escolhidos por pesquisa, não pela descoberta do Google). Rótulo curto, só
 * [a-z0-9-]: vai direto num filtro do PostgREST. Qualquer outra coisa vira
 * null — e null é "o fluxo normal", nunca "todos".
 *
 * Módulo próprio (e não dentro do prospect-store): os testes do sequencer
 * trocam o store inteiro por um dublê, e a regra do rótulo não pode sumir junto.
 */
function normalizarCampanha(c) {
  const s = typeof c === 'string' ? c.trim().toLowerCase() : '';
  return /^[a-z0-9-]{1,40}$/.test(s) ? s : null;
}

module.exports = { normalizarCampanha };
