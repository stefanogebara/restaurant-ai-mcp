'use strict';

/**
 * O cartão de contato que veio de um ROBÔ.
 *
 * Diagnóstico de 27/09/2026: o assistente automático de uma casa mandou o
 * cartão do contato comercial, e a Olímpia perguntou TRÊS vezes "esse número é
 * mesmo da Fulana?". A pergunta de confirmação (regra 9d, incidente de 04/08)
 * existe pra um HUMANO responder; um robô devolve o link de reserva de novo, e
 * a conversa gira em falso.
 *
 * Quando a thread nunca teve gente do outro lado, a indicação fica registrada
 * como PENDENTE e vai pro fundador decidir; ninguém pergunta nada a robô.
 * PURO: sem I/O.
 */

const { pareceAutoAtendimento } = require('./prospect-state');

function ehCartao(m) {
  return m.tipo === 'contacts' || /^\s*\[Contato compartilhado:/i.test(String(m.corpo || ''));
}

/**
 * O último inbound é um cartão de contato E nenhum inbound anterior parece
 * gente: só auto-atendimento, cartões ou mídia sem texto.
 */
function cartaoDeRobo(history) {
  const ins = (history || []).filter((m) => m && m.direcao === 'in');
  const ultimo = ins[ins.length - 1];
  if (!ultimo || !ehCartao(ultimo)) return false;
  const antes = ins.slice(0, -1);
  if (antes.length === 0) return false; // só o cartão: não dá pra saber quem mandou
  return antes.every((m) => {
    const t = String(m.corpo || '').trim();
    return !t || ehCartao(m) || pareceAutoAtendimento(t);
  });
}

module.exports = { cartaoDeRobo };
