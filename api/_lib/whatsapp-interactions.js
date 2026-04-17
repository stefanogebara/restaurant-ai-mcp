'use strict';

/**
 * WhatsApp UX Interactions
 *
 * Provides typing indicators, read receipts, reaction emojis,
 * voice message transcription, and media downloading for the
 * Meta WhatsApp Cloud API.
 *
 * Inspired by the Kayro channel-adapter pattern.
 */

const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('WhatsAppInteractions');

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

function getCredentials() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
}

async function metaApiCall(phoneNumberId, accessToken, endpoint, body) {
  const url = `${WHATSAPP_API_URL}/${phoneNumberId}/${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return response;
}

// ─── Read Receipts ──────────────────────────────────────────────

/**
 * Mark a message as read (blue checkmarks).
 * @param {string} messageId - The WhatsApp message ID to mark as read
 */
async function markAsRead(messageId) {
  const creds = getCredentials();
  if (!creds) return;
  try {
    await metaApiCall(creds.phoneNumberId, creds.accessToken, 'messages', {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    });
    logger.info('Marked message as read', { messageId });
  } catch (err) {
    logger.warn('Failed to mark as read (non-fatal)', { error: err.message });
  }
}

// ─── Reactions ──────────────────────────────────────────────────

/**
 * Add an emoji reaction to a message.
 * @param {string} to - Recipient phone number
 * @param {string} messageId - Message to react to
 * @param {string} emoji - Emoji character (e.g. '👀', '✅')
 */
async function addReaction(to, messageId, emoji) {
  const creds = getCredentials();
  if (!creds) return;
  try {
    await metaApiCall(creds.phoneNumberId, creds.accessToken, 'messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji },
    });
  } catch (err) {
    logger.warn('Failed to add reaction (non-fatal)', { error: err.message });
  }
}

/**
 * Remove a reaction from a message.
 * @param {string} to - Recipient phone number
 * @param {string} messageId - Message to remove reaction from
 */
async function removeReaction(to, messageId) {
  const creds = getCredentials();
  if (!creds) return;
  try {
    await metaApiCall(creds.phoneNumberId, creds.accessToken, 'messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'reaction',
      reaction: { message_id: messageId, emoji: '' },
    });
  } catch (err) {
    logger.warn('Failed to remove reaction (non-fatal)', { error: err.message });
  }
}

// ─── Media Download ─────────────────────────────────────────────

/**
 * Download media from WhatsApp (images, audio, documents).
 * @param {string} mediaId - WhatsApp media ID
 * @returns {Promise<{buffer: Buffer, mimeType: string, filename: string|null}>}
 */
async function downloadMedia(mediaId) {
  const creds = getCredentials();
  if (!creds) throw new Error('WhatsApp not configured');

  // Step 1: Get the media URL
  const metaRes = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${creds.accessToken}` },
  });
  if (!metaRes.ok) throw new Error(`Media metadata fetch failed: ${metaRes.status}`);
  const meta = await metaRes.json();

  // Step 2: Download the actual file
  const fileRes = await fetch(meta.url, {
    headers: { 'Authorization': `Bearer ${creds.accessToken}` },
  });
  if (!fileRes.ok) throw new Error(`Media download failed: ${fileRes.status}`);

  const buffer = Buffer.from(await fileRes.arrayBuffer());
  return {
    buffer,
    mimeType: meta.mime_type || 'application/octet-stream',
    filename: meta.filename || null,
    size: buffer.length,
  };
}

// ─── Voice Transcription ────────────────────────────────────────

/**
 * Transcribe a voice message using OpenAI Whisper.
 * @param {string} mediaId - WhatsApp media ID of the audio message
 * @returns {Promise<string>} Transcribed text
 */
async function transcribeVoiceMessage(mediaId) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured for voice transcription');

  // Download the audio
  const { buffer, mimeType } = await downloadMedia(mediaId);
  logger.info('Downloaded voice message', { size: buffer.length, mimeType });

  // Determine file extension from mime type
  const extMap = {
    'audio/ogg': 'ogg',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/webm': 'webm',
    'audio/wav': 'wav',
  };
  const ext = extMap[mimeType.split(';')[0].trim()] || 'ogg';

  // Call OpenAI Whisper API
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('file', buffer, { filename: `voice.${ext}`, contentType: mimeType });
  form.append('model', 'whisper-1');
  form.append('language', 'pt'); // Default to Portuguese for Brazilian market

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!whisperRes.ok) {
    const err = await whisperRes.text();
    throw new Error(`Whisper transcription failed: ${whisperRes.status} ${err}`);
  }

  const result = await whisperRes.json();
  logger.info('Voice transcribed', { text: result.text?.substring(0, 80) });
  return result.text || '';
}

// ─── Typing Simulation ─────────────────────────────────────────

/**
 * Simulate a natural typing delay based on response length.
 * @param {number} responseLength - Length of the response about to be sent
 * @returns {Promise<void>}
 */
async function simulateTypingDelay(_responseLength) {
  // Intentionally removed: artificial delay was pushing pipeline past Meta's
  // 5s retry window, causing concurrent duplicate invocations that beat Redis dedup.
  // WhatsApp typing indicators (the "..." bubble) are a better UX signal anyway.
}

module.exports = {
  markAsRead,
  addReaction,
  removeReaction,
  downloadMedia,
  transcribeVoiceMessage,
  simulateTypingDelay,
};
