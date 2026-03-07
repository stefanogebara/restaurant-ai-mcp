/**
 * Feedback Service
 *
 * Manages post-visit feedback collection via WhatsApp.
 * - Schedule feedback after service completion
 * - Send pending feedback messages
 * - Process guest replies (rating + comment)
 * - Aggregate feedback stats
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('FeedbackService');

/**
 * Schedule feedback for a completed service.
 * Inserts a pending feedback row that will be sent later by the cron.
 */
async function scheduleFeedback(restaurantId, reservationId, customerPhone, customerName) {
  if (!restaurantId || !customerPhone) {
    logger.warn('scheduleFeedback: missing restaurantId or customerPhone');
    return null;
  }

  // Check if feedback already scheduled for this reservation
  if (reservationId) {
    const { data: existing } = await supabaseAdmin
      .from('guest_feedback')
      .select('id')
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (existing) {
      logger.info('Feedback already scheduled for reservation', { reservationId });
      return existing;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('guest_feedback')
    .insert({
      restaurant_id: restaurantId,
      reservation_id: reservationId || null,
      customer_phone: customerPhone,
      customer_name: customerName || null,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    logger.error('Failed to schedule feedback', { error: error.message });
    return null;
  }

  logger.info('Feedback scheduled', { feedbackId: data.id, restaurantId });
  return data;
}

/**
 * Send pending feedback messages whose delay has elapsed.
 * Called by the cron job every 30 minutes.
 * @param {number} batchSize - Max messages to send per run
 * @returns {number} Number of messages sent
 */
async function sendPendingFeedback(batchSize = 50) {
  // Fetch pending feedback with restaurant config for delay + template
  const { data: pending, error } = await supabaseAdmin
    .from('guest_feedback')
    .select(`
      id, restaurant_id, customer_phone, customer_name, created_at,
      reservation_id
    `)
    .eq('status', 'pending')
    .order('created_at')
    .limit(batchSize);

  if (error || !pending?.length) {
    if (error) logger.error('Failed to fetch pending feedback', { error: error.message });
    return 0;
  }

  // Fetch restaurant configs for all unique restaurant_ids
  const restaurantIds = [...new Set(pending.map(f => f.restaurant_id))];
  const { data: configs } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, feedback_config')
    .in('id', restaurantIds);

  const configMap = {};
  for (const c of configs || []) {
    configMap[c.id] = c;
  }

  let sentCount = 0;

  for (const feedback of pending) {
    const config = configMap[feedback.restaurant_id];
    if (!config?.feedback_config?.enabled) {
      // Feedback not enabled for this restaurant — skip silently
      continue;
    }

    const delayMinutes = config.feedback_config.delay_minutes || 60;
    const createdAt = new Date(feedback.created_at);
    const sendAfter = new Date(createdAt.getTime() + delayMinutes * 60 * 1000);

    if (new Date() < sendAfter) {
      continue; // Not time yet
    }

    const name = feedback.customer_name || '';
    const restaurantName = config.restaurant_name || 'our restaurant';

    const customTemplate = config.feedback_config.message_template;
    const message = customTemplate
      ? customTemplate.replace('{name}', name).replace('{restaurant}', restaurantName)
      : `Hi${name ? ' ' + name : ''}, thank you for dining with us at ${restaurantName}! We'd love to hear your feedback.\n\nHow was your experience? Please reply with a number from 1 to 5:\n1 ⭐ Poor\n2 ⭐⭐ Fair\n3 ⭐⭐⭐ Good\n4 ⭐⭐⭐⭐ Very Good\n5 ⭐⭐⭐⭐⭐ Excellent\n\nYou can also add a comment after your rating.`;

    const result = await sendWhatsAppMessage(feedback.customer_phone, message);

    if (result.success) {
      await supabaseAdmin
        .from('guest_feedback')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          whatsapp_message_id: result.messageId || null,
        })
        .eq('id', feedback.id);
      sentCount++;
    } else {
      logger.error('Failed to send feedback message', {
        feedbackId: feedback.id,
        error: result.error,
      });
    }
  }

  logger.info('sendPendingFeedback complete', { processed: pending.length, sent: sentCount });
  return sentCount;
}

/**
 * Expire feedback that was sent more than 24 hours ago without response.
 * @returns {number} Number expired
 */
async function expireOldFeedback() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('guest_feedback')
    .update({ status: 'expired' })
    .eq('status', 'sent')
    .lt('sent_at', cutoff)
    .select('id');

  if (error) {
    logger.error('Failed to expire old feedback', { error: error.message });
    return 0;
  }

  const count = data?.length || 0;
  if (count > 0) {
    logger.info('Expired old feedback', { count });
  }
  return count;
}

/**
 * Process a feedback reply from a WhatsApp message.
 * Parses rating (1-5 or star emoji count) and optional comment.
 * @returns {Object|null} Updated feedback record or null
 */
async function processFeedbackReply(restaurantId, customerPhone, messageText) {
  // Find the most recent sent feedback for this phone + restaurant
  const { data: feedback, error } = await supabaseAdmin
    .from('guest_feedback')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('customer_phone', customerPhone)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !feedback) {
    return null;
  }

  // Parse rating from message
  const parsed = parseRatingFromMessage(messageText);

  const updates = {
    status: 'answered',
    answered_at: new Date().toISOString(),
  };

  if (parsed.rating) {
    updates.rating = parsed.rating;
  }
  if (parsed.comment) {
    updates.comment = parsed.comment.slice(0, 1000);
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('guest_feedback')
    .update(updates)
    .eq('id', feedback.id)
    .select()
    .single();

  if (updateErr) {
    logger.error('Failed to update feedback reply', { error: updateErr.message });
    return null;
  }

  logger.info('Feedback reply processed', {
    feedbackId: feedback.id,
    rating: parsed.rating,
    hasComment: !!parsed.comment,
  });

  return updated;
}

/**
 * Parse rating (1-5) and optional comment from message text.
 * Supports: "5", "5 Great food!", "⭐⭐⭐⭐⭐", "4 - loved the ambiance"
 */
function parseRatingFromMessage(text) {
  const trimmed = (text || '').trim();

  // Count star emojis
  const starCount = (trimmed.match(/⭐/g) || []).length;
  if (starCount >= 1 && starCount <= 5) {
    const comment = trimmed.replace(/⭐/g, '').trim();
    return { rating: starCount, comment: comment || null };
  }

  // Check for numeric rating at start
  const numMatch = trimmed.match(/^([1-5])\s*(.*)/s);
  if (numMatch) {
    const comment = numMatch[2].replace(/^[-–—:.\s]+/, '').trim();
    return { rating: parseInt(numMatch[1]), comment: comment || null };
  }

  // No clear rating — treat entire message as comment
  return { rating: null, comment: trimmed || null };
}

/**
 * Check if an incoming WhatsApp message is a feedback reply.
 * Looks for a 'sent' feedback matching phone + any restaurant.
 * @returns {Object|null} { feedbackId, restaurantId } or null
 */
async function findPendingFeedbackForPhone(customerPhone) {
  const { data, error } = await supabaseAdmin
    .from('guest_feedback')
    .select('id, restaurant_id')
    .eq('customer_phone', customerPhone)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return { feedbackId: data.id, restaurantId: data.restaurant_id };
}

/**
 * Get feedback stats for a restaurant.
 * @param {string} restaurantId
 * @param {number} days - Number of days to look back (default 7)
 */
async function getFeedbackStats(restaurantId, days = 7) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from('guest_feedback')
    .select('id, rating, status, comment, customer_name, answered_at, created_at')
    .eq('restaurant_id', restaurantId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('Failed to get feedback stats', { error: error.message });
    return { avg_rating: null, response_rate: 0, total: 0, by_rating: {}, recent: [] };
  }

  const all = data || [];
  const answered = all.filter(f => f.status === 'answered');
  const withRating = answered.filter(f => f.rating != null);
  const sentOrAnswered = all.filter(f => f.status === 'sent' || f.status === 'answered' || f.status === 'expired');

  const avgRating = withRating.length > 0
    ? Math.round((withRating.reduce((sum, f) => sum + f.rating, 0) / withRating.length) * 10) / 10
    : null;

  const byRating = {};
  for (const f of withRating) {
    byRating[f.rating] = (byRating[f.rating] || 0) + 1;
  }

  return {
    avg_rating: avgRating,
    response_rate: sentOrAnswered.length > 0
      ? Math.round((answered.length / sentOrAnswered.length) * 100)
      : 0,
    total: all.length,
    answered_count: answered.length,
    by_rating: byRating,
    recent: answered.slice(0, 10).map(f => ({
      id: f.id,
      rating: f.rating,
      comment: f.comment,
      customer_name: f.customer_name,
      answered_at: f.answered_at,
    })),
  };
}

module.exports = {
  scheduleFeedback,
  sendPendingFeedback,
  expireOldFeedback,
  processFeedbackReply,
  findPendingFeedbackForPhone,
  getFeedbackStats,
  parseRatingFromMessage,
};
