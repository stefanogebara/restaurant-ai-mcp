'use strict';

/**
 * WAHA WhatsApp Webhook
 *
 * Receives events from the self-hosted WAHA instance on Fly.io.
 * Delegates to WAHAAdapter (signature, parsing) + MessageProcessor (AI pipeline).
 *
 * Webhook URL: https://seatable.one/api/waha-webhook
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { setWebhookCors } = require('./_lib/cors');
const { WAHAAdapter } = require('./_lib/channels/waha-adapter');
const { processMessage } = require('./_lib/channels/message-processor');
const { logWahaEvent } = require('./_lib/waha-metrics');

const logger = createSecureLogger('WAHAWebhook');
const adapter = new WAHAAdapter();

module.exports = async (req, res) => {
  setWebhookCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Skip non-message events quickly
  if (req.body?.event !== 'message') {
    return res.status(200).json({ status: 'ok' });
  }

  // X-Test-Mode: true — runs full AI pipeline but suppresses real WhatsApp sends.
  // Use for curl/E2E tests to avoid messaging real users.
  const testMode = req.headers['x-test-mode'] === 'true';
  const requestAdapter = testMode ? new WAHAAdapter({ testMode: true }) : adapter;
  if (testMode) logger.info('[TEST MODE] Processing without sending real WhatsApp messages');

  const sigValid = await requestAdapter.verifySignature(req);
  if (!sigValid) {
    logger.error('Invalid WAHA webhook signature');
    logWahaEvent('sig_invalid').catch(() => {});
    return res.status(200).json({ status: 'ok' });
  }

  const msg = await requestAdapter.parseIncoming(req);
  if (!msg) {
    return res.status(200).json({ status: 'ok' });
  }

  logWahaEvent('received', { messageId: msg.messageId, phone: msg.from }).catch(() => {});

  // Run the full pipeline BEFORE sending 200 so Vercel keeps the Lambda alive.
  // Vercel terminates background work shortly after the response is sent, so any
  // DB writes (session, restaurant_id, conversation_history) must complete first.
  // WAHA will wait up to maxDuration:120s — acceptable since Redis dedup prevents
  // double-processing on WAHA retries.
  const start = Date.now();
  let outcome = 'processed';
  let errorMsg = null;
  let restaurantId = null;
  try {
    const result = await processMessage(requestAdapter, msg);
    restaurantId = result?.restaurantId || null;
  } catch (err) {
    outcome = 'failed';
    errorMsg = err.message;
    logger.error('WAHA processMessage error:', err.message);
  }

  logWahaEvent(outcome, {
    messageId: msg.messageId,
    phone: msg.from,
    restaurantId,
    durationMs: Date.now() - start,
    error: errorMsg,
  }).catch(() => {});

  res.status(200).json({ status: 'ok' });
};
