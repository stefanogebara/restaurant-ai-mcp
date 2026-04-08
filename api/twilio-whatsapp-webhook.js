/**
 * Twilio WhatsApp Webhook Handler
 *
 * Thin handler that delegates to the channel adapter pattern.
 * Provider-specific logic (signature, TwiML) lives in TwilioAdapter.
 * Shared business logic (session, AI, history) lives in MessageProcessor.
 *
 * Webhook URL: https://seatable.one/api/twilio-whatsapp-webhook
 */

'use strict';

const { createSecureLogger } = require('./_lib/secure-logger');
const { rejectOversizedBody } = require('./_lib/rate-limit');
const { TwilioAdapter } = require('./_lib/channels/twilio-adapter');
const { processMessage } = require('./_lib/channels/message-processor');

const logger = createSecureLogger('Twilio');
const adapter = new TwilioAdapter();

module.exports = async (req, res) => {
  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'twilio-whatsapp-webhook' });
  }

  if (rejectOversizedBody(req, res)) return;

  if (req.method === 'POST') {
    // Verify Twilio signature
    if (!(await adapter.verifySignature(req))) {
      logger.error('Invalid Twilio webhook signature');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    try {
      // Parse the message
      const msg = await adapter.parseIncoming(req);
      if (!msg) {
        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send(adapter.emptyResponse);
      }

      // Process through unified pipeline
      const result = await processMessage(adapter, msg, { oppositeProvider: 'meta' });

      // Twilio expects TwiML response (sync, not async)
      if (result.response) {
        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send(adapter.formatTwimlResponse(result.response));
      }

      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(adapter.emptyResponse);

    } catch (error) {
      logger.error('Webhook error:', error.message);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(adapter.emptyResponse);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
