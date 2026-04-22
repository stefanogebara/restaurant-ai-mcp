/**
 * WhatsApp Sender Library
 *
 * Shared WhatsApp messaging functions extracted from whatsapp-webhook.js.
 * Provides sendWhatsAppMessage, sendTemplateMessage, isWhatsAppConfigured,
 * and sendReservationConfirmation for use across the codebase.
 *
 * Usage:
 *   const { sendReservationConfirmation, isWhatsAppConfigured } = require('./whatsapp-sender');
 */

const { getTemplate } = require('./whatsapp-templates');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('WhatsAppSender');

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

/**
 * Check if WhatsApp sending is configured (env vars present).
 * @returns {boolean}
 */
function isWhatsAppConfigured() {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

/**
 * Look up the whatsapp_provider for a restaurant from restaurant_config.
 * Returns 'meta' (default) or 'twilio'.
 *
 * @param {string} restaurantId - UUID of the restaurant
 * @returns {Promise<string>} 'meta' | 'twilio'
 */
async function getWhatsAppProvider(restaurantId) {
  if (!restaurantId) return 'meta';

  try {
    const { supabaseAdmin } = require('./supabase');
    const { data } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('whatsapp_provider')
      .eq('id', restaurantId)
      .maybeSingle();

    return data?.whatsapp_provider || 'meta';
  } catch (err) {
    logger.error('getWhatsAppProvider lookup failed, defaulting to meta:', err.message);
    return 'meta';
  }
}

/**
 * Send a WhatsApp text message via Meta Cloud API.
 * @private
 */
async function sendViaMeta(to, message) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  // DIAG: record every sendViaMeta call to whatsapp_message_dedup table
  // (reuse the table, prefix the message_id with 'OUT-' so it doesn't collide
  // with real inbound wamids). This lets us count outbound-sends-per-phone
  // in the last N minutes and confirm whether the same Lambda is making
  // two distinct text sends for one user message.
  try {
    const stack = new Error().stack.split('\n').slice(2, 6).map(l => l.trim()).join(' | ');
    logger.error(`[SEND_META] to=${to} preview="${String(message).slice(0, 80).replace(/\n/g, ' ')}" callers=${stack}`);
    const { centralSupabase } = require('./central-supabase');
    if (centralSupabase) {
      const outId = `OUT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      centralSupabase
        .from('whatsapp_message_dedup')
        .insert({ message_id: `${outId}|${to}|${String(message).slice(0, 80).replace(/\n/g, ' ')}` })
        .then(() => {})
        .catch(() => {});
    }
  } catch (_) { /* noop */ }

  if (!phoneNumberId || !accessToken) {
    logger.error('Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { success: false, error: 'WhatsApp not configured' };
  }

  // NOTE: NO RETRY. Meta's /messages endpoint is NOT idempotent without a
  // client-side biz_opaque_callback_data key. A fetch-level retry (network
  // hiccup after Meta already accepted the send) produces two visible
  // deliveries to the user. Observed in production 2026-04-22: every reply
  // was sent twice (generic + proper) because a withRetry wrap re-fired
  // sends. Meta's own webhook retry + our dedup table handle the inverse
  // case (incoming message delivered twice).
  try {
    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: message }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('WhatsApp send error:', { status: response.status, data: JSON.stringify(data) });
      return { success: false, error: data.error?.message || 'Failed to send' };
    }

    logger.info(`WhatsApp message sent to ${to}, msgId=${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    logger.error('WhatsApp send exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a WhatsApp text message via Twilio.
 * @private
 */
async function sendViaTwilio(to, message) {
  try {
    const twilio = require('twilio');
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!accountSid || !authToken || !twilioWhatsAppNumber) {
      logger.error('Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_WHATSAPP_NUMBER');
      return { success: false, error: 'Twilio not configured' };
    }

    const client = twilio(accountSid, authToken);
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const fromNumber = twilioWhatsAppNumber.startsWith('whatsapp:')
      ? twilioWhatsAppNumber
      : `whatsapp:${twilioWhatsAppNumber}`;

    // NO retry — Twilio's messages.create is not idempotent without an
    // Idempotency-Key header. Retry on a network glitch after Twilio
    // already queued the send produces a duplicate delivery. Same rationale
    // as sendViaMeta above.
    const result = await client.messages.create({
      body: message,
      from: fromNumber,
      to: toNumber
    });

    logger.info(`Twilio WhatsApp message sent to ${to}, sid=${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error) {
    logger.error('Twilio WhatsApp send exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a WhatsApp text message, routing to the correct provider.
 *
 * @param {string} to - Recipient phone number (e.g. +5511999999999)
 * @param {string} message - Message body text
 * @param {object} [options] - Optional configuration
 * @param {string} [options.provider] - Force a specific provider ('meta' | 'twilio')
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
async function sendWhatsAppMessage(to, message, options = {}) {
  const provider = options.provider || 'meta';

  if (provider === 'twilio') {
    return sendViaTwilio(to, message);
  }
  return sendViaMeta(to, message);
}

/**
 * Send a WhatsApp template message via Meta Cloud API.
 * Used for business-initiated messages (outside 24-hour window).
 *
 * @param {string} to - Recipient phone number
 * @param {string} templateName - Name of approved template (e.g. 'reservation_confirmed')
 * @param {string} languageCode - Template language ('en', 'es', 'pt')
 * @param {string[]} bodyParameters - Array of strings for {{1}}, {{2}}, etc. placeholders
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
async function sendTemplateMessage(to, templateName, languageCode = 'en', bodyParameters = []) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error('Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    const components = [];
    if (bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParameters.map(param => ({
          type: 'text',
          text: String(param)
        }))
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components
      }
    };

    logger.info(`Sending template '${templateName}' to ${to}`);

    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('Template send error:', data);
      return { success: false, error: data.error?.message || 'Failed to send template' };
    }

    logger.info(`Template '${templateName}' sent to ${to}, messageId: ${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    logger.error('Template send exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a reservation confirmation via WhatsApp using the local template system.
 *
 * @param {string} customerPhone - Customer phone number
 * @param {object} details - Reservation details
 * @param {string} details.reservationId
 * @param {string} details.customerName
 * @param {number} details.partySize
 * @param {string} details.date
 * @param {string} details.time
 * @param {string} details.restaurantName
 * @param {string} [details.language='en'] - Language code
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
async function sendReservationConfirmation(customerPhone, details) {
  const { reservationId, customerName, partySize, date, time, restaurantName, language = 'en' } = details;

  if (!isWhatsAppConfigured()) {
    return { success: false, error: 'WhatsApp not configured' };
  }

  const message = getTemplate('reservation_confirmed', language, {
    name: customerName,
    restaurant: restaurantName,
    date,
    time,
    partySize,
    reservationId
  });

  if (!message) {
    return { success: false, error: 'Failed to render template' };
  }

  return sendWhatsAppMessage(customerPhone, message);
}

/**
 * Send a new booking alert to the restaurant owner via WhatsApp.
 *
 * @param {string} ownerPhone - Restaurant owner's phone number
 * @param {object} details - Booking details
 * @param {string} details.reservationId
 * @param {string} details.customerName
 * @param {string} details.customerPhone
 * @param {number} details.partySize
 * @param {string} details.date
 * @param {string} details.time
 * @param {string} [details.language='en']
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
async function sendNewBookingAlertWhatsApp(ownerPhone, details) {
  const { reservationId, customerName, customerPhone, partySize, date, time, language = 'en' } = details;

  if (!isWhatsAppConfigured()) {
    return { success: false, error: 'WhatsApp not configured' };
  }

  const message = getTemplate('new_booking_alert', language, {
    customerName,
    partySize,
    date,
    time,
    phone: customerPhone,
    reservationId
  });

  if (!message) {
    return { success: false, error: 'Failed to render template' };
  }

  return sendWhatsAppMessage(ownerPhone, message);
}

/**
 * Send a WhatsApp audio message (voice note) via Meta Cloud API.
 *
 * @param {string} to - Recipient phone number (e.g. +5511999999999)
 * @param {string} audioUrl - Publicly accessible audio URL (e.g. Supabase signed URL)
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
async function sendWhatsAppAudioMessage(to, audioUrl) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error('Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'audio',
        audio: { link: audioUrl }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('WhatsApp audio send error:', { status: response.status, data: JSON.stringify(data) });
      return { success: false, error: data.error?.message || 'Failed to send audio' };
    }

    logger.info(`WhatsApp audio sent to ${to}, msgId=${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    logger.error('WhatsApp audio send exception:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send a WhatsApp image message via Meta Cloud API.
 * @param {string} to - Recipient phone
 * @param {string} imageUrl - Public URL of the image (PNG/JPEG)
 * @param {string} [caption] - Optional caption text
 */
async function sendWhatsAppImageMessage(to, imageUrl, caption) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: {
          link: imageUrl,
          ...(caption ? { caption } : {}),
        },
      }),
    });

    const data = await response.json();
    if (data.messages?.[0]?.id) {
      logger.info('WhatsApp image sent', { to: to.slice(0, 4) + '****', messageId: data.messages[0].id });
      return { success: true, messageId: data.messages[0].id };
    }
    logger.error('WhatsApp image send failed', { response: data });
    return { success: false, error: data.error?.message || 'Send failed' };
  } catch (error) {
    logger.error('WhatsApp image error', { error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Send a WhatsApp document message (PDF, etc.) via Meta Cloud API.
 *
 * @param {string} to - Recipient phone number (E.164)
 * @param {string} documentUrl - Publicly accessible document URL
 * @param {string} [caption=''] - Optional caption text
 * @param {string} [filename='relatorio.pdf'] - Display filename
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
async function sendWhatsAppDocumentMessage(to, documentUrl, caption = '', filename = 'relatorio.pdf') {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error('Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: {
          link: documentUrl,
          filename,
          ...(caption ? { caption } : {}),
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error('WhatsApp document send error:', { status: response.status, data: JSON.stringify(data) });
      return { success: false, error: data.error?.message || 'Failed to send document' };
    }

    logger.info(`WhatsApp document sent to ${to}, msgId=${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    logger.error('WhatsApp document send exception:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  isWhatsAppConfigured,
  getWhatsAppProvider,
  sendWhatsAppMessage,
  sendWhatsAppAudioMessage,
  sendWhatsAppImageMessage,
  sendWhatsAppDocumentMessage,
  sendTemplateMessage,
  sendReservationConfirmation,
  sendNewBookingAlertWhatsApp,
};
