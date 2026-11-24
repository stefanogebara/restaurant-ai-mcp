'use strict';

/**
 * O que fazer com um número que a casa indicou.
 *
 * A PREMISSA QUE ESTAVA ERRADA: o fluxo tratava "veio num cartão de contato"
 * como "número verificado do decisor" — o comentário do numero-indicado.js
 * dizia, com todas as letras, que compartilhar contato "é intenção explícita,
 * não inferência". É intenção explícita DE QUEM ENVIOU. Não é garantia de que
 * o dado está certo.
 *
 * Em 04/08/2026 o Capim Santo compartilhou um cartão "Adriana" com o número de
 * um terceiro. Payload íntegro, parser correto, lead criado e intro disparada
 * no mesmo turno. Uma pessoa sem relação com a casa levou pitch frio.
 *
 * POR QUE A DEFESA É PERGUNTAR, NÃO HEURÍSTICA: no caso real o número era DDD
 * 11 numa casa de São Paulo e não pertencia a nenhum outro lead. Cerca de DDD
 * não pegaria. Cerca de colisão não pegaria. A única coisa que pegaria é
 * perguntar à casa "esse número é da Adriana daí mesmo?" — um turno de
 * conversa contra uma mensagem irreversível para um estranho.
 *
 * As cercas continuam existindo aqui, mas como rede secundária: elas RECUSAM
 * casos claramente errados, e o que sobra vai para confirmação. Não existe
 * caminho que mande mensagem para um indicado sem alguém ter confirmado.
 */

const soDigitos = (s) => String(s || '').replace(/\D/g, '').replace(/^55/, '');

/**
 * PURA: decide o destino de um número indicado.
 *
 * @param {object} args
 * @param {string|null} args.numeroIndicado - como veio (cartão ou texto)
 * @param {object|null} args.leadQueIndicou - lead da casa que passou o contato
 * @param {object|null} [args.donoDoNumero] - outro lead que JÁ tem esse número
 * @param {string|null} [args.numeroDoFundador]
 * @returns {{decisao:'confirmar'|'recusar', motivo:string}}
 *   'confirmar' → pergunte à casa antes de qualquer envio ao indicado
 *   'recusar'   → não crie lead nem contate; o motivo vai para a linha do tempo
 */
function avaliarIndicacao({ numeroIndicado, leadQueIndicou, donoDoNumero = null, numeroDoFundador = null }) {
  const n = soDigitos(numeroIndicado);
  if (!n) return { decisao: 'recusar', motivo: 'numero_ausente' };
  if (!leadQueIndicou || !leadQueIndicou.id) return { decisao: 'recusar', motivo: 'sem_lead_de_origem' };

  if (numeroDoFundador && n === soDigitos(numeroDoFundador)) {
    return { decisao: 'recusar', motivo: 'numero_do_fundador' };
  }
  if (n === soDigitos(leadQueIndicou.whatsapp_phone)) {
    return { decisao: 'recusar', motivo: 'proprio_numero' };
  }
  // Colisão com outro cadastro é o sinal de central de rede (o mesmo celular
  // servindo várias unidades) ou de número errado. Nos dois casos, escrever
  // seria falar com quem não é dono da conversa.
  if (donoDoNumero && donoDoNumero.id && donoDoNumero.id !== leadQueIndicou.id) {
    return { decisao: 'recusar', motivo: 'ja_e_de_outro_lead' };
  }

  // O caminho normal. Repare que NÃO existe 'seguir': indicação de terceiro
  // sempre passa por uma confirmação humana da própria casa.
  return { decisao: 'confirmar', motivo: 'indicacao_de_terceiro_precisa_confirmacao' };
}

module.exports = { avaliarIndicacao };
