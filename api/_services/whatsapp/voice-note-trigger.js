/**
 * Voice Note Trigger — Orchestrates template rendering + voice note sending.
 *
 * Provides high-level functions like sendConfirmationVoiceNote() and
 * sendReminderVoiceNote() that compose the template system with the
 * voice-note-sender. All functions are fire-and-forget safe.
 */

const { getTemplate } = require('../../_lib/whatsapp-templates');
const { sendVoiceNote } = require('./voice-note-sender');
const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('VoiceNoteTrigger');

// Default ElevenLabs voice if restaurant has none configured
const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Rachel

/**
 * Send a voice note confirmation after a reservation is created.
 *
 * @param {object} params
 * @param {string} params.restaurantId - Restaurant UUID
 * @param {string} params.customerPhone - E.164 phone
 * @param {string} params.customerName - Customer name
 * @param {number|string} params.partySize - Party size
 * @param {string} params.date - Reservation date
 * @param {string} params.time - Reservation time
 * @param {string} params.restaurantName - Display name
 * @param {string} [params.voiceId] - ElevenLabs voice ID
 * @param {string} [params.language='en'] - Language code
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendConfirmationVoiceNote({
  restaurantId,
  customerPhone,
  customerName,
  partySize,
  date,
  time,
  restaurantName,
  voiceId,
  language = 'en',
}) {
  const effectiveVoiceId = voiceId || DEFAULT_VOICE_ID;

  const text = getTemplate('voice_note_confirmation', language, {
    name: customerName || 'there',
    restaurant: restaurantName || 'the restaurant',
    partySize: String(partySize),
    date,
    time,
  });

  if (!text) {
    logger.warn('Failed to render voice_note_confirmation template', { language });
    return { success: false, error: 'Template rendering failed' };
  }

  logger.info('Sending confirmation voice note', { restaurantId, customerPhone: '***' });

  return sendVoiceNote({
    text,
    restaurantId,
    customerPhone,
    voiceId: effectiveVoiceId,
    language,
  });
}

/**
 * Send a voice note reminder for today's reservation.
 *
 * @param {object} params
 * @param {string} params.restaurantId - Restaurant UUID
 * @param {string} params.customerPhone - E.164 phone
 * @param {string} params.customerName - Customer name
 * @param {string} params.time - Reservation time
 * @param {string} params.restaurantName - Display name
 * @param {string} [params.voiceId] - ElevenLabs voice ID
 * @param {string} [params.language='en'] - Language code
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendReminderVoiceNote({
  restaurantId,
  customerPhone,
  customerName,
  time,
  restaurantName,
  voiceId,
  language = 'en',
}) {
  const effectiveVoiceId = voiceId || DEFAULT_VOICE_ID;

  const text = getTemplate('voice_note_reminder', language, {
    name: customerName || 'there',
    restaurant: restaurantName || 'the restaurant',
    time,
  });

  if (!text) {
    logger.warn('Failed to render voice_note_reminder template', { language });
    return { success: false, error: 'Template rendering failed' };
  }

  logger.info('Sending reminder voice note', { restaurantId, customerPhone: '***' });

  return sendVoiceNote({
    text,
    restaurantId,
    customerPhone,
    voiceId: effectiveVoiceId,
    language,
  });
}

module.exports = {
  sendConfirmationVoiceNote,
  sendReminderVoiceNote,
};
