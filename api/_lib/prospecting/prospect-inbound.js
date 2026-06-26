'use strict';

/**
 * Prospecting inbound handler.
 *
 * Cold-outreach replies arrive on the dedicated prospecting number and are
 * routed here by the webhook fork (see whatsapp-webhook.js) BEFORE the
 * restaurant pipeline, because a prospect has no restaurant_id and would
 * otherwise be dropped into a restaurant AI conversation / the restaurant picker.
 *
 * Flow: dedup → store inbound → honor opt-out suppression → (if the phone maps to
 * a known lead) hand off to the responder, which runs the deterministic
 * guardrails + LLM and replies. An inbound from an unknown number is stored but
 * not answered (we have no lead context / persona to converse from). Sends are
 * DRY-RUN-default-on (see prospect-responder.js).
 */

const { createSecureLogger } = require('../secure-logger');
const { isMessageDuplicate } = require('../rate-limit');
const { isOptedOut, findLeadByPhone, storeMessage } = require('./prospect-store');
const { respondToProspect } = require('./prospect-responder');

const logger = createSecureLogger('ProspectInbound');

/**
 * @param {import('../channels/channel-adapter').ChannelAdapter} adapter - reused
 *   only for provider-agnostic parsing (parseIncoming). No restaurant context.
 * @param {object} req - the raw webhook request (req.body already parsed)
 * @returns {Promise<{handled: boolean, reason?: string}>}
 */
async function handleProspectInbound(adapter, req) {
  let msg;
  try {
    msg = await adapter.parseIncoming(req);
  } catch (err) {
    logger.error('parseIncoming failed:', err.message);
    return { handled: false, reason: 'parse_error' };
  }
  if (!msg) {
    return { handled: false, reason: 'no_message' };
  }

  const { from, messageId, text, messageType, profileName } = msg;

  // Dedup — Meta retries webhooks; the same wamid must process once. Shares the
  // same Redis dedup namespace/TTL as the restaurant pipeline (keyed by msg id).
  if (messageId && await isMessageDuplicate(messageId, 86400)) {
    logger.info(`[prospect] duplicate ${String(messageId).slice(-8)}, skipping`);
    return { handled: true, reason: 'duplicate' };
  }

  // Mark as read (fire-and-forget) so the prospect sees the blue ticks.
  adapter.markAsRead(messageId).catch(() => {});

  const lead = await findLeadByPhone(from);
  const optedOut = await isOptedOut(from);

  // Always store the inbound, even from an unknown number / opted-out contact —
  // the message log is the audit trail. lead_id is null when we can't match yet.
  await storeMessage({
    leadId: lead?.id || null,
    direcao: 'in',
    wamid: messageId || null,
    tipo: messageType || 'text',
    corpo: text || null,
    raw: req.body?.entry?.[0]?.changes?.[0]?.value || null,
  });

  logger.info(
    `[prospect] inbound stored from=${String(from).slice(0, 4)}**** ` +
    `lead=${lead?.id ? 'matched' : 'unknown'} optout=${optedOut} ` +
    `type=${messageType} name=${profileName ? 'yes' : 'no'}`
  );

  // Suppressed (LGPD) — stored for the audit trail, but never answered.
  if (optedOut) {
    return { handled: true, reason: 'optout' };
  }

  // Unknown number — no lead context to converse from. Stored; a human can
  // triage. (Cold conversations always start from a lead we messaged in Phase 2.)
  if (!lead) {
    return { handled: true, reason: 'unknown_number' };
  }

  // Only text-bearing messages get a reply; pure media/status already handled by
  // parseIncoming (which transcribes audio / returns null for unsupported types).
  if (!text || !String(text).trim()) {
    return { handled: true, reason: 'no_text' };
  }

  const result = await respondToProspect({ lead, from, text })
    .catch((err) => {
      logger.error('respondToProspect error:', err.message);
      return { action: 'error' };
    });
  return { handled: true, reason: `responded:${result.action}` };
}

module.exports = { handleProspectInbound };
