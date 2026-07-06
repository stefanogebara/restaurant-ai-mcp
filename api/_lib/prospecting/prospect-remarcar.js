'use strict';

/**
 * Remarcar / no-show orchestration (port of Olivia's olivia-remarcar +
 * olivia-noshow) — the meeting lifecycle AFTER a booking exists.
 *
 * Three motivos, all keeping the Google Calendar in FULL sync:
 *   'pedir'   — the team wants to reschedule → cancel the event, reopen the
 *               scheduling ('agendando'), Olímpia asks for a new time.
 *   'noshow'  — the lead didn't show → same reset, message is the gentle
 *               "não te encontrei na call, quer remarcar?". Stamps noshow_em.
 *   'definir' — the team sets a new time → MOVE the event (patchEventTime),
 *               Olímpia confirms exactly that time. State stays 'agendado'.
 *
 * The message goes out via respondToProspect mode 'remarcar' (no tools, 24h
 * window respected — outside it the send skips and coverage falls to the
 * template touches). sweepNoshows() piggybacks the prospect-flush cron:
 * meetings past reuniao_at + grace that are STILL 'agendado' are assumed
 * no-shows (accepted risk — we can't read Meet attendance; a call that DID
 * happen should have moved the lead out of 'agendado' in the console).
 */

const { createSecureLogger } = require('../secure-logger');
const { patchLead, selectNoshowDue, recordEvent } = require('./prospect-store');
const { respondToProspect } = require('./prospect-responder');
const { onlyDigits } = require('./phone');
const gcal = require('./prospect-gcal');
const agenda = require('./prospect-agenda');

const logger = createSecureLogger('ProspectRemarcar');

const NOSHOW_GRACE_MS = 2 * 3600 * 1000; // Olivia's 2h grace after the slot
const NOSHOW_MAX_POR_RUN = 5;            // bounded batch per flush tick

// Booking fields cleared when a meeting is cancelled/reopened ('pedir'/'noshow').
function patchReabrir(nowMs, motivo) {
  return {
    prospect_state: 'agendando',
    reuniao_at: null,
    reuniao_link: null,
    calendar_event_id: null,
    assigned_rep_email: null,
    slots: null,
    slots_at: null,
    pending_slot_iso: null,
    noshow_em: motivo === 'noshow' ? new Date(nowMs).toISOString() : null,
  };
}

/**
 * Reschedule / no-show / move one booked meeting. Calendar first, then the
 * lead patch, then the message — a message failure never leaves the calendar
 * out of sync (the state is already consistent by the time we speak).
 *
 * @param {object} lead - prospect_leads row
 * @param {{motivo: 'pedir'|'noshow'|'definir', novoSlotIso?: string|null, nowMs?: number}} args
 * @returns {Promise<{ok: boolean, motivo: string, mensagem?: object, error?: string}>}
 */
async function remarcarReuniao(lead, { motivo, novoSlotIso = null, nowMs = Date.now() }) {
  const token = await gcal.getGoogleAccessToken();
  const calIds = [lead.assigned_rep_email, gcal.ownerCalendarId()].filter(Boolean);
  const eventId = lead.calendar_event_id || null;

  if (motivo === 'definir') {
    const startMs = Date.parse(novoSlotIso || '');
    if (Number.isNaN(startMs)) return { ok: false, motivo, error: 'novo_slot_iso inválido' };
    const endIso = new Date(startMs + agenda.AGENDA_PADRAO.duracaoMin * 60000).toISOString();
    const patch = { reuniao_at: novoSlotIso, noshow_em: null };
    if (token && eventId) {
      const moved = await gcal.patchEventTime(token, eventId, calIds, novoSlotIso, endIso);
      if (!moved.ok) return { ok: false, motivo, error: `falha ao mover o evento no Calendar (${moved.status || '?'})` };
      if (moved.meetLink || moved.htmlLink) patch.reuniao_link = moved.meetLink || moved.htmlLink;
    }
    // Without token/event we at least keep the DB truthful (no event to move).
    await patchLead(lead.id, patch);
    const env = await respondToProspect({
      lead: { ...lead, ...patch },
      from: onlyDigits(lead.whatsapp_phone),
      text: '',
      nowMs,
      skipPacing: true,
      mode: 'remarcar',
      remarcarMotivo: 'definir',
      novoHorarioLabel: agenda.rotuloSlot(novoSlotIso),
    });
    return { ok: true, motivo, mensagem: env };
  }

  // 'pedir' | 'noshow' — cancel the event and REOPEN the scheduling.
  if (token && eventId) {
    try {
      await gcal.deleteEvent(token, eventId, calIds);
    } catch (err) {
      // Best-effort like Olivia: a Calendar hiccup must not strand the lead
      // in 'agendado' forever — the reset below is the source of truth.
      logger.warn(`deleteEvent failed lead=${lead.id} (continuing):`, err.message);
    }
  }
  const patch = patchReabrir(nowMs, motivo);
  await patchLead(lead.id, patch);
  const env = await respondToProspect({
    lead: { ...lead, ...patch },
    from: onlyDigits(lead.whatsapp_phone),
    text: '',
    nowMs,
    skipPacing: true,
    mode: 'remarcar',
    remarcarMotivo: motivo,
  });
  return { ok: true, motivo, mensagem: env };
}

/**
 * Automatic no-show sweep (piggybacks prospect-flush): meetings whose slot is
 * >2h past and still 'agendado' get cancelled + reopened + the gentle
 * "não te encontrei" message. One-shot per meeting (noshow_em + the state
 * reset both take it out of the selection); re-armed when a meeting is
 * (re)booked. The remarcar message itself respects DRY-RUN and the kill
 * switch inside the responder; the STATE mutation is guarded here.
 */
async function sweepNoshows({ limit = NOSHOW_MAX_POR_RUN, nowMs = Date.now() } = {}) {
  const { isCronEnabled } = require('../cron-config');
  if (!(await isCronEnabled('prospecting-agent'))) return { skipped: 'agent_disabled' };

  const cutoffIso = new Date(nowMs - NOSHOW_GRACE_MS).toISOString();
  const due = await selectNoshowDue(cutoffIso, limit);
  let processed = 0; let sent = 0; const errors = [];
  for (const lead of due) {
    try {
      const r = await remarcarReuniao(lead, { motivo: 'noshow', nowMs });
      processed++;
      if (r.mensagem && r.mensagem.sent) sent++;
      await recordEvent(lead.id, `👻 no-show automático — reunião de ${lead.reuniao_at} passou sem desfecho; agendamento reaberto`);
    } catch (err) {
      errors.push({ lead_id: lead.id, error: err.message });
      logger.error(`noshow sweep lead=${lead.id} failed:`, err.message);
    }
  }
  return { selected: due.length, processed, sent, errors: errors.length };
}

module.exports = {
  NOSHOW_GRACE_MS,
  patchReabrir,
  remarcarReuniao,
  sweepNoshows,
};
