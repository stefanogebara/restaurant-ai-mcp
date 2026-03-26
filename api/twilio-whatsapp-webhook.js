// Twilio WhatsApp webhook (fallback integration)
// Webhook URL: https://seatable.one/api/twilio-whatsapp-webhook

/**
 * Twilio WhatsApp Webhook Handler
 *
 * Handles WhatsApp messages via Twilio's Messaging API.
 * This is an alternative to the direct Meta WhatsApp Cloud API.
 *
 * Webhook URL: https://seatable.one/api/twilio-whatsapp-webhook
 *
 * Required environment variables:
 * - TWILIO_ACCOUNT_SID: Twilio Account SID
 * - TWILIO_AUTH_TOKEN: Twilio Auth Token
 * - TWILIO_WHATSAPP_NUMBER: Your Twilio WhatsApp number (e.g., +14155238886)
 * - OPENROUTER_API_KEY or ANTHROPIC_API_KEY: AI API key (via centralized ai-client)
 *
 * Twilio Console Setup:
 * 1. Go to Messaging > Senders > WhatsApp Senders
 * 2. Register your WhatsApp Business number
 * 3. Set webhook URL to this endpoint
 *
 * M-23: This file was split into modules under api/_lib/whatsapp/:
 * - date-time-utils.js — date/time parsing and formatting
 * - message-sender.js — Twilio message sending + TwiML helpers
 * - reservation-lookup.js — reservation search + session context
 * - tool-handler.js — Claude tool call processing
 * - conversation-handler.js — system prompt, history, Claude orchestration
 * - quick-actions.js — keyword handlers (MODIFY, CANCEL, BOOK, HELP)
 */

const twilio = require('twilio');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('Twilio');
const { isMessageDuplicate, rejectOversizedBody } = require('./_lib/rate-limit');
const { getOrCreateSession } = require('./_lib/whatsapp-sessions');

// Extracted modules
const { sendWhatsAppMessage, buildTwimlResponse, EMPTY_TWIML } = require('./_lib/whatsapp/message-sender');
const { processWithClaude } = require('./_lib/whatsapp/conversation-handler');
const { handleQuickAction } = require('./_lib/whatsapp/quick-actions');

// Message deduplication is handled via Redis (shared across Vercel instances).
// Falls back to allowing the message when Redis is unavailable.
// See api/_lib/rate-limit.js -> isMessageDuplicate()

// Per-phone rate limiting (10 messages per minute)
const phoneRateLimits = new Map();
function isRateLimited(phone) {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  let timestamps = phoneRateLimits.get(phone) || [];
  timestamps = timestamps.filter(ts => ts > oneMinuteAgo);
  if (timestamps.length >= 10) return true;
  timestamps.push(now);
  phoneRateLimits.set(phone, timestamps);
  return false;
}
// Clean up rate limit entries every 5 minutes
setInterval(() => {
  const oneMinuteAgo = Date.now() - 60 * 1000;
  for (const [phone, timestamps] of phoneRateLimits) {
    const active = timestamps.filter(ts => ts > oneMinuteAgo);
    if (active.length === 0) phoneRateLimits.delete(phone);
    else phoneRateLimits.set(phone, active);
  }
}, 5 * 60 * 1000);

/**
 * Parse URL-encoded body manually if needed
 */
function parseUrlEncodedBody(body) {
  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    const result = {};
    for (const [key, value] of params) {
      result[key] = value;
    }
    return result;
  }
  return body || {};
}

/**
 * Verify Twilio webhook signature
 */
function verifyTwilioSignature(req) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    logger.error('TWILIO_AUTH_TOKEN not set — rejecting unsigned webhook');
    return false;
  }

  const signature = req.headers['x-twilio-signature'];
  if (!signature) {
    logger.error('Missing x-twilio-signature header');
    return false;
  }

  const url = `https://${req.headers.host}${req.url}`;
  return twilio.validateRequest(authToken, signature, url, req.body || {});
}

/**
 * Main webhook handler for Twilio WhatsApp messages
 */
module.exports = async (req, res) => {
  // Health check endpoint
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'twilio-whatsapp-webhook',
      timestamp: new Date().toISOString()
    });
  }

  // Reject oversized payloads (> 1 MB)
  if (rejectOversizedBody(req, res)) return;

  // Handle incoming messages (POST)
  if (req.method === 'POST') {
    // Verify Twilio signature
    if (!verifyTwilioSignature(req)) {
      logger.error('Invalid Twilio webhook signature - rejecting request');
      return res.status(403).json({ error: 'Invalid signature' });
    }

    try {
      // Log raw body type for debugging
      logger.info(' Body type:', typeof req.body);
      logger.info(' Raw body:', req.body);

      // Twilio sends form-urlencoded data - parse it if necessary
      let parsedBody = req.body;
      if (typeof req.body === 'string') {
        logger.info(' Parsing string body as URL-encoded');
        parsedBody = parseUrlEncodedBody(req.body);
      } else if (!req.body || Object.keys(req.body).length === 0) {
        logger.info(' Empty body, checking raw request');
        parsedBody = {};
      }

      logger.info(' Parsed body:', JSON.stringify(parsedBody, null, 2));

      // Twilio sends form-urlencoded data
      const {
        From,         // Sender's WhatsApp number (format: whatsapp:+1234567890)
        To,           // Your WhatsApp number
        Body,         // Message text
        MessageSid,   // Unique message ID
        NumMedia,     // Number of media attachments
        ProfileName,  // Sender's WhatsApp profile name
      } = parsedBody;

      // Validate required fields
      if (!From || !Body) {
        logger.info(' Missing required fields');
        return res.status(200).send(EMPTY_TWIML);
      }

      // Deduplicate: Twilio retries on timeout, ignore messages we've already seen
      if (MessageSid && await isMessageDuplicate(MessageSid)) {
        logger.info(` Duplicate message ${MessageSid}, skipping`);
        return res.status(200).send(EMPTY_TWIML);
      }

      // Extract phone number (remove 'whatsapp:' prefix)
      const fromNumber = From.replace('whatsapp:', '');
      const messageText = Body.trim();

      logger.info(` Message from ${fromNumber} (${ProfileName}): ${messageText}`);

      // Rate limit: max 10 messages per minute per phone
      if (isRateLimited(fromNumber)) {
        logger.info(` Rate limited ${fromNumber}`);
        return res.status(200).send(EMPTY_TWIML);
      }

      // Handle media messages (not supported yet)
      if (NumMedia && parseInt(NumMedia) > 0) {
        await sendWhatsAppMessage(fromNumber, 'I can only process text messages at the moment. Please type your request.');
        return res.status(200).send(EMPTY_TWIML);
      }

      // Get or create session for this phone number
      const session = await getOrCreateSession(fromNumber, `twilio-${Date.now()}`);

      if (!session) {
        logger.error(' Failed to create session');
        await sendWhatsAppMessage(fromNumber, 'Sorry, I had trouble starting our conversation. Please try again.');
        return res.status(200).send(EMPTY_TWIML);
      }

      // Handle quick action keywords (MODIFY, CANCEL, BOOK, HELP, YES/NO)
      const messageTextLower = messageText.toLowerCase().trim();
      const quickActionResponse = await handleQuickAction(messageTextLower, fromNumber, session);
      if (quickActionResponse) {
        res.setHeader('Content-Type', 'text/xml');
        return res.status(200).send(quickActionResponse);
      }

      // Process message with Claude
      logger.info(` Processing message with Claude for session: ${session.id}`);
      let response;
      try {
        response = await processWithClaude(messageText, session);
        logger.info(` Claude response received: ${response?.substring(0, 100)}...`);
      } catch (claudeError) {
        logger.error(' Claude processing error:', claudeError);
        response = 'Sorry, I had trouble processing your message. Please try again.';
      }

      // Send response back via TwiML (more reliable for Sandbox)
      logger.info(` Sending TwiML response to ${fromNumber}: ${response.substring(0, 100)}...`);
      const twimlResponse = buildTwimlResponse(response);
      res.setHeader('Content-Type', 'text/xml');
      return res.status(200).send(twimlResponse);

    } catch (error) {
      logger.error(' Webhook error:', error);
      return res.status(200).send(EMPTY_TWIML);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
