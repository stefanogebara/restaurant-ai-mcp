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
 * Send a WhatsApp text message via Meta Cloud API.
 *
 * @param {string} to - Recipient phone number (e.g. +5511999999999)
 * @param {string} message - Message body text
 * @returns {{ success: boolean, messageId?: string, error?: string }}
 */
async function sendWhatsAppMessage(to, message) {
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

module.exports = {
  isWhatsAppConfigured,
  sendWhatsAppMessage,
  sendWhatsAppAudioMessage,
  sendTemplateMessage,
  sendReservationConfirmation,
  sendNewBookingAlertWhatsApp,
};
