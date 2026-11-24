'use strict';

/**
 * Nome falável da casa.
 *
 * ACHADO (11/08/2026, dry-run da Fase 2): `prospect_leads.name` guarda a string
 * inteira da ficha do Google Places, tipo
 * "Massa na Caveira - Tucuruvi (ZN) - Pizza Bar". O template do fundador diz
 * "...apresentou pra vocês do {{2}}", e com o nome cru a mensagem chega assim:
 *
 *   "...pra vocês do Massa na Caveira - Tucuruvi (ZN) - Pizza Bar."
 *
 * Que é um robô lendo uma linha de banco em voz alta. Um humano diria
 * "Massa na Caveira". Em prospecção fria, soar automatizado é o que mata.
 *
 * A REGRA É CONSERVADORA DE PROPÓSITO: corta no primeiro " - ", que é onde o
 * Google encaixa bairro, zona e categoria. Não tenta ser esperta com vírgulas,
 * parênteses ou maiúsculas — nome de restaurante é caótico ("Bar do Zé (o
 * original)", "Casa 1911"), e adivinhar demais estraga nome legítimo. O pior
 * caso aqui é encurtar de menos, nunca inventar.
 *
 * NÃO é sanitização de segurança: quem escapa HTML é quem renderiza.
 *
 * PURO.
 */

/**
 * @param {string} nome Nome cru do lead.
 * @returns {string} Nome falável, ou string vazia se não houver nada usável.
 */
function nomeDaCasa(nome) {
  const cru = String(nome == null ? '' : nome).trim();
  if (!cru) return '';

  // Corta no primeiro hífen cercado de espaços. Hífen colado ("Pré-Sal",
  // "Casa-Grande") faz parte do nome e não é separador.
  const corte = cru.split(/\s+-\s+/)[0].trim();

  // Se o corte destruiu o nome (ficou curto demais para ser um nome), o
  // original era melhor: prefere-se um nome longo a um nome irreconhecível.
  if (corte.length < 3) return cru;

  return corte;
}

module.exports = { nomeDaCasa };
