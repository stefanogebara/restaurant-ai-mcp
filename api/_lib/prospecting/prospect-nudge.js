'use strict';

/**
 * Nudge logic — the conversational follow-up when a lead goes quiet.
 * Ported from olivia_nudge.ts. Pure functions (cron + responder orchestrate I/O).
 *
 * A nudge is NOT a template blast: it's the agent writing ONE natural line to
 * pick the conversation back up from where it stopped, ~23h after the lead's
 * last message. Constraints that make it human instead of spammy:
 *  - only in active conversations (conversando/agendando), never terminal states;
 *  - only when the agent spoke LAST (the lead left us hanging — never nudge
 *    on top of an unanswered inbound, the responder owes that reply);
 *  - once per silence period: nudge_em must predate the lead's last message
 *    (a new inbound re-arms the nudge; silence after OUR nudge does not);
 *  - inside WhatsApp's 24h customer-service window (free text is only allowed
 *    within 24h of the lead's last message — beyond it Meta requires an
 *    approved template, which we don't send here; the lead stays parked).
 *  - 23h vs 24h leaves a 1h margin: nudge fires "about a day" after the lead's
 *    message but always inside the free-text window.
 */

const NUDGE_JANELA_MS = 23 * 60 * 60 * 1000;      // silence needed to nudge
const WHATSAPP_JANELA_MS = 24 * 60 * 60 * 1000;   // Meta free-text window

// Injected as a user-role turn after history (verbatim from olivia-responder).
const NUDGE_INSTRUCTION =
  '[INSTRUÇÃO INTERNA, não é mensagem do cliente: o cliente não respondeu há ' +
  'cerca de um dia. Escreva UMA mensagem curta, calorosa e natural pra retomar ' +
  'a conversa de onde ela parou, SEM repetir o que você já disse e sem soar ' +
  'robótica ou ansiosa. Puxe com leveza pro próximo passo. Não use ferramentas ' +
  '— responda só com o texto da mensagem.]';

/** Can we still send free-form text (inside Meta's 24h window)? */
function podeMensagemLivre(lastInboundAtMs, nowMs = Date.now()) {
  if (!lastInboundAtMs) return false;
  return nowMs - lastInboundAtMs < WHATSAPP_JANELA_MS;
}

/**
 * Full nudge eligibility for one lead.
 * @param {object} args
 * @param {{direcao:string}|null} args.lastMsg       - most recent message row (any direction)
 * @param {number|null} args.lastInboundAtMs         - epoch ms of the lead's last message
 * @param {number|null} args.nudgeEmMs               - epoch ms of the last nudge sent (lead.nudge_em)
 * @param {number} [args.nowMs]
 * @returns {{eligible: boolean, reason: string}}
 */
function elegivelParaNudge({ lastMsg, lastInboundAtMs, nudgeEmMs, nowMs = Date.now() }) {
  if (!lastMsg) return { eligible: false, reason: 'sem_mensagens' };
  if (!lastInboundAtMs) return { eligible: false, reason: 'sem_inbound' };
  if (lastMsg.direcao !== 'out') return { eligible: false, reason: 'inbound_pendente' };
  const silence = nowMs - lastInboundAtMs;
  if (silence < NUDGE_JANELA_MS) return { eligible: false, reason: 'silencio_curto' };
  if (!podeMensagemLivre(lastInboundAtMs, nowMs)) return { eligible: false, reason: 'fora_janela_24h' };
  // Once per silence period: a nudge AFTER the lead's last message means this
  // silence was already nudged — wait for the lead to speak again.
  if (nudgeEmMs && nudgeEmMs >= lastInboundAtMs) return { eligible: false, reason: 'ja_nudgado' };
  return { eligible: true, reason: 'ok' };
}

module.exports = {
  NUDGE_JANELA_MS,
  WHATSAPP_JANELA_MS,
  NUDGE_INSTRUCTION,
  podeMensagemLivre,
  elegivelParaNudge,
};
