'use strict';

/**
 * A RESPOSTA DA CASA à pergunta "esse número é mesmo dele?".
 *
 * Piloto do Racha, 29/09/2026: a Notizia passou o contato do responsável e,
 * perguntada, respondeu que sim ("é o responsável", "chamar esse número"). Nada
 * aconteceu: `registrar_responsavel` põe o lead em 'handoff' (estado mudo) e a
 * resposta morria no portão de estado.
 *
 * LISTA FECHADA, não detector de negação. A primeira versão procurava o "não"
 * e a revisão de segurança achou dezenas de recusas que ela lia como sim: "n
 * pode chamar", "ñ pode", "num liga", "jamais", "chama ela n", o "não" com
 * acento combinado, "acho que é ele", "pode chamar mas ele saiu". Negação em
 * português de WhatsApp não se enumera. Então o SIM é uma lista curta de
 * mensagens INTEIRAS (normalizadas); o que não está nela — dúvida, condição,
 * pergunta, outra pessoa — fica com o fundador. Um "sim" que não era sim manda
 * mensagem pra um estranho (o incidente de 04/08 que criou a pergunta).
 *
 * PURO: sem I/O.
 */

/** minúsculo, sem acento (inclusive o combinado), sem pontuação de borda, espaços simples. */
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ') // emoji
    .replace(/[!.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Saudação no começo não muda a resposta ("bom dia, fala com esse contato").
const SAUDACAO = /^(?:bom dia|boa tarde|boa noite|oi|ola|opa)\s+/;

const SIM = new Set([
  // Sem "certo" (muitas vezes é só "ok, entendi") e sem "e ele"/"e ela" soltos
  // (sem acento é "e ele?", pergunta) — revisão final, LOW.
  'sim', 'sim sim', 'isso', 'isso mesmo', 'isso ai', 'exato', 'exatamente', 'correto',
  'confirmo', 'confirmado', 'positivo', 'pode sim', 'pode chamar', 'pode chamar sim',
  'e ele sim', 'e ela sim', 'sim e ele', 'sim e ela', 'e ele mesmo', 'e ela mesma',
  'e o responsavel', 'e a responsavel', 'e o dono', 'e a dona', 'e o gerente', 'e a gerente',
  'e o socio', 'e a socia', 'e dele', 'e dela',
  'chamar esse numero', 'chama esse numero', 'pode chamar esse numero', 'chamar nesse numero',
  'fala com esse contato', 'fala com ele', 'fala com ela', 'pode falar com ele', 'pode falar com ela',
  'entra em contato com ele', 'entra em contato com ela', 'pode entrar em contato com ele',
  'pode entrar em contato com ela',
]);

const NAO = new Set([
  'nao', 'n', 'nao nao', 'nao e', 'nao e ele', 'nao e ela', 'nao e esse', 'nao e esse numero',
  'errado', 'ta errado', 'esta errado', 'numero errado', 'e engano', 'foi engano', 'engano',
  'nao conheco', 'nao sei quem e',
]);

/**
 * @param {string} texto a mensagem da casa
 * @returns {'sim'|'nao'|null}
 */
function respostaDaConfirmacao(texto) {
  const bruto = String(texto || '');
  if (!bruto.trim()) return null;
  // Número ou pergunta junto: indicação nova ou dúvida — não é sim nem não.
  if ((bruto.match(/\d/g) || []).length >= 8) return null;
  if (bruto.includes('?')) return null;
  const t = normalizar(bruto).replace(SAUDACAO, '');
  if (SIM.has(t)) return 'sim';
  if (NAO.has(t)) return 'nao';
  return null;
}

module.exports = { respostaDaConfirmacao, normalizar };
