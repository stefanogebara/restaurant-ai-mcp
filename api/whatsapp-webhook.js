/**
 * Meta WhatsApp Cloud API Webhook
 *
 * Thin handler that delegates to the channel adapter pattern.
 * Provider-specific logic (signature, parsing, media) lives in MetaAdapter.
 * Shared business logic (session, AI, history) lives in MessageProcessor.
 *
 * Processing order: processMessage runs BEFORE the 200 response is sent.
 * Vercel kills functions after res.json(), so post-response async work is unreliable.
 * We race processMessage against a 4.5s deadline, then reply to Meta.
 *
 * Webhook URL: https://seatable.one/api/whatsapp-webhook
 */

'use strict';

const { createSecureLogger } = require('./_lib/secure-logger');
const { rejectOversizedBody } = require('./_lib/rate-limit');
const { setWebhookCors } = require('./_lib/cors');
const { updateDeliveryStatus } = require('./services/campaignService');
const { updateWhatsAppTestMessageStatus } = require('./services/whatsappTestMessageService');
const { MetaAdapter } = require('./_lib/channels/meta-adapter');
const { processMessage } = require('./_lib/channels/message-processor');

const logger = createSecureLogger('WhatsApp');
const adapter = new MetaAdapter();

/**
 * Handle webhook verification (GET)
 */
function handleVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === expectedToken) {
    logger.info('Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.error('Verification failed');
  return res.status(403).json({ error: 'Verification failed' });
}

/**
 * Handle incoming POST webhook (messages + status updates)
 */
async function handlePost(req, res) {
  // Verify signature
  const sigValid = await adapter.verifySignature(req);
  if (!sigValid) {
    logger.error('Invalid Meta webhook signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  try {
    // Process delivery status updates
    const value = req.body.entry?.[0]?.changes?.[0]?.value;
    if (value?.statuses) {
      for (const statusUpdate of value.statuses) {
        if (statusUpdate.id && ['sent', 'delivered', 'read', 'failed'].includes(statusUpdate.status)) {
          updateDeliveryStatus(statusUpdate.id, statusUpdate.status)
            .catch(err => logger.error('Campaign delivery status update failed:', err.message));
          updateWhatsAppTestMessageStatus(statusUpdate.id, statusUpdate)
            .catch(err => logger.error('WhatsApp test status update failed:', err.message));
        }
      }
      if (!value.messages) {
        return res.status(200).json({ status: 'ok' });
      }
    }

    // Check if we should handle this message (TwinMe forwarding, etc.)
    const routing = await adapter.shouldHandle(req);
    if (!routing.handle) {
      return res.status(200).json({ status: 'ok', handler: routing.reason });
    }

    // Parse the message
    const msg = await adapter.parseIncoming(req);
    if (!msg) {
      return res.status(200).json({ status: 'ok' });
    }

    // Process message BEFORE responding to Meta.
    // Vercel terminates functions after res.json() is sent, so async work after the
    // response is unreliable. We must complete processMessage first, then reply.
    // Meta retries after 5s of no response — we race against a 4.5s deadline so
    // we always reply to Meta in time even if processing is slow.
    const processDone = processMessage(adapter, msg, { oppositeProvider: 'twilio' })
      .catch(err => logger.error('processMessage error:', err.message));

    await Promise.race([
      processDone,
      new Promise(resolve => setTimeout(resolve, 4500)),
    ]);

    // Send 200 to Meta (prevents retry storm)
    if (!res.headersSent) {
      res.status(200).json({ status: 'ok' });
    }

    // If processMessage didn't finish in 4.5s, wait for it now so the handler
    // doesn't return (and Vercel doesn't kill the function) until it's done.
    await processDone;

  } catch (error) {
    logger.error('Webhook error:', error.message);
    if (!res.headersSent) {
      return res.status(200).json({ status: 'error' });
    }
  }
}

/**
 * Main webhook handler
 */
module.exports = async (req, res) => {
  setWebhookCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Capture raw body for HMAC signature verification.
  // Vercel auto-parses JSON but we need the raw bytes for HMAC.
  if (req.method === 'POST') {
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });
    const streamBuf = Buffer.concat(chunks);
    if (streamBuf.length > 0) {
      req._rawBody = streamBuf.toString('utf8');
      if (!req.body) {
        try { req.body = JSON.parse(req._rawBody); } catch { req.body = {}; }
      }
    }
  }

  if (rejectOversizedBody(req, res)) return;

  if (req.method === 'GET') return handleVerification(req, res);
  if (req.method === 'POST') return handlePost(req, res);

  return res.status(405).json({ error: 'Method not allowed' });
};

module.exports.config = { api: { bodyParser: false } };
