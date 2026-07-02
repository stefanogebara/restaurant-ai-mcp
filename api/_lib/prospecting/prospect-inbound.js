'use strict';

/**
 * Prospecting inbound handler.
 *
 * Cold-outreach replies arrive on the dedicated prospecting number and are
 * routed here by the webhook fork (see whatsapp-webhook.js) BEFORE the
 * restaurant pipeline, because a prospect has no restaurant_id and would
 * otherwise be dropped into a restaurant AI conversation / the restaurant picker.
 *
 * Parsing is prospecting-aware (prospect-parse.js), NOT the restaurant
 * adapter's parseIncoming: that path auto-replies to unreadable media from the
 * RESTAURANT number/persona and drops contact cards entirely. Here:
 *  - contact cards become '[Contato compartilhado: ...]' (owner-referral path),
 *  - audio is transcribed to '[áudio] <texto>' (prompt rule 6c) or stored with
 *    an empty body on failure (placeholder → rule 6b asks to resend),
 *  - nothing is ever auto-replied outside the responder (single send path).
 *
 * Flow: dedup → parse → store inbound → honor opt-out suppression → (if the
 * phone maps to a known lead) hand off to the responder. An inbound from an
 * unknown number is stored but not answered. Sends are DRY-RUN-default-on.
 */

const { createSecureLogger } = require('../secure-logger');
const { isMessageDuplicate } = require('../rate-limit');
const { isOptedOut, findLeadByPhone, storeMessage, patchLead } = require('./prospect-store');
const { respondToProspect } = require('./prospect-responder');
const { extractProspectCorpo } = require('./prospect-parse');
const { placeholderMidia } = require('./prospect-agent');

const logger = createSecureLogger('ProspectInbound');

/**
 * @param {import('../channels/channel-adapter').ChannelAdapter} adapter - kept in
 *   the signature for webhook-fork compatibility; no longer used for parsing.
 * @param {object} req - the raw webhook request (req.body already parsed)
 * @returns {Promise<{handled: boolean, reason?: string}>}
 */
async function handleProspectInbound(adapter, req) {
  const value = req.body?.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return { handled: false, reason: 'no_message' };

  const from = message.from;
  const messageId = message.id;
  const profileName = value.contacts?.[0]?.profile?.name || null;

  // Dedup FIRST — Meta retries webhooks; the same wamid must process once, and
  // must never pay for transcription twice. Shares the restaurant pipeline's
  // Redis dedup namespace/TTL (keyed by msg id).
  if (messageId && await isMessageDuplicate(messageId, 86400)) {
    logger.info(`[prospect] duplicate ${String(messageId).slice(-8)}, skipping`);
    return { handled: true, reason: 'duplicate' };
  }

  // Prospecting-aware parse (pure). Audio is transcribed here (I/O), stored as
  // '[áudio] <texto>' so the agent treats it as typed content (rule 6c); a
  // failed transcription keeps corpo null → placeholder safety net (rule 6b).
  let { tipo, corpo, mediaId } = extractProspectCorpo(message);
  if (tipo === 'audio' && mediaId) {
    try {
      const { transcribeVoiceMessage } = require('../whatsapp-interactions');
      const transcript = await transcribeVoiceMessage(mediaId);
      if (transcript && transcript.trim()) corpo = `[áudio] ${transcript.trim()}`;
    } catch (err) {
      logger.warn(`[prospect] audio transcription failed (placeholder path): ${err.message}`);
    }
  }

  const lead = await findLeadByPhone(from);
  const optedOut = await isOptedOut(from);

  // Always store the inbound, even from an unknown number / opted-out contact —
  // the message log is the audit trail. lead_id is null when we can't match yet.
  // corpo may be null (unreadable media): the placeholder net represents it.
  await storeMessage({
    leadId: lead?.id || null,
    direcao: 'in',
    wamid: messageId || null,
    tipo,
    corpo: corpo || null,
    raw: value || null,
  });

  logger.info(
    `[prospect] inbound stored from=${String(from).slice(0, 4)}**** ` +
    `lead=${lead?.id ? 'matched' : 'unknown'} optout=${optedOut} ` +
    `type=${tipo} corpo=${corpo ? 'yes' : 'empty'} name=${profileName ? 'yes' : 'no'}`
  );

  if (lead) {
    // last_in_at drives the 24h-window countdown, triage ordering and the
    // multi-touch halt (a lead that ever replied leaves the cold sequence);
    // an inbound also wakes a snoozed thread and cancels pending touches.
    await patchLead(lead.id, {
      last_in_at: new Date().toISOString(),
      snoozed_until: null,
      next_touch_at: null,
    });
  }

  // Suppressed (LGPD) — stored for the audit trail, but never answered.
  if (optedOut) {
    return { handled: true, reason: 'optout' };
  }

  // Unknown number — no lead context to converse from. Stored; a human can
  // triage. (Cold conversations always start from a lead we messaged in Phase 2.)
  if (!lead) {
    return { handled: true, reason: 'unknown_number' };
  }

  // Reply when there is readable text OR the media type has a placeholder (the
  // agent acknowledges it and asks to resend — rule 6b). Media without a
  // placeholder stays silent: safer than guessing.
  if ((!corpo || !String(corpo).trim()) && !placeholderMidia(tipo)) {
    return { handled: true, reason: 'no_text' };
  }

  const result = await respondToProspect({ lead, from, text: corpo || '' })
    .catch((err) => {
      logger.error('respondToProspect error:', err.message);
      return { action: 'error' };
    });
  return { handled: true, reason: `responded:${result.action}` };
}

module.exports = { handleProspectInbound };
