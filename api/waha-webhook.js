/**
 * WAHA WhatsApp Webhook Handler
 *
 * Receives messages from a self-hosted WAHA instance.
 * No Meta verification needed — WAHA connects directly to WhatsApp.
 *
 * Webhook URL: https://seatable.one/api/waha-webhook
 *
 * Setup:
 * 1. Deploy WAHA on Railway/VPS
 * 2. Set WAHA_URL, WAHA_API_KEY env vars
 * 3. Create WAHA session with webhook pointing here
 */

'use strict';

const { createSecureLogger } = require('./_lib/secure-logger');
const { rejectOversizedBody } = require('./_lib/rate-limit');
const { setWebhookCors } = require('./_lib/cors');
const { WAHAAdapter } = require('./_lib/channels/waha-adapter');
const { processMessage } = require('./_lib/channels/message-processor');

const logger = createSecureLogger('WAHAWebhook');
const adapter = new WAHAAdapter();

module.exports = async (req, res) => {
  setWebhookCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Health check
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'waha-webhook',
      waha_url: process.env.WAHA_URL ? 'configured' : 'missing',
    });
  }

  if (rejectOversizedBody(req, res)) return;

  if (req.method === 'POST') {
    // Verify signature (HMAC or API key)
    if (!(await adapter.verifySignature(req))) {
      logger.error('WAHA webhook signature verification failed');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    try {
      const { event } = req.body || {};

      // Session status events (connected/disconnected)
      if (event === 'session.status') {
        logger.info('WAHA session status:', req.body.payload?.status);
        return res.status(200).json({ status: 'ok' });
      }

      // Message acknowledgment events
      if (event === 'message.ack') {
        return res.status(200).json({ status: 'ok' });
      }

      // Parse the message
      const msg = await adapter.parseIncoming(req);
      if (!msg) {
        return res.status(200).json({ status: 'ok' });
      }

      // Return 200 immediately — process in background (async)
      res.status(200).json({ status: 'ok' });

      // Send typing indicator
      adapter.startTyping(msg.from).catch(() => {});

      // Process through unified pipeline
      await processMessage(adapter, msg);

      // Stop typing
      adapter.stopTyping(msg.from).catch(() => {});

    } catch (error) {
      logger.error('WAHA webhook error:', error.message);
      if (!res.headersSent) {
        return res.status(200).json({ status: 'error' });
      }
    }
  }

  if (!res.headersSent) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
};
