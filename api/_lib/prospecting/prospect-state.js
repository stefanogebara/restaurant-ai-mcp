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
  SILENT_STATES,
  OPTOUT_PATTERNS,
  deveResponder,
  detectarOptout,
  descreverAgora,
  estadoAposAcao,
};
