// WhatsApp message sending via Meta Cloud API

const { createSecureLogger } = require('../../_lib/secure-logger');
const logger = createSecureLogger('WhatsApp');

// WhatsApp API base URL
const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

/**
 * Send a WhatsApp message via Meta Cloud API
 */
async function sendWhatsAppMessage(to, message) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error(' Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
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
        to: to,
        type: 'text',
        text: { body: message }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error(' Send error:', { status: response.status, data: JSON.stringify(data) });
      return { success: false, error: data.error?.message || 'Failed to send' };
    }

    logger.info(` Message sent to ${to}, status=${response.status}, msgId=${data.messages?.[0]?.id}, contacts=${JSON.stringify(data.contacts)}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    logger.error(' Send exception:', error);
    return { success: false, error: 'Failed to send message' };
  }
}

/**
 * Send a WhatsApp template message via Meta Cloud API
 * Used for business-initiated messages (outside 24-hour window)
 * Templates must be pre-approved in Meta Business Manager
 *
 * @param {string} to - Recipient phone number
 * @param {string} templateName - Name of approved template (e.g., 'reservation_confirmed')
 * @param {string} languageCode - Template language (e.g., 'en', 'es')
 * @param {Array} bodyParameters - Array of strings for {{1}}, {{2}}, etc. placeholders
 * @returns {object} Result with success status
 */
async function sendTemplateMessage(to, templateName, languageCode = 'en', bodyParameters = []) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    logger.error(' Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN');
    return { success: false, error: 'WhatsApp not configured' };
  }

  try {
    // Build template components
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
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components
      }
    };

    logger.info(` Sending template '${templateName}' to ${to}:`, JSON.stringify(payload, null, 2));

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
      logger.error(' Template send error:', data);
      return { success: false, error: data.error?.message || 'Failed to send template' };
    }

    logger.info(` Template '${templateName}' sent to ${to}, messageId: ${data.messages?.[0]?.id}`);
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (error) {
    logger.error(' Template send exception:', error);
    return { success: false, error: 'Failed to send template message' };
  }
}

/**
 * Send a WhatsApp Interactive List message via Meta Cloud API
 * Used for restaurant selection when multiple restaurants are available
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

module.exports = {
  sendWhatsAppMessage,
  sendTemplateMessage,
  sendInteractiveListMessage,
  WHATSAPP_API_URL,
};
