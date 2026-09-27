'use strict';

/**
 * Quando a PRÉVIA sai por garantia, não por boa vontade do modelo.
 *
 * Diagnóstico de 27/09/2026 (30 dias, 36 respostas): criar_demo foi chamado
 * ZERO vezes. A ferramenta funcionava (12 prévias entre 16/07 e 17/08); o que
 * travava era a regra de conversa "só com o dono confirmado E interesse real".
 * Os dois donos que apareceram perguntaram o que era ("o q é racha?", "vcs
 * possuem totem?") e receberam uma pergunta de volta em vez da prévia. E quem
 * disse "a gente já divide" ganhou uma sondagem e um "tranquilo, obrigada".
 *
 * Instrução no prompt é intenção; isto é garantia. PURO: sem I/O.
 */

// Termina a palavra acentuada sem \b (em JS, \b não conhece "é").
const FIM = '(?=\\s|[?!.,]|$)';

const PERGUNTA_PRODUTO = [
  new RegExp('\\bo\\s*q(?:ue)?\\s+(?:[ée]|seria|s[ãa]o)' + FIM, 'i'), // "o que é", "o q é", "oq é"
  /\bdo\s+que\s+se\s+trata\b/i,
  /\bdo\s+que\s+(?:[ée]|seria)\b/i,
  /\bcomo\s+(?:[ée]\s+que\s+)?funciona\b/i,
  /\bme\s+explica\b/i,
  new RegExp('(?:^|\\s)[ée]\\s+o\\s+qu[eê]' + FIM, 'i'),              // "é o quê?"
  /\bv(?:c|oc[eê])s?\s+(?:tem|t[eê]m|possuem|fazem|trabalham\s+com)\b[^?\n]{0,40}\?/i,
  /\bqual\s+(?:[ée]\s+)?a\s+proposta\b/i,
  /\bquero\s+(?:ver|conhecer|entender)\b/i,
  /\bpode\s+(?:mandar|mostrar)\b/i,
  new RegExp('\\bmanda\\s+(?:a[ií]|o\\s+link|pra\\s+mim)' + FIM, 'i'),
];

/**
 * A pessoa perguntou o que é / como funciona / pediu pra ver. Vale venha de
 * quem vier: um funcionário que encaminha o link pro dono custa zero.
 */
function perguntaSobreProduto(texto) {
  const t = String(texto || '').trim();
  if (!t) return false;
  return PERGUNTA_PRODUTO.some((re) => re.test(t));
}

// "Já resolvido" brando: não é recusa de conversa, é a objeção que a prévia
// existe pra responder. Recusa SECA ("não tenho interesse") não entra aqui.
const JA_RESOLVIDO = [
  /\bj[áa]\s+(?:divid\w*|rach\w*|temos|tenho|uso|usamos|trabalho\s+com|trabalhamos\s+com|fazemos|resolv\w*)\b/i,
  /\bn[ãa]o\s+trabalh\w+\s+com\s+qr\b/i,
  /\b(?:cliente|clientes|pessoal|galera)\s+n[ãa]o\s+(?:usa|usam|gosta\w*|escaneia\w*)\b/i,
  /\bna\s+maquininha\b[^.!?\n]{0,30}\bfunciona\b/i,
];

function objecaoJaResolvido(texto) {
  const t = String(texto || '').trim();
  if (!t) return false;
  return JA_RESOLVIDO.some((re) => re.test(t));
}

const DEMO_INSTRUCTION =
  '[INSTRUÇÃO INTERNA, não é mensagem do cliente: a pessoa perguntou sobre o ' +
  'produto ou pediu pra ver. Responda em UMA frase curta exatamente o que ela ' +
  'perguntou e chame criar_demo NESTE turno (o sistema cola o link). Não faça ' +
  'pergunta. Se ela não for a dona, peça pra encaminhar o link pra quem decide.]';

const DEMO_JA_RESOLVIDO_INSTRUCTION =
  '[INSTRUÇÃO INTERNA, não é mensagem do cliente: a pessoa disse que já resolve ' +
  'isso de outro jeito. Concorde em meia linha, sem "mas", e chame criar_demo ' +
  'NESTE turno oferecendo a prévia UMA vez como curiosidade sem compromisso ' +
  '("se quiser ver como fica pelo QR, é esse aqui"). Não faça pergunta, não ' +
  'argumente. É a única tentativa: se recusar de novo, a conversa encerra.]';

/**
 * O texto que acompanha o link: o modelo às vezes responde e termina com uma
 * pergunta de sondagem ("como vocês fecham a conta hoje?"). Link embaixo de uma
 * pergunta que ninguém vai responder é ruído; a última frase interrogativa sai.
 */
function introDaPrevia(texto) {
  const t = String(texto || '').replace(/https?:\/\/\S+/gi, '').trim();
  const sem = t.replace(/[^.!?\n]*\?\s*$/, '').trim();
  return sem || null;
}

module.exports = {
  perguntaSobreProduto,
  objecaoJaResolvido,
  introDaPrevia,
  DEMO_INSTRUCTION,
  DEMO_JA_RESOLVIDO_INSTRUCTION,
};
