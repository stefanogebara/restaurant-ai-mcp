'use strict';

/**
 * Booking orchestrator (Phase 4b-ii) — wires gcal + agenda + briefing into a
 * CALENDAR-AUTHORED booking flow inside the responder.
 * =============================================================================
 * Two entry points the responder calls:
 *   proporReuniao(lead, nowMs, janelaTexto) — propose REAL free slots (persists
 *     them on the lead). Sent when the agent emits the `agendar` action.
 *   confirmarReuniao(lead, text, nowMs)     — interpret the lead's reply against
 *     the proposed slots and BOOK (create the Google Meet event), or ask for
 *     another time. Runs deterministically BEFORE the LLM when state='agendando'.
 *
 * Credential-gated: bookingDisponivel() is false unless GOOGLE_* creds + at least
 * one rep calendar are configured, so without them the responder degrades to its
 * Phase-1 stub (ask for a time) and NEVER claims a slot is booked. Slots and the
 * chosen time are calendar-verified — the LLM never invents a meeting time.
 * =============================================================================
 */

const { createSecureLogger } = require('../secure-logger');
const { patchLead } = require('./prospect-store');
const gcal = require('./prospect-gcal');
const agenda = require('./prospect-agenda');
const { sendBriefing } = require('./prospect-briefing');
const { extrairEmail, mensagemApenasEmail } = require('./prospect-extract');

const logger = createSecureLogger('ProspectBooking');
const JANELA_DIAS = 8; // free/busy look-ahead window (days)

/** Rep calendars for free/busy + round-robin (comma-separated env). */
function repEmails() {
  return String(process.env.PROSPECTING_REP_EMAILS || '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Booking is live only when OAuth creds + ≥1 rep calendar are configured. */
function bookingDisponivel() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN && repEmails().length > 0);
}

// Seatable prospect_leads row → the agenda module's EventoLead / briefing shape.
function leadParaEvento(lead) {
  return {
    nome: lead.name,
    dono_nome: lead.owner_name || null,
    cidade: lead.city || null,
    bairro: lead.neighborhood || null,
    setor: lead.sector || null,
    instagram_handle: lead.instagram_handle || null,
    instagram_followers: lead.instagram_followers != null ? lead.instagram_followers : null,
    whatsapp_phone: lead.whatsapp_phone || null,
    whatsapp_dono: null,
  };
}

/**
 * Interpret the lead's reply against the proposed slots. PURE (no I/O), testable.
 * Time-first so "terça às 15h" is read as a time, not mis-parsed as option 1/5;
 * a bare number falls back to a slot index.
 * @param {string} text
 * @param {{iso: string, reps: string[]}[]} slots
 * @param {number} nowMs
 * @returns {{tipo: 'slot', slot: object}|{tipo: 'novo', iso: string}|null}
 */
function escolherSlot(text, slots, nowMs) {
  const propostosIso = slots.map((s) => s.iso);
  const sug = agenda.parseHorarioSugerido(text, nowMs);
  if (sug.ok) {
    if (agenda.slotEhValido(sug.iso, propostosIso)) {
      const s = slots.find((x) => Date.parse(x.iso) === Date.parse(sug.iso));
      return s ? { tipo: 'slot', slot: s } : { tipo: 'novo', iso: sug.iso };
    }
    return { tipo: 'novo', iso: sug.iso };
  }
  const mNum = String(text || '').match(/(?:^|\D)([1-9])(?:\D|$)/);
  if (mNum) {
    const idx = parseInt(mNum[1], 10) - 1;
    if (idx >= 0 && idx < slots.length) return { tipo: 'slot', slot: slots[idx] };
  }
  return null;
}

/**
 * Propose real free slots and persist them on the lead. Honors a deferral phrase
 * ("semana que vem") via parseJanelaInicio. Caller sends `mensagem` + moves to
 * 'agendando' (estadoAposAcao already does the state move).
 * @returns {Promise<{ok: boolean, mensagem?: string, reason?: string}>}
 */
async function proporReuniao(lead, nowMs, janelaTexto) {
  if (!bookingDisponivel()) return { ok: false, reason: 'no_calendar' };
  const token = await gcal.getGoogleAccessToken();
  if (!token) return { ok: false, reason: 'no_token' };
  const reps = repEmails();

  const janelaInicio = agenda.parseJanelaInicio(janelaTexto, nowMs) || nowMs;
  const fim = janelaInicio + JANELA_DIAS * 86400000;

  let busyByRep;
  try {
    busyByRep = await gcal.freeBusyMulti(token, reps, Math.min(nowMs, janelaInicio), fim);
  } catch (e) {
    logger.error('freeBusy failed:', e.message);
    return { ok: false, reason: 'freebusy_error' };
  }
  if (Object.keys(busyByRep).length === 0) return { ok: false, reason: 'no_readable_calendar' };

  const slots = agenda.proporSlotsMulti(janelaInicio, busyByRep);
  if (slots.length === 0) return { ok: false, reason: 'no_slots' };

  await patchLead(lead.id, {
    slots,
    slots_at: new Date(nowMs).toISOString(),
    pending_slot_iso: null,
  });
  return { ok: true, mensagem: agenda.formatarPropostaSlots(slots.map((s) => s.iso)) };
}

/**
 * Interpret the lead's reply (when state='agendando') and book, or ask for
 * another time. Returns { handled:false } when it can't interpret → the caller
 * falls through to the LLM to clarify.
 * @returns {Promise<{handled: boolean, mensagem?: string, patch?: object, booked?: boolean}>}
 */
async function confirmarReuniao(lead, text, nowMs) {
  if (!bookingDisponivel()) return { handled: false };

  const emailNaMsg = extrairEmail(text);

  // Email-before-invite round-trip (Olivia's formatarPedidoEmail dance): a
  // pending slot means the lead already chose a time and we asked ONCE for
  // their email. A reply that is essentially just an email books with it as
  // attendee — deterministic, no LLM. Anything else falls through: a new time
  // re-enters the normal flow below (already-asked → no second ask), and a
  // question/decline goes to the LLM, whose next `agendar` action books the
  // pending slot via confirmarPendente.
  if (lead.pending_slot_iso && Date.parse(lead.pending_slot_iso) > nowMs) {
    if (emailNaMsg && mensagemApenasEmail(text, emailNaMsg)) {
      return confirmarPendente(lead, emailNaMsg, nowMs);
    }
  }

  const slots = Array.isArray(lead.slots) ? lead.slots : [];
  if (slots.length === 0) return { handled: false };

  // Stale proposals → re-propose a fresh set (calendar may have changed).
  if (agenda.slotsExpirados(lead.slots_at, nowMs)) {
    const novo = await proporReuniao(lead, nowMs, text);
    return novo.ok ? { handled: true, mensagem: novo.mensagem } : { handled: false };
  }

  const escolha = escolherSlot(text, slots, nowMs);
  if (!escolha) return { handled: false }; // couldn't interpret → let the LLM clarify

  let chosen; // { iso, reps }
  if (escolha.tipo === 'slot') {
    chosen = escolha.slot;
  } else {
    // a NEW time the lead suggested → verify it's actually free now
    const token = await gcal.getGoogleAccessToken();
    if (!token) return { handled: false };
    let busyByRep = {};
    try {
      busyByRep = await gcal.freeBusyMulti(token, repEmails(), nowMs, Date.parse(escolha.iso) + 86400000);
    } catch (e) {
      logger.error('freeBusy (confirm) failed:', e.message);
      return { handled: false };
    }
    const aval = agenda.avaliarHorarioSugerido(escolha.iso, busyByRep, nowMs);
    if (!aval.ok) return { handled: true, mensagem: agenda.formatarHorarioIndisponivel(escolha.iso) };
    chosen = { iso: aval.iso, reps: aval.reps };
  }

  // Ask for the email ONCE before creating the event, so the calendar invite
  // lands in the prospect's inbox (no invite = more no-shows). The ask is
  // explicitly optional; a pending_slot_iso on the lead means we already asked
  // (this or a previous slot) — never ask twice, book with what we have.
  const emailFinal = emailNaMsg || lead.prospect_email || null;
  if (!emailFinal && !lead.pending_slot_iso) {
    await patchLead(lead.id, { pending_slot_iso: chosen.iso });
    return { handled: true, mensagem: agenda.formatarPedidoEmail(chosen.iso) };
  }

  return criarReuniao(lead, chosen, nowMs, emailFinal);
}

/**
 * Book the PENDING slot (the one we asked the email for). Called determinis-
 * tically on an email-only reply, and from the responder's `agendar` action
 * when the LLM re-confirms intent after the ask ("pode mandar por aqui").
 * @returns {Promise<{handled: boolean, mensagem?: string, patch?: object, booked?: boolean}>}
 */
async function confirmarPendente(lead, emailFinal, nowMs) {
  if (!bookingDisponivel()) return { handled: false };
  const pendente = lead.pending_slot_iso;
  if (!pendente || Date.parse(pendente) <= nowMs) return { handled: false };
  const slots = Array.isArray(lead.slots) ? lead.slots : [];
  const salvo = slots.find((s) => Date.parse(s.iso) === Date.parse(pendente));
  return criarReuniao(lead, salvo || { iso: pendente, reps: [] }, nowMs, emailFinal || lead.prospect_email || null);
}

// Create the Google Meet event + persist the booking. Tries the chosen rep's
// calendar, falls back to the owner calendar. Briefs the rep (the anti-leak guard
// inside sendBriefing skips a non-internal/self recipient).
async function criarReuniao(lead, chosen, nowMs, emailProspect = null) {
  const token = await gcal.getGoogleAccessToken();
  if (!token) return { handled: false };

  const email = emailProspect || lead.prospect_email || null;
  const reps = (chosen.reps && chosen.reps.length) ? chosen.reps : repEmails();
  const cargaReps = await gcal.contarReunioesFuturasPorRep(reps);
  const repEmail = agenda.escolherRepBalanceado(reps, cargaReps, lead.id) || reps[0];

  const requestId = `prospect-${lead.id}-${Date.parse(chosen.iso)}`; // deterministic = idempotent
  const body = agenda.montarEventoCalendar(leadParaEvento(lead), chosen.iso, requestId, {
    attendees: [repEmail],
    prospectEmail: email,
    repNome: repEmail,
  });

  let result = null;
  for (const cal of [repEmail, gcal.ownerCalendarId()]) {
    try { result = await gcal.insertEvent(token, cal, body); break; }
    catch (e) { logger.warn(`insert on ${cal} failed (${e.status || ''}): ${e.message}`); }
  }
  if (!result) {
    return {
      handled: true,
      mensagem: 'Tive um probleminha pra confirmar na agenda agora. Já te retorno com a confirmação!',
      patch: { prospect_state: 'handoff', handoff_motivo: 'falha ao criar evento no Google Calendar' },
    };
  }

  // Internal briefing (fire-and-forget; guard blocks a non-internal/self recipient).
  sendBriefing(
    leadParaEvento(lead),
    { slotIso: chosen.iso, meetLink: result.meetLink, repNome: repEmail, prospectEmail: email },
    repEmail,
  ).catch((e) => logger.warn('briefing send failed:', e.message));

  return {
    handled: true,
    booked: true,
    mensagem: agenda.formatarConfirmacao(chosen.iso, result.meetLink, agenda.AGENDA_PADRAO.offsetMin, email),
    patch: {
      prospect_state: 'agendado',
      reuniao_at: chosen.iso,
      reuniao_link: result.meetLink,
      calendar_event_id: result.eventId,
      assigned_rep_email: repEmail,
      pending_slot_iso: null,
      ...(email && email !== lead.prospect_email ? { prospect_email: email } : {}),
    },
  };
}

module.exports = {
  bookingDisponivel,
  repEmails,
  escolherSlot,
  proporReuniao,
  confirmarReuniao,
  confirmarPendente,
};
