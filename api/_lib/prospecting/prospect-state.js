'use strict';

/**
 * Prospect conversation state machine + deterministic opt-out detection.
 *
 * Ported from prospectautomation/supabase/functions/_shared/olivia_brain.ts
 * (the pure, provider-agnostic pieces). These run BEFORE the LLM and decide
 * whether the agent should speak at all, so they are the safety floor of the
 * whole system. Opt-out is detected deterministically (LGPD) — never left to
 * the model — and is terminal (enforced again in-DB by the optout-terminal
 * trigger from 20260626_prospecting.sql).
 */

/**
 * @typedef {'aguardando'|'conversando'|'agendando'|'agendado'|'handoff'|'optout'|'pausada'|'recusou'} ProspectState
 */

// States in which the agent must STAY SILENT:
//   optout   → asked to stop (LGPD, permanent)
//   handoff  → a human took over
//   agendado → demo already booked, conversation closed
//   pausada  → operator killed the agent on this thread (kill switch). Reversible.
const SILENT_STATES = new Set(['optout', 'handoff', 'agendado', 'pausada']);

/** The agent only replies in "active" states (null/aguardando/conversando/agendando). */
function deveResponder(estado) {
  if (!estado) return true;
  return !SILENT_STATES.has(estado);
}

// Unambiguous pt-BR opt-out phrases. Deliberately conservative: a bare "não" is
// NOT opt-out (could be "não sou o dono", "não hoje"). Ambiguous cases fall
// through to the LLM, which can escalate/opt-out via a tool. Only clear "stop".
const OPTOUT_PATTERNS = [
  // para / pare / parar de mandar|enviar|mensagear|me chamar
  /\bpar(?:a|e|ar)\b.*\b(de\s+)?(mandar|enviar|mensag|me\s+chamar)/i,
  // "não quero X" only when X is the OUTREACH itself. A broad /não quero/
  // opted out an engaged owner asking "não quero ela [a IA] falando besteira"
  // (gym, 2026-07-07). Objects like "perder reserva" fall through to the LLM.
  /\bn[ãa]o\s+(?:quero|desejo)\s*[.!…]*$/i, // bare decline ends the message
  /\bn[ãa]o\s+(?:quero|desejo)\s+(?:mais\b|receber\b|contato\b|conversar\b|papo\b|nada\b|saber\b)/i,
  /\bn[ãa]o\s+tenho\s+interesse\b/i,
  /\bn[ãa]o\s+me\s+(mande|envie|chame|perturbe|incomode)/i,
  /\b(remov\w*|descadastr|tira?r?\s+da\s+lista|sair\s+da\s+lista)/i,
  /\bn[ãa]o\s+enche/i,
  /\bperdeu\s+meu\s+n[úu]mero/i,
  /\b(stop|unsubscribe|cancelar?\s+inscri)/i,
  /\bsem\s+interesse\b/i,
];

// Institutional auto-reply markers (from the first real dispatch's transcripts:
// Refúgio, Bar do Parque, BelaTucci, Bosco, Cabruca, TUJU, D.O.M., Dalva e Dito).
const AUTO_ATENDIMENTO_PATTERNS = [
  /\bagradec\w+\s+(seu|o|sua|a)\s+(contato|prefer[êe]ncia|mensagem|solicita[çc][ãa]o)/i,
  /\bhor[áa]rio\s+de\s+(atendimento|funcionamento)/i,
  /\bfa[çc]a\s+(seu|o)\s+pedido/i,
  /\bseja\s+bem[- ]?vind/i,
  /\bbem[- ]?vindo\s*\(?a?\)?\s+(ao|à|a)\b/i,
  /\bresponderemos\s+(assim\s+que|em\s+breve|o\s+quanto\s+antes)/i,
  /\bnossa\s+equipe\s+(vai|ir[áa])/i,
  /\bem\s+(alguns\s+)?instantes/i,
  /\bdigite\s+\d/i,
  /\bn[ãa]o\s+estamos\s+dispon[íi]veis/i,
  /\breservas?\s+(exclusivamente\s+)?pelo\s+link/i,
  /\bestamos\s+desativando\s+(esse|este)\s+n[\u00fau]mero/i,
  /\bnos\s+chame\s+(aqui|neste|nesse|no)\b/i,
  /\b(um\s+(minuto|momento|instante)|aguarde)\s+e?\s*j[\u00e1a]\s+te\s+atend/i,
  /\bj[\u00e1a]\s+te\s+atendemos\b/i,
  /\baproveitamos\s+para\s+informar/i,
  /\b(99\s?food|ifood|rappi|uber\s?eats)\b/i,
];

/**
 * PURE: does this inbound read as an institutional AUTO-REPLY (greeting bot,
 * menu, hours, order link) rather than a person? Conservative: one strong
 * marker is required; plain human text never matches.
 */
function pareceAutoAtendimento(texto) {
  if (!texto) return false;
  return AUTO_ATENDIMENTO_PATTERNS.some((re) => re.test(String(texto)));
}

/**
 * PURE: should the responder send the one-time door-line? True only when the
 * thread is template(s)-out + bot-noise-in and NOTHING else: any human-looking
 * inbound or any non-template outbound (a reply, a nudge, a previous door-line)
 * disqualifies — which also makes the door-line once-per-thread by definition.
 */
function deveEnviarPorta(history) {
  const rows = (history || []).filter((h) => h && h.tipo !== 'sys');
  const ins = rows.filter((h) => h.direcao === 'in');
  if (ins.length === 0) return false;
  if (!ins.every((h) => pareceAutoAtendimento(h.corpo))) return false;
  const outs = rows.filter((h) => h.direcao === 'out');
  return outs.every((h) => h.tipo === 'template');
}

/** Detect unambiguous opt-out. Ambiguous → false (let the LLM handle/escalate). */
function detectarOptout(texto) {
  if (!texto) return false;
  const t = String(texto).trim();
  if (!t) return false;
  return OPTOUT_PATTERNS.some((re) => re.test(t));
}

// Soft, unambiguous declines that are NOT opt-out (LGPD "stop") but DO mean
// "stop pursuing me": the lead is polite, just not interested / already sorted.
// Detected deterministically so we PARK the lead (state 'recusou' → dropped from
// every proactive selector, which whitelist only active states) and answer with
// ONE graceful line instead of nudging them the next day — the "invasive"
// complaint that motivated this (2026-07). Deliberately NARROW (high precision):
// "agora não" alone is ambiguous with scheduling ("agora não, semana que vem
// sim") and is handled by the engagement taper + persona recede, NOT here.
// 'recusou' is REVERSIBLE: a later inbound is still answered (not a SILENT_STATE)
// and estadoAposAcao('responder') flips the lead back to 'conversando'.
const RECUSA_SUAVE_PATTERNS = [
  // "não é o caso" / "não é (o) nosso caso" / "não é pra gente/nós/mim"
  /\bn[ãa]o\s+(?:é|eh)\s+(?:o\s+)?(?:caso|nosso\s+caso|pra\s+(?:a\s+)?(?:gente|n[óo]s|mim)|para\s+(?:a\s+)?(?:gente|n[óo]s|mim))\b/i,
  // "não é o momento" / "não é o nosso momento" / "não é um bom momento"
  /\bn[ãa]o\s+(?:é|eh)\s+(?:o\s+|um\s+|(?:o\s+)?nosso\s+)?(?:bom\s+)?momento\b/i,
  // "não vejo/temos/tenho/há necessidade" / "sem necessidade"
  /\b(?:n[ãa]o\s+(?:vejo|temos|tenho|h[áa])|sem)\s+necessidade\b/i,
  // "não temos/tenho interesse" (plural slips past the singular opt-out pattern)
  /\bn[ãa]o\s+(?:temos|tenho)\s+interesse\b/i,
  // polite decline: "obrigado/grato/valeu, mas não…"
  /\b(?:obrigad\w+|grat[oa]|valeu)\b[\s,]*mas\s+n[ãa]o\b/i,
  // already solved: "já temos/uso/usamos/trabalho com … sistema/ferramenta/CRM/…"
  /\bj[áa]\s+(?:temos|tenho|uso|usamos|trabalho\s+com|trabalhamos\s+com)\b[^.!?\n]{0,30}\b(?:sistema|ferramenta|solu[çc][ãa]o|crm|plataforma|software|programa|fornecedor|parceir)/i,
];

// If ANY of these appear, the message is NOT a clean stop — it carries live
// intent (a question, a price/switch curiosity, a "yes, later", a handoff to a
// partner). A decline fragment inside such a message is engagement, not a "no":
//   "já temos um sistema, quanto custa o de vocês?"  → asking OUR price (hot)
//   "terça não é o caso, quarta sim"                  → picking a day
//   "não é pra mim decidir, é pro meu sócio"          → handoff, not a decline
// Guarding here keeps the dismissive close + park OFF the hottest leads.
// Precision over recall by design: a missed decline is cheap (the persona
// recedes and the taper stops the nudge); a false park brushes off a buyer.
const RECUSA_ENGAJADA = new RegExp(
  '[?]'                                                                    // any question
  + '|\\b(quanto|pre[çc]o|valor|custa|custo|mensalidade|plano|planos'      // price curiosity
  + '|trocar|troc[ao]|mudar|migrar|testar|experimentar|proposta|or[çc]amento' // switch / want-more
  + '|conhecer|demonstra|apresenta'                                        // wants to see it
  + '|sim|consigo|pode\\s+ser|bora|vamos|marcar?'                          // scheduling-affirmative
  + '|amanh[ãa]|semana\\s+que\\s+vem|m[êe]s\\s+que\\s+vem|depois\\s+do\\s+dia|mais\\s+tarde' // defer-but-alive
  + '|s[óo]cio|respons[áa]vel|dono|gerente|fala\\s+com)\\b',                // handoff to another person
  'i',
);

/**
 * PURE: does this inbound read as a CLEAN soft decline (polite "not for us / not
 * the moment / already sorted") that isn't a hard opt-out? Fires only when a
 * decline pattern matches AND the message carries no live-intent signal
 * (RECUSA_ENGAJADA) — a question, price/switch curiosity, a "yes, later", or a
 * handoff. Ambiguous "agora não" falls through too, so the taper/persona (not a
 * close-line) handle it. Opt-out is checked first upstream, so no hard stop here.
 */
function detectarRecusaSuave(texto) {
  if (!texto) return false;
  const t = String(texto).trim();
  if (!t) return false;
  if (RECUSA_ENGAJADA.test(t)) return false; // live intent → not a clean stop
  return RECUSA_SUAVE_PATTERNS.some((re) => re.test(t));
}

// Injected as a user-role turn (noTools) when a soft decline is detected: the
// agent sends ONE warm close instead of pitching back at a "no".
const RECUSA_INSTRUCTION =
  '[INSTRUÇÃO INTERNA, não é mensagem do cliente: a pessoa recusou com educação ' +
  '(não é o caso / não é o momento / já tem solução). Responda com UMA linha ' +
  'curta e calorosa: agradeça, reconheça sem insistir e diga que fica à disposição ' +
  'se fizer sentido no futuro. NÃO faça pergunta, NÃO reapresente a oferta, NÃO ' +
  'tente contornar a recusa. Encerre com leveza. Não use ferramentas — responda ' +
  'só com o texto da mensagem.]';

/**
 * Describe "now" in pt-BR in São Paulo time, e.g.
 *   "quinta-feira, 18 de junho de 2026, 14:30 (horário de Brasília)".
 * Pure/deterministic (same ms → same string; Intl with a fixed timeZone). Goes
 * into the system prompt so the agent can resolve "hoje/amanhã/semana que vem".
 */
function descreverAgora(nowMs) {
  const d = new Date(nowMs);
  const data = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(d);
  return `${data}, ${hora} (horário de Brasília)`;
}

/**
 * Next prospect_state given the chosen action. 'agendar' → 'agendando' (Phase 4
 * confirms the slot and sets 'agendado'); handoff/optout are terminal for the
 * automation; responder keeps 'conversando'.
 *
 * @param {{tipo: string}} acao
 * @returns {ProspectState|null} null = leave state unchanged
 */
function estadoAposAcao(acao) {
  switch (acao.tipo) {
    case 'optout': return 'optout';
    case 'handoff': return 'handoff';
    case 'agendar': return 'agendando';
    case 'registrar_responsavel': return 'conversando';
    case 'responder': return 'conversando';
    case 'ignorar': return null;       // deliberate silence: no send, no state change
    case 'nada': return null;          // empty/garbled: no send, no state change
    default: return null;
  }
}

// ---- Resgate de turno pendurado (rede de segurança do flush) -----------------
// Uma invocação que morre no meio (timeout, Meta 5xx no envio, crash pós-claim)
// deixa o inbound claimado e sem resposta — e nada retenta: o thread fica mudo
// até o lead falar de novo (incidente 2026-07-20: 7 threads mudas em horário de
// pico, Meta #131000). O flush cron varre e re-enfileira esses turnos.
const RESGATE_MIN_MS = 10 * 60 * 1000;        // antes disso o turno pode estar legitimamente em voo
const RESGATE_REARME_MS = 2 * 60 * 60 * 1000; // re-arma p/ cobrir envio que falhou também no re-run
const RESGATE_JANELA_MS = 24 * 60 * 60 * 1000; // janela Meta de texto livre
// Espelha selectDueFlush: resgatar um estado que o flush não seleciona seria marcar à toa.
const RESGATE_STATES = new Set(['aguardando', 'conversando', 'agendando']);

/**
 * PURE: is this lead a hung-turn resgate candidate?
 * Gates: flush-eligible state; nothing already queued (reply_apos); the LEAD
 * spoke last (um out no fim = turno concluído); idade entre RESGATE_MIN_MS e a
 * janela de 24h; uma vez por inbound (resgate_em >= last_in_at já resgatou),
 * com re-arme após RESGATE_REARME_MS — custo limitado (~12 LLM/dia por thread
 * no pior caso) e morre junto com a janela.
 * @param {{state:string|null, replyAposMs:number|null, lastMsgDirecao:string|null,
 *          lastInAtMs:number|null, resgateEmMs:number|null, nowMs?:number}} args
 * @returns {{eligible: boolean, reason: string}}
 */
function elegivelParaResgate({ state, replyAposMs, lastMsgDirecao, lastInAtMs, resgateEmMs, nowMs = Date.now() }) {
  if (!RESGATE_STATES.has(state)) return { eligible: false, reason: 'estado_fora_do_flush' };
  if (replyAposMs) return { eligible: false, reason: 'ja_enfileirado' };
  if (lastMsgDirecao !== 'in') return { eligible: false, reason: 'sem_inbound_pendente' };
  if (!lastInAtMs) return { eligible: false, reason: 'sem_inbound' };
  const idade = nowMs - lastInAtMs;
  if (idade < RESGATE_MIN_MS) return { eligible: false, reason: 'turno_em_voo' };
  if (idade >= RESGATE_JANELA_MS) return { eligible: false, reason: 'fora_janela_24h' };
  if (resgateEmMs && resgateEmMs >= lastInAtMs && nowMs - resgateEmMs < RESGATE_REARME_MS) {
    return { eligible: false, reason: 'resgatado_recentemente' };
  }
  return { eligible: true, reason: 'ok' };
}

module.exports = {
  pareceAutoAtendimento,
  deveEnviarPorta,
  SILENT_STATES,
  OPTOUT_PATTERNS,
  deveResponder,
  detectarOptout,
  detectarRecusaSuave,
  RECUSA_INSTRUCTION,
  descreverAgora,
  estadoAposAcao,
  RESGATE_MIN_MS,
  RESGATE_REARME_MS,
  RESGATE_JANELA_MS,
  elegivelParaResgate,
};
