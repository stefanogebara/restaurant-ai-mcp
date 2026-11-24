/**
 * Twilio WhatsApp message sending utilities.
 * Extracted from twilio-whatsapp-webhook.js (M-23).
 */

const twilio = require('twilio');
const { createSecureLogger } = require('../secure-logger');
const logger = createSecureLogger('WhatsApp:Sender');

/**
 * Send a WhatsApp message via Twilio
 */
async function sendWhatsAppMessage(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !twilioWhatsAppNumber) {
    logger.error(' Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_NUMBER');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const client = twilio(accountSid, authToken);

    // Ensure WhatsApp prefix format
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const fromNumber = twilioWhatsAppNumber.startsWith('whatsapp:')
      ? twilioWhatsAppNumber
      : `whatsapp:${twilioWhatsAppNumber}`;

    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: toNumber
    });

    logger.info(` Message sent to ${to}: ${message.substring(0, 50)}...`);
    return { success: true, messageId: result.sid };
  } catch (error) {
    logger.error(' Send exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a WhatsApp template message via Twilio
 * Note: Twilio uses Content Templates for this
 */
async function sendTemplateMessage(to, contentSid, contentVariables = {}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !twilioWhatsAppNumber) {
    logger.error(' Missing Twilio configuration');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const client = twilio(accountSid, authToken);

    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const fromNumber = twilioWhatsAppNumber.startsWith('whatsapp:')
      ? twilioWhatsAppNumber
      : `whatsapp:${twilioWhatsAppNumber}`;

    const result = await client.messages.create({
      from: fromNumber,
      to: toNumber,
      contentSid: contentSid,
      contentVariables: JSON.stringify(contentVariables)
    });

    logger.info(` Template sent to ${to}: ${contentSid}`);
    return { success: true, messageId: result.sid };
  } catch (error) {
    logger.error(' Template send exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Escape XML special characters for TwiML responses
 */
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build a TwiML response string with a message
 */
function buildTwimlResponse(message) {
  const escaped = escapeXml(message);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

/**
 * Empty TwiML response (acknowledge without replying)
 */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

module.exports = {
  sendWhatsAppMessage,
  sendTemplateMessage,
  escapeXml,
  buildTwimlResponse,
  EMPTY_TWIML,
};
