/**
 * Cron Job: Pre-Reservation WhatsApp Upsell
 *
 * Sends AI-generated dish recommendations via WhatsApp to customers
 * with confirmed reservations for tomorrow. Includes signature dishes
 * and chef specials personalized by party size and time.
 *
 * Runs daily at 11 AM via Vercel Cron Jobs.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { sendWhatsAppMessage, isWhatsAppConfigured } = require('../_lib/whatsapp-sender');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry } = require('../_lib/sentry');
const { logCronRun } = require('../_lib/cron-tracker');
initSentry();
const logger = createSecureLogger('CronPreReservationUpsell');

/**
 * Generate dish recommendation message using restaurant profile data.
 * Uses simple template (no AI call) to keep costs zero.
 */
function buildUpsellMessage({ customerName, restaurantName, signatureDishes, partySize, time, lang }) {
  const firstName = customerName?.split(' ')[0] || '';
  const isLargeParty = partySize >= 4;

  // Pick 2-3 dishes (randomized selection)
  const shuffled = [...signatureDishes].sort(() => 0.5 - Math.random());
  const picks = shuffled.slice(0, Math.min(3, shuffled.length));

  if (lang === 'pt-BR' || lang === 'pt') {
    const dishList = picks.map(d => `• *${d.name}* — ${d.description || d.why_special || ''}`).join('\n');
    const greeting = firstName ? `Oi ${firstName}!` : 'Oi!';
    const partyNote = isLargeParty ? '\n\nPara grupos maiores, nosso chef recomenda pedir para compartilhar!' : '';

    return `${greeting} 👋\n\nAmanha voce tem reserva no *${restaurantName}* e nosso chef separou algumas sugestoes especiais:\n\n${dishList}${partyNote}\n\nTe esperamos! 🍽️`;
  }

  if (lang === 'es') {
    const dishList = picks.map(d => `• *${d.name}* — ${d.description || d.why_special || ''}`).join('\n');
    const greeting = firstName ? `Hola ${firstName}!` : 'Hola!';
    const partyNote = isLargeParty ? '\n\nPara grupos grandes, nuestro chef recomienda pedir para compartir!' : '';

    return `${greeting} 👋\n\nManana tienes reserva en *${restaurantName}* y nuestro chef preparo sugerencias especiales:\n\n${dishList}${partyNote}\n\nTe esperamos! 🍽️`;
  }

  // English (default)
  const dishList = picks.map(d => `• *${d.name}* — ${d.description || d.why_special || ''}`).join('\n');
  const greeting = firstName ? `Hi ${firstName}!` : 'Hi!';
  const partyNote = isLargeParty ? '\n\nFor larger parties, our chef recommends sharing plates!' : '';

  return `${greeting} 👋\n\nYou have a reservation tomorrow at *${restaurantName}* and our chef has some special recommendations:\n\n${dishList}${partyNote}\n\nWe look forward to seeing you! 🍽️`;
}

/**
 * Detect language from phone number country code
 */
function detectLangFromPhone(phone) {
  if (!phone) return 'en';
  if (phone.startsWith('+55')) return 'pt-BR';
  if (phone.startsWith('+54') || phone.startsWith('+56') || phone.startsWith('+57') || phone.startsWith('+52')) return 'es';
  return 'en';
}

module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
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
    logger.info('Starting pre-reservation upsell job...');

    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    logger.info(`Looking for reservations on ${tomorrowStr}`);

    // Find confirmed reservations for tomorrow with phone numbers
    const { data: reservations, error } = await supabaseAdmin
      .from('reservations')
      .select('id, reservation_id, restaurant_id, customer_name, customer_phone, date, time, party_size, special_requests')
      .eq('date', tomorrowStr)
      .eq('status', 'confirmed')
      .not('customer_phone', 'is', null)
      .limit(200);

    if (error) {
      logger.error('Error fetching reservations:', error);
      await logCronRun('pre-reservation-upsell', false, { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }

    if (!reservations?.length) {
      logger.info('No reservations found for tomorrow');
      await logCronRun('pre-reservation-upsell', true, { sent: 0, reason: 'No reservations' });
      return res.status(200).json({ success: true, sent: 0 });
    }

    logger.info(`Found ${reservations.length} reservations for tomorrow`);

    // Batch-fetch restaurant profiles for all restaurants
    const uniqueRestaurantIds = [...new Set(reservations.map(r => r.restaurant_id).filter(Boolean))];
    const restaurantMap = {};

    if (uniqueRestaurantIds.length > 0) {
      const { data: configs } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, restaurant_name, restaurant_profile')
        .in('id', uniqueRestaurantIds);

      for (const config of (configs || [])) {
        restaurantMap[config.id] = {
          name: config.restaurant_name || 'our restaurant',
          profile: config.restaurant_profile || {},
        };
      }
    }

    const results = { sent: 0, skipped: 0, failed: 0, details: [] };

    for (const reservation of reservations) {
      const { reservation_id, restaurant_id, customer_name, customer_phone, party_size, time } = reservation;

      const restaurant = restaurantMap[restaurant_id];
      const signatureDishes = restaurant?.profile?.signature_dishes;

      // Skip if restaurant has no signature dishes configured
      if (!signatureDishes?.length) {
        results.skipped++;
        results.details.push({ reservation_id, status: 'skipped', reason: 'No signature dishes' });
        continue;
      }

      const lang = detectLangFromPhone(customer_phone);
      const message = buildUpsellMessage({
        customerName: customer_name,
        restaurantName: restaurant.name,
        signatureDishes,
        partySize: party_size,
        time,
        lang,
      });

      const sendResult = await sendWhatsAppMessage(customer_phone, message);

      if (sendResult.success) {
        results.sent++;
        results.details.push({ reservation_id, status: 'sent', messageId: sendResult.messageId });
        logger.info(`Upsell sent for ${reservation_id} to ${customer_phone}`);
      } else {
        results.failed++;
        results.details.push({ reservation_id, status: 'failed', error: sendResult.error });
        logger.warn(`Upsell failed for ${reservation_id}: ${sendResult.error}`);
      }
    }

    logger.info(`Upsell job complete: ${results.sent} sent, ${results.skipped} skipped, ${results.failed} failed`);
    await logCronRun('pre-reservation-upsell', true, {
      sent: results.sent,
      skipped: results.skipped,
      failed: results.failed,
    });

    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    logger.error('Upsell job error:', err);
    await logCronRun('pre-reservation-upsell', false, { error: err.message });
    return res.status(500).json({ success: false, error: err.message });
  }
};
