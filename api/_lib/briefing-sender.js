const { sendWhatsAppMessage, sendWhatsAppAudioMessage } = require('./whatsapp-sender');
const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('briefing-sender');

const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_BRIEFING_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Rachel
const STORAGE_BUCKET = 'manager-briefing-audio';

/**
 * Send a manager briefing via the channel specified in notification_preferences.
 * @param {string} phone - E.164 phone number
 * @param {string} text - Briefing text
 * @param {'text'|'voice_note'|'phone_call'} channel
 * @param {string} restaurantId
 */
async function sendBriefing(phone, text, channel, restaurantId) {
  if (channel === 'phone_call') return sendPhoneCall(phone, text);
  if (channel === 'voice_note') return sendVoiceNote(phone, text, restaurantId);
  // Default: text (also covers unknown channels)
  return sendWhatsAppMessage(phone, text);
}

async function sendPhoneCall(phone, text) {
  const twilio = require('twilio')(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  await twilio.calls.create({
    to: phone,
    from: process.env.TWILIO_PHONE_NUMBER,
    twiml: `<Response><Say>${text}</Say></Response>`,
  });
}

async function sendVoiceNote(phone, text, restaurantId) {
  // 1. Generate MP3 via ElevenLabs
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1' }),
    }
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${err}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 2. Upload to Supabase Storage (overwrite on each run — no TTL needed)
  const filename = `${restaurantId}-briefing.mp3`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(filename, buffer, { contentType: 'audio/mpeg', upsert: true });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  // 3. Generate 1-hour signed URL
  const { data, error: urlError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(filename, 3600);
  if (urlError) throw new Error(`Signed URL failed: ${urlError.message}`);

  // 4. Send as WhatsApp audio message
  await sendWhatsAppAudioMessage(phone, data.signedUrl);
}

/**
 * Attempt to log a briefing send in the dedup table.
 * Returns true if the INSERT succeeded (safe to send).
 * Returns false if the unique constraint fired (already sent today — skip).
 *
 * @param {string} restaurantId
 * @param {'morning'|'end_of_day'|'analytics'} briefingType
 * @returns {Promise<boolean>}
 */
async function tryLogBriefingSent(restaurantId, briefingType) {
  try {
    const { error } = await supabaseAdmin
      .from('briefings_log')
      .insert({ restaurant_id: restaurantId, briefing_type: briefingType });

    if (error) {
      // 23505 = unique_violation — already sent today
      if (error.code === '23505') {
        logger.info('Briefing already sent today, skipping', { restaurantId, briefingType });
        return false;
      }
      // Any other DB error: log but allow send (fail-open so restaurants still get briefings)
      logger.warn('briefings_log insert error (non-dedup)', { error: error.message, restaurantId, briefingType });
    }
    return true;
  } catch (err) {
    logger.warn('tryLogBriefingSent exception (fail-open)', { error: err.message });
    return true;
  }
}

module.exports = { sendBriefing, tryLogBriefingSent };
