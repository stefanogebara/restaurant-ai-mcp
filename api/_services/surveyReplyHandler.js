/**
 * Survey Reply Handler
 *
 * Detects WhatsApp replies to survey messages and saves them
 * to restaurant.survey_responses.
 *
 * A reply is considered a survey reply when:
 * 1. The phone number has a service_record with survey_sent_at in the last 48h
 * 2. The message starts with a number 1-5
 *
 * After the rating, any additional text is saved as a comment.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('SurveyReplyHandler');

const SURVEY_WINDOW_HOURS = 48;

/**
 * Check if this message is a survey reply and process it.
 * @param {string} phone - Sender phone (e.g. '5511999002121')
 * @param {string} messageText - Raw message text
 * @returns {null | { rating: number, comment: string|null }} - null if not a survey reply
 */
async function handleSurveyReply(phone, messageText) {
  if (!phone || !messageText) return null;

  const trimmed = messageText.trim();
  if (!trimmed) return null;

  // Extract rating: first character must be 1-5
  const firstChar = trimmed.charAt(0);
  const rating = parseInt(firstChar, 10);
  if (isNaN(rating) || rating < 1 || rating > 5) return null;

  // Normalize phone: strip non-digits, remove leading +
  const normalizedPhone = phone.replace(/\D/g, '');

  // Check if this phone has a recent survey_sent_at
  const cutoff = new Date(Date.now() - SURVEY_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  const { data: serviceRecord, error: svcErr } = await supabaseAdmin
    .from('service_records')
    .select('id, restaurant_id, customer_name, reservation_id, survey_sent_at')
    .eq('status', 'completed')
    .gte('survey_sent_at', cutoff)
    .or(`customer_phone.eq.${normalizedPhone},customer_phone.eq.+${normalizedPhone}`)
    .order('survey_sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (svcErr) {
    logger.error('Failed to check survey status', { error: svcErr.message });
    return null;
  }

  if (!serviceRecord) return null;

  // Check if already responded
  const { data: existing } = await supabaseAdmin
    .schema('restaurant')
    .from('survey_responses')
    .select('id')
    .eq('restaurant_id', serviceRecord.restaurant_id)
    .or(`customer_phone.eq.${normalizedPhone},customer_phone.eq.+${normalizedPhone}`)
    .gte('created_at', cutoff)
    .limit(1)
    .maybeSingle();

  if (existing) {
    logger.info('Survey already responded', { phone: normalizedPhone.slice(0, 4) + '****' });
    return null;
  }

  // Extract optional comment (everything after the rating digit)
  const rest = trimmed.slice(1).trim();
  // Remove common separators: "5 - Great!", "3. ok", "4, nice"
  const comment = rest.replace(/^[\s\-.,;:!]+/, '').trim() || null;

  // Save to survey_responses
  const { error: insertErr } = await supabaseAdmin
    .schema('restaurant')
    .from('survey_responses')
    .insert({
      restaurant_id: serviceRecord.restaurant_id,
      customer_phone: normalizedPhone,
      customer_name: serviceRecord.customer_name || null,
      rating,
      comment,
      reservation_id: serviceRecord.reservation_id || null,
    });

  if (insertErr) {
    logger.error('Failed to save survey response', { error: insertErr.message });
    return null;
  }

  logger.info('Survey response saved', {
    restaurantId: serviceRecord.restaurant_id,
    rating,
    hasComment: !!comment,
  });

  return { rating, comment };
}

module.exports = { handleSurveyReply };
