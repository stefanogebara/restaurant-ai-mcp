'use strict';

/**
 * Deterministic extraction of owner phone / name / email from a lead's message.
 *
 * Ported verbatim (TS→JS) from olivia_brain.ts. These run BEFORE the LLM as
 * guardrails: when a prospect hands over the owner's WhatsApp number (typed or
 * as a shared contact card), we register it deterministically rather than
 * trusting the model to re-extract it (the model sometimes re-asks for a number
 * that's already on screen — the #1 irritation). Anti-invention: an implausible
 * BR number returns null instead of a guess.
 */

const DDDS_BR = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

/** Extract the 2-digit DDD from one of the lead's own numbers (E.164 or raw). */
function extrairDddBr(raw) {
  if (!raw) return null;
  const texto = String(raw).trim();
  let d = texto.replace(/\D/g, '');
  const intl = /^\s*\+/.test(texto) || d.startsWith('00');
  if (intl) {
    if (d.startsWith('0055')) d = d.slice(4);
    else if (d.startsWith('55')) d = d.slice(2);
    else return null;
  } else if (d.startsWith('55') && d.length >= 12) {
    d = d.slice(2);
  }
  if (d.length < 10 || d.length > 11) return null;
  const ddd = d.slice(0, 2);
  return DDDS_BR.has(ddd) ? ddd : null;
}

/**
 * Normalize a freely-written BR number to E.164 (+55...). Returns null when it
 * doesn't look like a plausible BR number (anti-invention).
 * @param {string} raw
 * @param {string|null} [dddPadrao] - lead's area code, to complete a local number
 */
function normalizarNumeroBr(raw, dddPadrao) {
  if (!raw) return null;
  const texto = String(raw).trim();
  let digits = texto.replace(/\D/g, '');
  if (!digits) return null;

  const intlExplicit = /^\s*\+/.test(texto) || digits.startsWith('00');
  if (intlExplicit) {
    if (digits.startsWith('0055')) digits = digits.slice(4);
    else if (digits.startsWith('55')) digits = digits.slice(2);
    else return null;
  } else {
    if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
    if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2);
  }

  if (!intlExplicit && (digits.length === 8 || digits.length === 9) && dddPadrao) {
    const ddd = String(dddPadrao).replace(/\D/g, '').slice(-2);
    if (DDDS_BR.has(ddd)) digits = ddd + digits;
  }

  if (digits.length < 10 || digits.length > 11) return null;
  const ddd = digits.slice(0, 2);
  const local = digits.slice(2);
  if (!DDDS_BR.has(ddd)) return null;
  if (digits.length === 11 && !local.startsWith('9')) return null;
  if (digits.length === 10 && !/^[2-9]/.test(local)) return null;

  return `+55${digits}`;
}

/**
 * A linha PODE ter WhatsApp? Celular brasileiro tem 9 dígitos após o DDD e
 * começa com 9; fixo tem 8 e WhatsApp não existe nele.
 *
 * Existe porque o disparo descobria isso tarde demais: mandava o template,
 * levava 131026 da Meta e só então marcava o lead. Cada descoberta custava uma
 * mensagem e um ponto de reputação do número. Aqui é determinístico e de graça.
 *
 * Responde "pode ter", não "tem": um celular sem WhatsApp instalado ainda
 * falha, e o caminho do recibo continua sendo quem trata esse caso.
 *
 * @param {string} raw - número em qualquer formato (E.164, com máscara, sem +)
 * @returns {boolean}
 */
function ehCelularBr(raw) {
  const e164 = normalizarNumeroBr(raw);
  if (!e164) return false;
  return e164.length === 14; // +55 + DDD(2) + 9 dígitos
}

/**
 * Pick ONE BR number from a text that may carry several — typical of the
 * WhatsApp Business shared-contact card ("[Contato compartilhado: 215..., 5511...]"
 * — Meta internal IDs mixed with real numbers).
 */
function escolherNumeroBr(raw, dddPadrao) {
  if (!raw) return null;
  const tokens = String(raw).split(/[^\d+]+/).filter((t) => t.replace(/\D/g, '').length >= 8);
  if (tokens.length <= 1) return normalizarNumeroBr(raw, dddPadrao);

  // Multi-number: each token is a COMPLETE number; only accept mobiles (+55 + DDD
  // + 9 digits = 14 chars) so Meta internal IDs that look like a 10-digit landline
  // are discarded.
  const moveis = [];
  for (const t of tokens) {
    const n = normalizarNumeroBr(t);
    if (n && n.length === 14 && !moveis.includes(n)) moveis.push(n);
  }
  if (moveis.length === 0) return null;

  const ddd = dddPadrao ? String(dddPadrao).replace(/\D/g, '').slice(-2) : null;
  if (ddd) {
    const match = moveis.find((n) => n.slice(3, 5) === ddd);
    if (match) return match;
  }
  return moveis[0];
}

/**
 * Detect the OWNER's number in the lead's last message (deterministic — the LLM
 * sometimes re-asks even with the number on screen). Covers a shared-contact
 * card and a number (almost) alone in the text. Does NOT fire when the number is
 * mid-sentence (anti-false-positive: CNPJ, money, "liguei pro 0800...").
 */
function extrairNumeroDono(corpo, dddPadrao) {
  if (!corpo) return null;
  const card = String(corpo).match(/\[Contato compartilhado:([^\]]+)\]/i);
  if (card) return escolherNumeroBr(card[1], dddPadrao);

  const numero = escolherNumeroBr(corpo, dddPadrao);
  if (!numero) return null;
  const resto = String(corpo)
    .replace(/[+\d\s().\-]/g, ' ')
    .replace(
      /\b(oi|ol[áa]|bom dia|boa tarde|boa noite|tudo bem|segue|contato|whats(app)?|zap|n[uú]mero|cel(ular)?|tel|falar com|fala com|com o|com a|do|da|dele|dela|é|eh|esse|este|aqui|t[áa]|ok|obrigad[ao]|por favor|pf)\b/gi,
      ' ',
    )
    .replace(/[^\p{L}]/gu, '');
  return resto.length <= 12 ? numero : null;
}

const NOME_RUIDO =
  /\b(oi|ol[áa]|bom dia|boa tarde|boa noite|tudo bem|segue|contato|whats(app)?|zap|n[uú]mero|cel(ular)?|tel|falar com|fala com|com o|com a|com|do|da|de|dele|dela|é|eh|esse|este|essa|esta|aqui|t[áa]|ok|obrigad[ao]|por favor|pf|o|a)\b/gi;

function limparNome(raw) {
  const nome = String(raw).replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!nome) return null;
  const palavras = nome.split(' ').filter(Boolean);
  if (palavras.length < 1 || palavras.length > 3) return null;
  if (nome.length < 2 || nome.length > 40) return null;
  return nome;
}

/** Extract the owner's NAME from the lead's message (for personalizing the intro). */
function extrairNomeDono(corpo) {
  if (!corpo) return null;
  const card = String(corpo).match(/\[Contato compartilhado:[^\]]*\|\s*nome:\s*([^\]]+)\]/i);
  if (card) return limparNome(card[1]);
  if (/\[Contato compartilhado:/i.test(corpo)) return null;
  const resto = String(corpo).replace(/[+\d().\-]/g, ' ').replace(NOME_RUIDO, ' ');
  return limparNome(resto);
}

/** First email address in a string, lowercased; null if none. */
function extrairEmail(texto) {
  const match = texto && String(texto).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function semAcento(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Is the message essentially JUST an email address (plus filler like "meu
 * email é …", "pode mandar pra …")? Guards the deterministic booking path:
 * an email inside a longer sentence ("fala com meu sócio x@y.com") is a
 * referral, not an answer to "qual seu e-mail?" — that goes to the LLM.
 */
function mensagemApenasEmail(texto, email) {
  if (!email) return false;
  const normalizado = semAcento(texto || '');
  const semEmail = normalizado.replace(semAcento(email), ' ');
  const resto = semEmail
    .replace(/[.,;:!?()[\]{}"']/g, ' ')
    .replace(/\b(meu|minha|email|e-mail|mail|e|eh|é|pode|manda|mandar|envia|enviar|para|pra|por|favor|segue|aqui|convite|o|me|no|na|sim|ok|beleza|claro)\b/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ') // emojis are filler too
    .replace(/\s+/g, '');
  return resto.length === 0;
}


/**
 * CELULAR NO SITE DO RESTAURANTE — o destravamento de 26/08/2026.
 *
 * O funil parou por alcançabilidade, não por qualidade: 1.392 casas passam o
 * filtro e 1.389 têm SÓ FIXO. WhatsApp não existe em fixo, então elas nunca
 * receberiam intro. Delas, 847 têm site — e restaurante põe o WhatsApp no
 * próprio site, quase sempre como botão flutuante `wa.me`.
 *
 * O `prospect-enrich` não resolvia isso: ele procura CNPJ, não telefone
 * (medido em 26/08: `sem_cnpj: 15` e `enriquecidos: 0` em quase toda rodada).
 *
 * ORDEM DE CONFIANÇA, e ela importa:
 *   1. `wa.me/55...` e `api.whatsapp.com/send?phone=` — o número está ali
 *      PORQUE é WhatsApp. É a única fonte que prova o canal, não só o formato.
 *   2. `tel:` — é telefone de verdade, marcado como tal pelo autor da página.
 *   3. Texto solto — último recurso; é onde mora o CNPJ, o CEP e o preço.
 *
 * SÓ DEVOLVE CELULAR. Fixo é exatamente o que já temos e o que não serve;
 * `normalizarNumeroBr` já reprova DDD inexistente e local que não começa com
 * 9, então a validação toda é reaproveitada em vez de reescrita.
 */
const WA_LINK_RE = /(?:wa\.me|whatsapp\.com\/send\?phone=|api\.whatsapp\.com\/send\?phone=)\/?(\+?\d{10,15})/gi;
const TEL_HREF_RE = /tel:(\+?[\d\s().-]{8,20})/gi;
// Celular BR em texto: DDD opcional entre parênteses + 9 + 8 dígitos.
//
// AS DUAS ÂNCORAS `(?<!\d)` / `(?!\d)` SÃO O CONSERTO DE 02/09/2026, e sem
// elas esta regex é uma fábrica de falso positivo. Sem a fronteira, ela casa no
// MEIO de qualquer corrida longa de dígitos. Medido em produção, em 19 sites
// reais da fila:
//
//   vc_custom_1593019542599   →  (15)(93019)(5425)   nome de classe do WPBakery
//   0.59999999999999997779…   →  (99)(99977)(7955)   float em JSON do Elementor
//
// Dez "celulares" em dezenove sites, e os dez eram lixo — dois com DDD 11 por
// coincidência, o resto espalhado por DDDs que nada tinham a ver com a praça.
// Um número desses gravado em `whatsapp_phone` vira intro do Olímpia para um
// desconhecido e um ponto de reputação a menos na Meta.
const TEXTO_CELULAR_RE = /(?<!\d)(?:\+?55[\s.-]*)?\(?(\d{2})\)?[\s.-]*(9\d{4})[\s.-]*(\d{4})(?!\d)/g;

// Pista de que os dígitos ao lado são telefone. O caminho de texto solto é o
// último recurso e existe para achar WhatsApp — um celular boiando sem nenhuma
// dessas palavras por perto é tão provavelmente um número de pedido, um CNPJ
// partido ou um preço quanto um contato.
const PISTA_TELEFONE_RE = /(whats|zap|wpp|celular|\bcel\b|telefone|\bfone\b|\btel\b|contato|liga(r|mos)?\b|reserva)/i;
// Janela de contexto ao redor do casamento. 80 antes cobre "WhatsApp: (11) …"
// e "Reservas pelo telefone …"; 30 depois cobre "… (11) 9…  (WhatsApp)".
const JANELA_ANTES = 80;
const JANELA_DEPOIS = 30;

/**
 * Só o texto que uma pessoa VÊ. Telefone mora em texto visível; o que enganou
 * a regex morava em `<style>` e em JSON de configuração dentro de `<script>`.
 * Remover markup antes de procurar elimina a classe inteira de engano, e é
 * mais barato que tentar adivinhar depois se um casamento é legítimo.
 */
function textoVisivel(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Atributos morrem junto com as tags: `class`, `id` e `data-*` são onde
    // vivem os nomes gerados que imitam telefone.
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ');
}

/** Todos os casamentos de uma regex global, sem vazar lastIndex entre chamadas. */
function todos(re, texto) {
  const out = [];
  const r = new RegExp(re.source, re.flags);
  let m;
  while ((m = r.exec(texto)) !== null) out.push(m);
  return out;
}

/**
 * PURA. Acha o celular de WhatsApp no HTML de um site. Null quando não há —
 * nunca chuta, pela mesma regra anti-invenção do resto deste arquivo.
 *
 * @param {string} html - HTML cru da página
 * @param {string} [dddPadrao] - DDD da praça, para número escrito sem DDD
 * @returns {{numero: string, fonte: 'wa_link'|'tel_href'|'texto'}|null}
 */
function extrairCelularDoSite(html, dddPadrao) {
  const texto = String(html || '');
  if (!texto) return null;

  const primeiroCelular = (brutos, fonte) => {
    for (const bruto of brutos) {
      const n = normalizarNumeroBr(bruto, dddPadrao);
      // 14 = '+55' + DDD(2) + 9 dígitos. Fixo normaliza para 13 e é descartado.
      if (n && n.length === 14) return { numero: n, fonte };
    }
    return null;
  };

  // 1. Link de WhatsApp — o número já vem com o 55 na frente.
  const doLink = primeiroCelular(
    todos(WA_LINK_RE, texto).map((m) => (m[1].startsWith('+') ? m[1] : `+${m[1]}`)),
    'wa_link');
  if (doLink) return doLink;

  // 2. href tel:
  const doTel = primeiroCelular(todos(TEL_HREF_RE, texto).map((m) => m[1]), 'tel_href');
  if (doTel) return doTel;

  // 3. Texto solto — só o visível, e só perto de uma pista de telefone.
  const visivel = textoVisivel(texto);
  const comPista = todos(TEXTO_CELULAR_RE, visivel).filter((m) => {
    const ini = Math.max(0, m.index - JANELA_ANTES);
    const ctx = visivel.slice(ini, m.index + m[0].length + JANELA_DEPOIS);
    return PISTA_TELEFONE_RE.test(ctx);
  });
  return primeiroCelular(comPista.map((m) => `${m[1]}${m[2]}${m[3]}`), 'texto');
}

module.exports = {
  extrairCelularDoSite,
  textoVisivel,
  DDDS_BR,
  extrairDddBr,
  normalizarNumeroBr,
  ehCelularBr,
  escolherNumeroBr,
  extrairNumeroDono,
  extrairNomeDono,
  extrairEmail,
  mensagemApenasEmail,
};
