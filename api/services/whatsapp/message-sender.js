/**
 * WhatsApp message sending — re-export wrapper.
 *
 * The canonical implementation lives in api/_lib/whatsapp-sender.js.
 * This module re-exports the shared functions and adds the
 * sendInteractiveListMessage helper (Meta-only, used by the Meta webhook).
 */

const { createSecureLogger } = require('../../_lib/secure-logger');
const logger = createSecureLogger('WhatsApp');

const {
  sendWhatsAppMessage,
  sendTemplateMessage,
  getWhatsAppProvider,
} = require('../../_lib/whatsapp-sender');

// WhatsApp API base URL (used only by sendInteractiveListMessage below)
const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

/**
 * Send a WhatsApp Interactive List message via Meta Cloud API.
 * Used for restaurant selection when multiple restaurants are available.
 *
 * @param {string} to - Recipient phone number
 * @param {string} bodyText - Message body text
 * @param {string} buttonText - Text on the list button (max 20 chars)
 * @param {Array} sections - Array of { title, rows: [{ id, title, description }] }
 * @returns {object} Result with success status
 */
async function sendInteractiveListMessage(to, bodyText, buttonText, sections) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error(' Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: bodyText },
        action: {
          button: buttonText.substring(0, 20),
          sections: sections.map(section => ({
            title: section.title.substring(0, 24),
            rows: section.rows.map(row => ({
              id: row.id.substring(0, 200),
              title: row.title.substring(0, 24),
              description: (row.description || '').substring(0, 72)
            }))
          }))
        }
      }
    };

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
      logger.error(' Interactive list send error:', data);
      return { success: false, error: data.error?.message || 'Failed to send interactive list' };
    }

    logger.info(` Interactive list sent to ${to}, messageId: ${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    logger.error(' Interactive list send exception:', error);
    return { success: false, error: 'Failed to send interactive list' };
  }
}

/**
 * Send a WhatsApp Interactive Button message via Meta Cloud API.
 * Buttons are quick-reply options (max 3, title max 20 chars each).
 *
 * @param {string} to - Recipient phone number
 * @param {string} bodyText - Message body text (max 1024 chars)
 * @param {Array<{id: string, title: string}>} buttons - Up to 3 buttons
 * @returns {object} Result with success status
 */
async function sendInteractiveButtonMessage(to, bodyText, buttons) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error(' Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { success: false, error: 'WhatsApp not configured' };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText.substring(0, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map(btn => ({
          type: 'reply',
          reply: {
            id: btn.id.substring(0, 256),
            title: btn.title.substring(0, 20),
          }
        }))
      }
    }
  };

  try {
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
      logger.error(' Interactive button send error:', data);
      return { success: false, error: data.error?.message || 'Failed to send buttons' };
    }

    logger.info(` Interactive buttons sent to ${to}, messageId: ${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    logger.error(' Interactive button send exception:', error);
    return { success: false, error: 'Failed to send buttons' };
  }
}

module.exports = {
  sendWhatsAppMessage,
  sendTemplateMessage,
  sendInteractiveListMessage,
  sendInteractiveButtonMessage,
  getWhatsAppProvider,
  WHATSAPP_API_URL,
};
