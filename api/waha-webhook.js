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

  try {
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

    await processMessage(adapter, msg);
  } catch (err) {
    logger.error('WAHA webhook error:', err.message);
  }

  return res.status(200).json({ status: 'ok' });
};
