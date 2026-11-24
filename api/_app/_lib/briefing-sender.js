const { sendWhatsAppMessage, sendWhatsAppAudioMessage } = require('./whatsapp-sender');
const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('briefing-sender');

// Default voice: Camila (Brazilian Portuguese, warm female). Override via env.
// Previous default was 'EXAVITQu4vr4xnSDxMaL' (Rachel, English-only) which produced
// mangled Portuguese pronunciation on every briefing.
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_BRIEFING_VOICE_ID || 'cgSgspJ2msm6clMCkdW9'; // Jessica (multilingual, warm)
const STORAGE_BUCKET = 'manager-briefing-audio';

/**
 * Strip markdown so TTS doesn't literally read '**' as 'asterisk asterisk' etc.
 * Also normalizes bullets, headings, and code fences that briefings tend to contain.
 */
function stripMarkdownForTTS(md) {
  if (!md) return '';
  let s = String(md);
  // Code fences
  s = s.replace(/```[\s\S]*?```/g, '');
  s = s.replace(/`([^`]+)`/g, '$1');
  // Bold + italic markers
  s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '$1');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/__([^_]+)__/g, '$1');
  s = s.replace(/_([^_]+)_/g, '$1');
  // Headings: '# Title' -> 'Title'
  s = s.replace(/^#{1,6}\s+/gm, '');
  // Bullet points: '- item' or '* item' or '• item' -> 'item'
  s = s.replace(/^\s*[-*•]\s+/gm, '');
  // Numbered lists keep the number but strip the dot (TTS handles '1' naturally)
  s = s.replace(/^(\s*)(\d+)\.\s+/gm, '$1$2. ');
  // Links: '[text](url)' -> 'text'
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Horizontal rules
  s = s.replace(/^---+$/gm, '');
  // Collapse repeated whitespace / blank lines
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

/**
 * Send a manager briefing via the channel specified in notification_preferences.
 *
 * Channel fallback: voice_note and phone_call can fail in ways the text
 * channel can't (ElevenLabs down, Supabase Storage upload reject, Twilio
 * call decline, signed URL minted past TTL...). The previous version
 * propagated those failures up to the cron, which had no try-catch, so
 * the manager got NOTHING — not even a degraded text version of the
 * briefing they were waiting for. Now we catch any non-text channel
 * failure and re-send via plain WhatsApp text. The owner gets the
 * briefing content; the channel preference just degrades for that send.
 *
 * @param {string} phone - E.164 phone number
 * @param {string} text - Briefing text
 * @param {'text'|'voice_note'|'phone_call'} channel
 * @param {string} restaurantId
 */
async function sendBriefing(phone, text, channel, restaurantId) {
  if (channel === 'text' || !channel) {
    return sendWhatsAppMessage(phone, text);
  }
  try {
    if (channel === 'phone_call') return await sendPhoneCall(phone, text);
    if (channel === 'voice_note') return await sendVoiceNote(phone, text, restaurantId);
    // Unknown channel — fall through to text.
    return sendWhatsAppMessage(phone, text);
  } catch (channelErr) {
    // Channel-specific delivery failed. Log loudly so ops can see the
    // pattern (e.g. ElevenLabs outage), then degrade to plain text so
    // the manager doesn't miss the briefing entirely.
    logger.warn('briefing channel delivery failed, falling back to text', {
      channel,
      restaurantId,
      error: channelErr?.message,
    });
    return sendWhatsAppMessage(phone, text);
  }
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
  // Strip markdown — TTS was reading '**' as 'asterisk asterisk' and '-' as 'dash'.
  const cleanText = stripMarkdownForTTS(text);
  // 1. Generate MP3 via ElevenLabs multilingual model (monolingual_v1 is English-only
  //    and was producing garbled Portuguese pronunciation).
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.1 },
      }),
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
