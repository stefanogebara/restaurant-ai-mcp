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

  const sigValid = await adapter.verifySignature(req);
  if (!sigValid) {
    logger.error('Invalid WAHA webhook signature');
    return res.status(200).json({ status: 'ok' });
  }

  const msg = await adapter.parseIncoming(req);
  if (!msg) {
    return res.status(200).json({ status: 'ok' });
  }

  // Run the full pipeline BEFORE sending 200 so Vercel keeps the Lambda alive.
  // Vercel terminates background work shortly after the response is sent, so any
  // DB writes (session, restaurant_id, conversation_history) must complete first.
  // WAHA will wait up to maxDuration:120s — acceptable since Redis dedup prevents
  // double-processing on WAHA retries.
  await processMessage(adapter, msg)
    .catch(err => logger.error('WAHA processMessage error:', err.message));

  res.status(200).json({ status: 'ok' });
};
