/**
 * Meta WhatsApp Cloud API Webhook
 *
 * Thin handler that delegates to the channel adapter pattern.
 * Provider-specific logic (signature, parsing, media) lives in MetaAdapter.
 * Shared business logic (session, AI, history) lives in MessageProcessor.
 *
 * Processing order: processMessage MUST complete before res.json() is sent.
 * Vercel terminates functions immediately after the response is sent — any
 * async work scheduled after res.json() is killed before it runs.
 * Meta retries if no 200 within 5s, but Redis dedup (24h TTL) prevents
 * double-processing on retries.
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

    // Await processMessage fully before sending the response.
    // Vercel terminates functions immediately after res.json() — any awaits
    // scheduled after the response are killed before they run. processMessage
    // must finish first so conversation history is saved.
    // Meta retries if no 200 within 5s; Redis dedup (24h) prevents double-processing.
    await processMessage(adapter, msg, { oppositeProvider: 'twilio' })
      .catch(err => logger.error('processMessage error:', err.message));

    if (!res.headersSent) {
      res.status(200).json({ status: 'ok' });
    }

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
