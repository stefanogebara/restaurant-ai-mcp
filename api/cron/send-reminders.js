/**
 * Cron Job: Send Reservation Reminders
 *
 * Sends WhatsApp reminders to customers with reservations scheduled for today.
 * Uses Meta Cloud API when the restaurant has WhatsApp enabled,
 * falls back to Twilio Content Templates otherwise.
 *
 * Runs daily at 9 AM via Vercel Cron Jobs
 */

const twilio = require('twilio');
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { sendWhatsAppMessage, isWhatsAppConfigured } = require('../_lib/whatsapp-sender');

const logger = createSecureLogger('CronReminders');

/**
 * Send a WhatsApp template message via Twilio (fallback)
 */
async function sendTwilioReminder(to, contentSid, contentVariables = {}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !twilioWhatsAppNumber) {
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const client = twilio(accountSid, authToken);
    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const fromNumber = twilioWhatsAppNumber.startsWith('whatsapp:')
      ? twilioWhatsAppNumber
      : `whatsapp:${twilioWhatsAppNumber}`;

    const result = await client.messages.create({
      from: fromNumber,
      to: toNumber,
      contentSid,
      contentVariables: JSON.stringify(contentVariables)
    });

    return { success: true, messageId: result.sid };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Format time from 24-hour to 12-hour format
 */
function formatTime(time24) {
  try {
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  } catch {
    return time24;
  }
}

/**
 * Build a text reminder message for Meta API
 */
function buildReminderText(customerName, restaurantName, formattedTime, partySize) {
  return `Hi ${customerName}! This is a reminder about your reservation at ${restaurantName} today at ${formattedTime} for ${partySize} guest${partySize !== 1 ? 's' : ''}. We look forward to seeing you!`;
}

module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET not configured - denying request');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  if (!supabaseAdmin) {
    logger.error('supabaseAdmin not initialized');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  try {
    logger.info('Starting reservation reminder job...');

    const today = new Date().toISOString().split('T')[0];
    logger.info(`Looking for reservations on ${today}`);

    // Fetch all confirmed reservations for today with a phone number
    const { data: reservations, error } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('date', today)
      .eq('status', 'confirmed')
      .not('customer_phone', 'is', null);

    if (error) {
      logger.error('Error fetching reservations:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch reservations', details: error.message });
    }

    logger.info(`Found ${reservations?.length || 0} confirmed reservations for today`);

    // Group reservations by restaurant_id for efficient config lookups
    const byRestaurant = {};
    for (const r of (reservations || [])) {
      if (!byRestaurant[r.restaurant_id]) byRestaurant[r.restaurant_id] = [];
      byRestaurant[r.restaurant_id].push(r);
    }

    // Fetch restaurant configs for all involved restaurants in one query
    const restaurantIds = Object.keys(byRestaurant);
    const restaurantConfigs = {};

    if (restaurantIds.length > 0) {
      const { data: configs } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, restaurant_name, whatsapp_enabled, whatsapp_phone_number, agent_language')
        .in('id', restaurantIds);

      for (const cfg of (configs || [])) {
        restaurantConfigs[cfg.id] = cfg;
      }
    }

    const results = { sent: 0, failed: 0, skipped: 0, details: [] };
    const metaConfigured = isWhatsAppConfigured();

    for (const reservation of (reservations || [])) {
      const { customer_name, customer_phone, time, party_size, reservation_id, restaurant_id } = reservation;

      if (!customer_phone) {
        results.skipped++;
        results.details.push({ reservation_id, status: 'skipped', reason: 'No phone number' });
        continue;
      }

      const config = restaurantConfigs[restaurant_id] || {};
      const restaurantName = config.restaurant_name || 'the restaurant';
      const formattedTime = formatTime(time);
      const useWhatsApp = config.whatsapp_enabled && metaConfigured;

      let sendResult;

      if (useWhatsApp) {
        // Meta Cloud API - plain text reminder
        const message = buildReminderText(customer_name, restaurantName, formattedTime, party_size);
        sendResult = await sendWhatsAppMessage(customer_phone, message);
        logger.info(`Meta API reminder -> ${customer_name} (${customer_phone})`);
      } else {
        // Twilio fallback with Content Template
        const reminderTemplateSid = process.env.TWILIO_TEMPLATE_RESERVATION_REMINDER;
        if (!reminderTemplateSid) {
          logger.error('Missing TWILIO_TEMPLATE_RESERVATION_REMINDER');
          results.failed++;
          results.details.push({ reservation_id, customer_name, status: 'failed', error: 'Reminder template SID not configured' });
          continue;
        }
        sendResult = await sendTwilioReminder(customer_phone, reminderTemplateSid, {
          '1': customer_name,
          '2': restaurantName,
          '3': formattedTime,
          '4': party_size.toString()
        });
        logger.info(`Twilio reminder -> ${customer_name} (${customer_phone})`);
      }

      if (sendResult.success) {
        results.sent++;
        results.details.push({ reservation_id, customer_name, status: 'sent', messageId: sendResult.messageId });
      } else {
        logger.error(`Failed to send reminder to ${customer_name}:`, sendResult.error);
        results.failed++;
        results.details.push({ reservation_id, customer_name, status: 'failed', error: sendResult.error });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // ========================================================================
    // HIGH-RISK RESERVATIONS: Log automatic interventions
    // ========================================================================
    const highRiskReservations = (reservations || []).filter(r =>
      r.ml_risk_level === 'high' || r.ml_risk_level === 'very-high'
    );

    const highRiskResults = { total: highRiskReservations.length, interventions_logged: 0 };

    for (const reservation of highRiskReservations) {
      try {
        if (!reservation.intervention_taken) {
          const { error: updateError } = await supabaseAdmin
            .from('reservations')
            .update({
              intervention_taken: true,
              intervention_type: 'automatic_reminder',
              intervention_notes: `Automatic high-risk reminder sent by system (${reservation.ml_risk_level} risk, score: ${reservation.ml_risk_score})`,
              intervention_timestamp: new Date().toISOString(),
              intervention_by: 'system'
            })
            .eq('reservation_id', reservation.reservation_id);

          if (!updateError) {
            highRiskResults.interventions_logged++;
          }
        }
      } catch (error) {
        logger.error(`Error processing high-risk reservation ${reservation.reservation_id}:`, error);
      }
    }

    const summary = {
      success: true,
      run_at: new Date().toISOString(),
      date: today,
      total_reservations: reservations?.length || 0,
      reminders_sent: results.sent,
      reminders_failed: results.failed,
      reminders_skipped: results.skipped,
      high_risk: highRiskResults,
      details: results.details
    };

    logger.info('Reminder job complete:', JSON.stringify(summary, null, 2));
    return res.status(200).json(summary);
  } catch (error) {
    logger.error('Fatal error in reminder job:', error);
    return res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
  }
};
