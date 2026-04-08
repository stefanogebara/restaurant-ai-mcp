/**
 * Cron Job: Pre-Reservation WhatsApp Upsell (V2)
 *
 * Sends AI-personalized dish recommendations via WhatsApp to customers
 * with confirmed reservations for tomorrow.
 *
 * Flow:
 *   1. Find restaurants with pre_reservation_upsell enabled
 *   2. Fetch tomorrow's confirmed reservations (with phone numbers)
 *   3. Dedup via upsell_messages_log (skip already-sent)
 *   4. Enrich with customer history + menu memories
 *   5. Generate AI-personalized message (Claude Haiku) with template fallback
 *   6. Send via WhatsApp + log to upsell_messages_log
 *
 * Runs daily at 11 AM via Vercel Cron Jobs.
 * Max 10 reservations per restaurant per run (Vercel 60s timeout, 45s time budget).
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { sendWhatsAppMessage, isWhatsAppConfigured } = require('../_lib/whatsapp-sender');
const { generateUpsellMessage, buildFallbackMessage } = require('../_lib/upsell-generator');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry } = require('../_lib/sentry');
const { logCronRun } = require('../_lib/cron-tracker');
const { getLocalDate } = require('../_lib/timezone');

initSentry();
const logger = createSecureLogger('CronPreReservationUpsell');

const MAX_PER_RESTAURANT = 10;
const SEND_DELAY_MS = 500;
const TIME_BUDGET_MS = 45000; // 45s budget, leaving 15s buffer for Vercel 60s limit

/**
 * Detect language from phone number country code.
 */
function detectLangFromPhone(phone) {
  if (!phone) return 'en';
  if (phone.startsWith('+55')) return 'pt-BR';
  if (phone.startsWith('+54') || phone.startsWith('+56') || phone.startsWith('+57') || phone.startsWith('+52')) return 'es';
  return 'en';
}

/**
 * Delay helper for rate limiting between sends.
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = async (req, res) => {
  // ---- Auth ----
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  if (!isWhatsAppConfigured()) {
    logger.warn('WhatsApp not configured — skipping upsell sends');
    await logCronRun('pre-reservation-upsell', true, { skipped: true, reason: 'WhatsApp not configured' });
    return res.status(200).json({ success: true, skipped: true, reason: 'WhatsApp not configured' });
  }

  try {
    const startTime = Date.now();
    logger.info('Starting pre-reservation upsell job (V2)...');

    // ---- 1. Find eligible restaurants (opt-in) ----
    const { data: restaurants, error: restError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name, notification_preferences, timezone')
      .not('notification_preferences', 'is', null);

    if (restError) {
      logger.error('Error fetching restaurants:', restError);
      await logCronRun('pre-reservation-upsell', false, { error: restError.message });
      return res.status(500).json({ success: false, error: restError.message });
    }

    // Filter for restaurants with upsell enabled
    const eligibleRestaurants = (restaurants || []).filter(
      (r) => r.notification_preferences?.pre_reservation_upsell === true
    );

    if (!eligibleRestaurants.length) {
      logger.info('No restaurants with pre_reservation_upsell enabled');
      await logCronRun('pre-reservation-upsell', true, { sent: 0, reason: 'No opted-in restaurants' });
      return res.status(200).json({ success: true, sent: 0, reason: 'No opted-in restaurants' });
    }

    logger.info(`Found ${eligibleRestaurants.length} eligible restaurants`);

    const results = { sent: 0, skipped: 0, failed: 0, aiGenerated: 0, templateFallback: 0 };

    // ---- 2. Process each restaurant ----
    for (const restaurant of eligibleRestaurants) {
      // Time-budget guard at restaurant level too
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        logger.warn(`Time budget exceeded (${TIME_BUDGET_MS}ms), stopping restaurant loop`);
        break;
      }

      const restaurantId = restaurant.id;
      const restaurantName = restaurant.restaurant_name || 'our restaurant';
      const signatureDishes = [];
      const tz = restaurant.timezone || 'UTC';

      // Get tomorrow in the restaurant's local timezone
      const todayLocal = getLocalDate(tz);
      const tomorrowDate = new Date(todayLocal + 'T12:00:00Z'); // noon avoids DST edge
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

      // 2a. Fetch tomorrow's confirmed reservations with phone numbers
      const { data: reservations, error: resError } = await supabaseAdmin
        .from('reservations')
        .select('id, reservation_id, customer_name, customer_phone, date, time, party_size')
        .eq('restaurant_id', restaurantId)
        .eq('date', tomorrowStr)
        .eq('status', 'confirmed')
        .not('customer_phone', 'is', null)
        .limit(MAX_PER_RESTAURANT);

      if (resError) {
        logger.error(`Error fetching reservations for ${restaurantId}:`, resError);
        continue;
      }

      if (!reservations?.length) continue;

      // 3b. Dedup — check which reservations already got an upsell
      const reservationIds = reservations.map((r) => r.reservation_id);
      const { data: alreadySent } = await supabaseAdmin
        .from('upsell_messages_log')
        .select('reservation_id')
        .in('reservation_id', reservationIds)
        .eq('message_type', 'pre_reservation_upsell');

      const sentSet = new Set((alreadySent || []).map((r) => r.reservation_id));
      const newReservations = reservations.filter((r) => !sentSet.has(r.reservation_id));

      if (!newReservations.length) {
        results.skipped += reservations.length;
        continue;
      }

      // 3c. Batch-fetch customer context
      const phones = [...new Set(newReservations.map((r) => r.customer_phone))];

      const { data: customerHistory } = await supabaseAdmin
        .from('customer_history')
        .select('customer_phone, visit_count, preferences, favorite_dishes')
        .eq('restaurant_id', restaurantId)
        .in('customer_phone', phones);

      const { data: customerLtv } = await supabaseAdmin
        .from('customer_ltv')
        .select('customer_phone, customer_tier')
        .eq('restaurant_id', restaurantId)
        .in('customer_phone', phones);

      const historyMap = {};
      for (const ch of customerHistory || []) {
        historyMap[ch.customer_phone] = ch;
      }
      const ltvMap = {};
      for (const cl of customerLtv || []) {
        ltvMap[cl.customer_phone] = cl;
      }

      // 3d. Fetch menu memories from manager_memory
      const { data: menuMemories } = await supabaseAdmin
        .from('manager_memory')
        .select('content')
        .eq('restaurant_id', restaurantId)
        .eq('category', 'menu')
        .order('importance', { ascending: false })
        .limit(10);

      // 3e. Generate + send for each reservation
      for (const reservation of newReservations) {
        // Time-budget guard: break if we've used most of the allowed runtime
        if (Date.now() - startTime > TIME_BUDGET_MS) {
          logger.warn(`Time budget exceeded (${TIME_BUDGET_MS}ms), stopping upsell sends`);
          break;
        }

        const { reservation_id, customer_name, customer_phone, party_size, time } = reservation;
        const lang = detectLangFromPhone(customer_phone);
        const history = historyMap[customer_phone] || {};
        const ltv = ltvMap[customer_phone] || {};

        let message = null;
        let usedAI = false;

        // Try AI generation first
        try {
          message = await generateUpsellMessage({
            customerName: customer_name,
            partySize: party_size,
            time,
            visitCount: history.visit_count || 0,
            preferences: history.preferences,
            favoriteDishes: history.favorite_dishes,
            customerTier: ltv.customer_tier,
            signatureDishes,
            menuMemories: menuMemories || [],
            restaurantName,
            lang,
          });
          usedAI = true;
        } catch (aiErr) {
          logger.warn(`AI generation failed for ${reservation_id}: ${aiErr.message}, using fallback`);
        }

        // Fallback to template
        if (!message) {
          message = buildFallbackMessage({
            customerName: customer_name,
            restaurantName,
            signatureDishes,
            partySize: party_size,
            lang,
          });
        }

        // Skip if no dishes available at all
        if (!message) {
          results.skipped++;
          await logToUpsellMessages(restaurantId, reservation_id, customer_phone, null, null, 'skipped');
          continue;
        }

        // Send via WhatsApp
        const sendResult = await sendWhatsAppMessage(customer_phone, message);

        if (sendResult.success) {
          results.sent++;
          if (usedAI) results.aiGenerated++;
          else results.templateFallback++;
          await logToUpsellMessages(restaurantId, reservation_id, customer_phone, message, sendResult.messageId, 'sent');
          logger.info(`Upsell sent for ${reservation_id}`);
        } else {
          results.failed++;
          await logToUpsellMessages(restaurantId, reservation_id, customer_phone, message, null, 'failed');
          logger.warn(`Upsell failed for ${reservation_id}: ${sendResult.error}`);
        }

        // Rate limit between sends
        if (newReservations.indexOf(reservation) < newReservations.length - 1) {
          await delay(SEND_DELAY_MS);
        }
      }
    }

    logger.info(
      `Upsell job complete: ${results.sent} sent (${results.aiGenerated} AI, ${results.templateFallback} template), ${results.skipped} skipped, ${results.failed} failed`
    );
    await logCronRun('pre-reservation-upsell', true, results);

    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    logger.error('Upsell job error:', err);
    await logCronRun('pre-reservation-upsell', false, { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Log a send attempt to upsell_messages_log for dedup + analytics.
 */
async function logToUpsellMessages(restaurantId, reservationId, customerPhone, messageContent, whatsappMessageId, status) {
  try {
    await supabaseAdmin.from('upsell_messages_log').upsert(
      {
        restaurant_id: restaurantId,
        reservation_id: reservationId,
        customer_phone: customerPhone,
        message_content: messageContent,
        whatsapp_message_id: whatsappMessageId,
        status,
      },
      { onConflict: 'reservation_id,message_type' }
    );
  } catch (err) {
    logger.error(`Failed to log upsell message for ${reservationId}:`, err);
  }
}
