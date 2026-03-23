/**
 * Voice Note Sender — ElevenLabs TTS → Supabase Storage → WhatsApp Audio
 *
 * Generates a voice note from text using ElevenLabs TTS, uploads the MP3
 * to Supabase Storage, and sends it as a WhatsApp audio message.
 *
 * Follows the same pattern as api/_lib/briefing-sender.js.
 *
 * Usage:
 *   const { sendVoiceNote } = require('./voice-note-sender');
 *   await sendVoiceNote({ text, restaurantId, customerPhone, voiceId, language });
 */

const { sendWhatsAppAudioMessage } = require('../../_lib/whatsapp-sender');
const { supabaseAdmin } = require('../../_lib/supabase');
const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('VoiceNoteSender');

const STORAGE_BUCKET = 'whatsapp-voice-notes';
const MAX_TEXT_LENGTH = 500;
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Send a voice note via WhatsApp.
 *
 * Fire-and-forget: errors are logged but never thrown.
 *
 * @param {object} params
 * @param {string} params.text - Text to synthesize (truncated at 500 chars)
 * @param {string} params.restaurantId - Restaurant UUID (used for storage path)
 * @param {string} params.customerPhone - E.164 customer phone number
 * @param {string} params.voiceId - ElevenLabs voice ID
 * @param {string} [params.language='en'] - Language code (unused by TTS but logged)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendVoiceNote({ text, restaurantId, customerPhone, voiceId, language = 'en' }) {
  if (!text || !restaurantId || !customerPhone || !voiceId) {
    logger.warn('sendVoiceNote: missing required params', {
      hasText: !!text,
      hasRestaurantId: !!restaurantId,
      hasPhone: !!customerPhone,
      hasVoiceId: !!voiceId,
    });
    return { success: false, error: 'Missing required parameters' };
  }

  const apiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) {
    logger.warn('sendVoiceNote: ELEVENLABS_API_KEY not configured');
    return { success: false, error: 'ElevenLabs API key not configured' };
  }

  // Truncate text to avoid excessive TTS costs
  const truncatedText = text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH - 3) + '...'
    : text;

  try {
    // 1. Generate MP3 via ElevenLabs TTS
    logger.info('Generating voice note TTS', { restaurantId, language, voiceId });

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: truncatedText,
          model_id: 'eleven_flash_v2_5',
          output_format: 'mp3_44100_128',
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errBody = await ttsResponse.text();
      logger.error('ElevenLabs TTS failed', { status: ttsResponse.status, body: errBody });
      return { success: false, error: `TTS failed: ${ttsResponse.status}` };
    }

    const arrayBuffer = await ttsResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Upload MP3 to Supabase Storage
    const timestamp = Date.now();
    const storagePath = `${restaurantId}/${timestamp}.mp3`;

    logger.info('Uploading voice note to storage', { storagePath, sizeBytes: buffer.length });

    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: 'audio/mpeg' });

    if (uploadError) {
      logger.error('Storage upload failed', { error: uploadError.message, storagePath });
      return { success: false, error: `Storage upload failed: ${uploadError.message}` };
    }

    // 3. Generate signed URL (1 hour expiry)
    const { data: urlData, error: urlError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);

    if (urlError) {
      logger.error('Signed URL generation failed', { error: urlError.message });
      return { success: false, error: `Signed URL failed: ${urlError.message}` };
    }

    // 4. Send as WhatsApp audio message
    const sendResult = await sendWhatsAppAudioMessage(customerPhone, urlData.signedUrl);

    if (sendResult.success) {
      logger.info('Voice note sent successfully', {
        restaurantId,
        messageId: sendResult.messageId,
      });
    } else {
      logger.warn('WhatsApp audio send failed', { error: sendResult.error });
    }

    return sendResult;
  } catch (error) {
    logger.error('sendVoiceNote unexpected error', { error: error.message });
    return { success: false, error: error.message };
  }
}

module.exports = { sendVoiceNote };
