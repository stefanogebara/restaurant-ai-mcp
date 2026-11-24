'use strict';

/**
 * "É uma nota de avaliação, ou é um pedido de reserva que começa com número?"
 *
 * Existe por causa de um bug que custava reserva em silêncio (jul/2026): o
 * parser antigo lia `texto.charAt(0)`, e pronto. Bastava a mensagem começar com
 * 1–5 e haver uma pesquisa enviada nas últimas 48h para ela virar avaliação — a
 * IA nunca via nada. O cliente que jantou ontem e hoje escreve
 * "4 pessoas amanhã 20h" — a frase mais comum do fluxo de reserva em português —
 * recebia "Obrigado pela avaliação! ⭐⭐⭐⭐" e ia embora sem mesa.
 *
 * A ASSIMETRIA que define todo o desenho deste módulo:
 *
 *   ler uma avaliação como conversa  → a IA responde, custa uma resposta
 *                                      levemente fora de tom;
 *   ler uma reserva como avaliação   → perde a RESERVA, sem log, sem ninguém
 *                                      saber.
 *
 * Os custos não são simétricos, então a regra não é simétrica: **na dúvida, não
 * é nota.** Alguns comentários legítimos vão escapar para a IA — é o preço, e é
 * barato.
 *
 * Puro de propósito: sem I/O, sem banco. Quem decide se existe pesquisa
 * pendente é o chamador; aqui só se lê o texto.
 */

/**
 * Fronteira de palavra que enxerga acento.
 *
 * `\b` do JavaScript é ASCII: `ã`, `ç`, `á` NÃO são caracteres de palavra. Isso
 * significa que /amanhã\b/ nunca casa em "2 amanhã", porque entre `ã` e o fim
 * da string não há transição palavra→não-palavra. Um teste pegou exatamente
 * isso, e o mesmo defeito silencioso valeria para "sábado", "terça", "mañana"
 * e "niños". Daí a fronteira própria.
 */
const LETRA = 'A-Za-zÀ-ÿ0-9_';
const palavra = (corpo, flags = 'i') => new RegExp(`(?:^|[^${LETRA}])(?:${corpo})(?![${LETRA}])`, flags);

/** Substantivo de quantidade logo depois do dígito: "4 pessoas", "2 lugares". */
const SUBSTANTIVO_QUANTIDADE = new RegExp(
  `^(?:pessoas?|pessoal|lugares?|adultos?|crian[çc]as?|gente|convidados?|clientes?`
  + `|people|persons?|guests?|adults?|children|kids?|personas?|ni[ñn]os?|mesas?|tables?)(?![${LETRA}])`,
  'i',
);

/**
 * Marcadores de intenção de reserva em qualquer lugar da mensagem.
 * Cobre pt-BR, en e es porque o produto atende nos três.
 */
const MARCADORES_RESERVA = [
  // verbos e substantivos de reserva
  palavra('reserv[a-zà-ÿ]*|remarcar|marcar|agendar|agendamento|book[a-z]*|cancel[a-zà-ÿ]*|confirmar mesa'),
  // dias e datas relativas
  palavra('hoje|amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|feriado'
    + '|today|tomorrow|tonight|hoy|ma[ñn]ana|noche'),
  // refeições e períodos
  palavra('almo[çc]o|jantar|lunch|dinner|almuerzo|cena|noite'),
  // horário: "20h", "21 hs", "20:30", "8pm"
  /\d{1,2}\s*(?:h(?![a-z])|hs|hrs|horas|:\d{2}|\s*[ap]\.?m\.?(?![a-z]))/i,
  // "às 21", "as 21"
  /[àa]s\s*\d{1,2}(?![\d:])/i,
];

const ehTexto = (t) => typeof t === 'string' && t.trim().length > 0;

/**
 * A mensagem tem cara de pedido de reserva?
 *
 * Usado tanto para vetar a leitura como nota quanto para dar ao chamador uma
 * razão explícita de por que não tratou como avaliação.
 */
function pareceReserva(texto) {
  if (!ehTexto(texto)) return false;
  const t = texto.trim();

  // "4 pessoas", "2 lugares" — o dígito é quantidade, não nota.
  const depoisDoDigito = /^[1-5]\s*[-–—.,;:!]*\s*(.*)$/s.exec(t);
  if (depoisDoDigito && SUBSTANTIVO_QUANTIDADE.test(depoisDoDigito[1].trim())) return true;

  return MARCADORES_RESERVA.some((re) => re.test(t));
}

/** Conta estrelas em emoji. Satura em 5 — sete estrelas é entusiasmo, não erro. */
function notaPorEstrelas(texto) {
  const estrelas = (texto.match(/[⭐★☆🌟]/g) || []).length;
  if (estrelas === 0) return null;
  return Math.min(estrelas, 5);
}

/**
 * Lê a nota (1–5) e o comentário opcional de uma resposta de pesquisa.
 *
 * @returns {{ nota: number|null, comentario: string|null, motivo: string|null }}
 *          `motivo` explica a recusa — vai para o log, para que uma reserva
 *          engolida por engano deixe rastro em vez de sumir.
 */
function lerNota(texto) {
  const recusa = (motivo) => ({ nota: null, comentario: null, motivo });

  if (!ehTexto(texto)) return recusa('vazio');
  const t = texto.trim();

  const porEstrelas = notaPorEstrelas(t);
  if (porEstrelas !== null) return { nota: porEstrelas, comentario: null, motivo: null };

  // O dígito precisa ser a mensagem — não o começo de um número maior.
  // Sem esta guarda, "50 reais" virava nota 5 e "12 pessoas" virava nota 1.
  const casa = /^([1-5])(?!\d)\s*(.*)$/s.exec(t);
  if (!casa) return recusa('não começa com nota de 1 a 5');

  const nota = parseInt(casa[1], 10);
  const resto = casa[2].replace(/^[\s\-–—.,;:!]+/, '').trim();

  // Só o dígito (com ou sem pontuação): é nota, sem ambiguidade possível.
  if (!resto) return { nota, comentario: null, motivo: null };

  // Tem texto depois. Se ele cheira a reserva, a mensagem NÃO é avaliação —
  // e este é exatamente o ramo que o bug original não tinha.
  if (pareceReserva(t)) return recusa('texto tem marcador de reserva');

  return { nota, comentario: resto, motivo: null };
}

module.exports = { lerNota, pareceReserva };
