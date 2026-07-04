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
 * @typedef {'aguardando'|'conversando'|'agendando'|'agendado'|'handoff'|'optout'|'pausada'} ProspectState
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
  /\bn[ãa]o\s+(quero|desejo|tenho\s+interesse)\b/i,
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

module.exports = {
  pareceAutoAtendimento,
  deveEnviarPorta,
  SILENT_STATES,
  OPTOUT_PATTERNS,
  deveResponder,
  detectarOptout,
  descreverAgora,
  estadoAposAcao,
};
