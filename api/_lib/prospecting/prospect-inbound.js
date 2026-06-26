'use strict';

/**
 * Prospecting inbound handler (Phase 0 — STUB).
 *
 * Cold-outreach replies arrive on the dedicated prospecting number and are
 * routed here by the webhook fork (see whatsapp-webhook.js) BEFORE the
 * restaurant pipeline, because a prospect has no restaurant_id and would
 * otherwise be dropped into a restaurant AI conversation / the restaurant picker.
 *
 * Phase 0 is intentionally HEADLESS: it dedups, honors opt-out, matches the
 * lead, and stores the inbound message — but it does NOT generate a reply. The
 * AI brain (prospect-agent.js + prospect-responder.js) lands in Phase 1, at
 * which point this handler hands off to the responder instead of just logging.
 */

const { createSecureLogger } = require('../secure-logger');
const { isMessageDuplicate } = require('../rate-limit');
const { isOptedOut, findLeadByPhone, storeMessage } = require('./prospect-store');

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
    `type=${messageType} name=${profileName ? 'yes' : 'no'} ` +
    `(Phase 0 stub — no reply generated)`
  );

  // Phase 1 hook: when the brain exists, opted-out → stop here; otherwise
  // hand off to the responder:
  //   if (optedOut) return { handled: true, reason: 'optout' };
  //   await respondToProspect({ lead, from, text, messageId });
  return { handled: true, reason: 'stored_stub' };
}

module.exports = { handleProspectInbound };
