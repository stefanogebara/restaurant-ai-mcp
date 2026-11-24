'use strict';

/**
 * A ÚNICA definição de "isto vai mandar mensagem de verdade?".
 *
 * Por que este arquivo existe: a regra estava escrita duas vezes, com sinais
 * OPOSTOS no caso da variável ausente.
 *
 *   caminho de envio (sequencer.js) → `!== 'false'` → ausente = dry-run LIGADO
 *   sondas do painel (integration-probes) → `=== 'true'` → ausente = "ao vivo"
 *
 * As duas concordavam quando a variável estava definida, e por isso a
 * divergência sobreviveu: só aparecia no estado seguro, que é justamente o
 * estado em que ninguém vai conferir. O painel dizia "disparo ao vivo" com o
 * disparo desarmado, e escalava problema de template de aviso para VERMELHO
 * porque acreditava que a mensagem sairia.
 *
 * É a mesma doença da auditoria do cockpit: um painel afirmando um estado que
 * não está medindo. A cura não é copiar a regra certa — é ter uma só, e
 * importá-la. Duas cópias voltam a divergir; uma não pode.
 *
 * Fail-safe deliberado: qualquer coisa que não seja a string exata 'false' é
 * dry-run. Variável ausente, vazia, 'False', '0', typo — tudo segura o envio.
 * O erro barato é não mandar; o caro é mandar cold outreach sem querer.
 */

/**
 * @param {Record<string,string|undefined>} [env] - defaults to process.env.
 * @returns {boolean} true quando NADA sai de verdade.
 */
function isDryRun(env = process.env) {
  const e = env || {};
  // Sem número de origem provisionado não existe envio possível, qualquer que
  // seja a flag. A pergunta vai pelo dono dela em routing.js — ler
  // process.env aqui atravessaria o mock que os testes de dispatch instalam.
  const { getProspectingPhoneNumberId } = require('./routing');
  if (!getProspectingPhoneNumberId(e)) return true;
  return e.PROSPECTING_DRY_RUN !== 'false';
}

module.exports = { isDryRun };
