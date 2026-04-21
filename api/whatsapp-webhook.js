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
  // Verify signature — 200 was already sent, so we can only log (not reject with 403)
  const sigValid = await adapter.verifySignature(req);
  if (!sigValid) {
    logger.error('Invalid Meta webhook signature — dropping request');
    return; // 200 already sent; attacker gets no useful error info
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
        return; // status-only event, nothing more to do
      }
    }

    // Check if we should handle this message (TwinMe forwarding, etc.)
    const routing = await adapter.shouldHandle(req);
    if (!routing.handle) {
      return; // forwarded or irrelevant
    }

    // Parse the message
    const msg = await adapter.parseIncoming(req);
    if (!msg) {
      return; // no actionable message
    }

    await processMessage(adapter, msg, { oppositeProvider: 'twilio' })
      .catch(err => logger.error('processMessage error:', err.message));

  } catch (error) {
    logger.error('Webhook error:', error.message);
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

  if (req.method === 'GET') {
    // Capture body for GET (verification doesn't need raw body, but keep consistent)
    return handleVerification(req, res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Capture raw body FIRST — body stream must be read before sending the response.
  // On Vercel, the request stream may become unavailable after res.json() is called,
  // causing signature verification to silently fail (no raw bytes for HMAC).
  // Body read is near-instant (<5ms) so this does NOT delay the 200 OK enough for
  // Meta to retry (Meta's timeout is 20s).
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

  if (rejectOversizedBody(req, res)) return;

  // Process SYNCHRONOUSLY: await the full pipeline BEFORE sending 200. Evidence
  // from live testing showed Vercel killing the Lambda mid-INSERT even though
  // maxDuration was 120s — the Supabase fetch would abort silently, session
  // creation would fail without producing [SESSION_FAIL] logs, and the bot
  // would generate a response from a cached zombie session while the new DB
  // row never landed.
  //
  // Waiting for handlePost here keeps the Lambda alive for its full processing.
  // Meta's 20s webhook-timeout retry budget is handled by Redis dedup
  // (86400s TTL) in processMessage — retries of the same messageId no-op.
  try {
    await handlePost(req, res);
  } catch (err) {
    logger.error('Webhook post handler error:', err.message);
  }

  if (!res.headersSent) {
    res.status(200).json({ status: 'ok' });
  }
};

module.exports.config = { api: { bodyParser: false } };
