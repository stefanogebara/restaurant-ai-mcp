'use strict';

/**
 * A RESPOSTA DA CASA à pergunta "esse número é mesmo dele?".
 *
 * Piloto do Racha, 29/09/2026: a Notizia passou o contato do responsável e,
 * perguntada, respondeu duas vezes que sim ("é o responsável", "chamar esse
 * número"). Nada aconteceu. `registrar_responsavel` põe o lead em 'handoff'
 * (estado mudo), e a resposta morria no portão de estado — a confirmação que o
 * sistema esperava nunca chegava ao `confirmar_indicacao`. O Salve Jorge, mesma
 * coisa. E a Olímpia ainda disse "já chamo o Rafael então": promessa de contato
 * que ninguém ia cumprir.
 *
 * Isto lê a resposta de forma DETERMINÍSTICA, só enquanto há indicação pendente.
 * Afirmação clara → confirma; negação clara → descarta; o resto (ambíguo,
 * misturado, outra conversa) → null, e o lead segue com o fundador, como antes.
 * Precisão acima de cobertura: um "sim" que não era sim manda mensagem pra um
 * estranho (o incidente de 04/08 que criou a pergunta).
 *
 * PURO: sem I/O.
 */

// `\b` não enxerga o "é" (o JS só conhece ASCII como letra de palavra): antes
// e depois de palavra acentuada, o limite é espaço, pontuação ou fim.
const FIM = '(?=\\s|[.,!?]|$)';
// ...e "é ele" só conta sem "não" logo antes ("não é ele" é negação, não sim).
const INI = '(?:^|(?<!n[ãa]o)\\s)';

const NAO = [
  new RegExp(`\\bn[ãa]o\\s+(?:[ée]|eh|seria)${FIM}`, 'i'), // "não é", "não é ele"
  /\b(?:errad[oa]|engano|trocad[oa])\b/i,    // "número errado", "foi engano"
  /\bn[ãa]o\s+(?:conhe[çc]o|sei\s+quem)\b/i,
  /^\s*n[ãa]o\s*[.!]*\s*$/i,                 // só "não"
];

const SIM = [
  /^\s*(?:sim|isso|exato|exatamente|correto|certo|confirmo|confirmado|positivo|isso\s+mesmo|[ée]\s+sim)\b/i,
  new RegExp(`${INI}[ée]\\s+(?:ele|ela|o\\s+respons[áa]vel|a\\s+respons[áa]vel|o\\s+dono|a\\s+dona|o\\s+gerente|a\\s+gerente|o\\s+s[óo]cio|a\\s+s[óo]cia|dele|dela)${FIM}`, 'i'),
  /\b(?:pode\s+)?(?:chama[r]?|fala[r]?|liga[r]?|manda[r]?)\s+(?:com\s+|pra\s+|para\s+|no\s+|nesse\s+|neste\s+)?(?:esse|este|ele|ela)\b/i,
  /\bentr[ae]\s+em\s+contato\b/i,
  /\bpode\s+chamar\b/i,
];

/**
 * @param {string} texto a mensagem da casa
 * @returns {'sim'|'nao'|null}
 */
function respostaDaConfirmacao(texto) {
  const t = String(texto || '').trim();
  if (!t) return null;
  // Veio um NÚMERO (ou cartão) junto: é uma indicação nova, não um sim/não —
  // o guarda do número do dono (6b) cuida dela. Decidir aqui perderia o número.
  if ((t.match(/\d/g) || []).length >= 8) return null;
  const nao = NAO.some((re) => re.test(t));
  const sim = SIM.some((re) => re.test(t));
  if (nao && sim) return null; // "não é ele, é ela" e afins: pro modelo/fundador
  if (nao) return 'nao';
  if (sim) return 'sim';
  return null;
}

module.exports = { respostaDaConfirmacao };
