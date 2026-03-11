/**
 * Cron Job: Send Reservation Reminders
 *
 * Sends WhatsApp template reminders to customers with reservations scheduled for today.
 * Uses Twilio Content Templates for WhatsApp messaging.
 *
 * Runs daily at 9 AM via Vercel Cron Jobs
 */

const twilio = require('twilio');
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry, captureMessage } = require('../_lib/sentry');
initSentry();
const logger = createSecureLogger('CronReminders');

/**
 * Send a WhatsApp template message via Twilio
 * (Standalone version for cron job)
 */
async function sendTemplateMessage(to, contentSid, contentVariables = {}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !twilioWhatsAppNumber) {
    logger.error(' Missing Twilio configuration');
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    const client = twilio(accountSid, authToken);

    const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    const fromNumber = twilioWhatsAppNumber.startsWith('whatsapp:')
      ? twilioWhatsAppNumber
      : `whatsapp:${twilioWhatsAppNumber}`;

    logger.info(` Sending template ${contentSid} to ${to}`);

    const result = await client.messages.create({
      from: fromNumber,
      to: toNumber,
      contentSid: contentSid,
      contentVariables: JSON.stringify(contentVariables)
    });

    logger.info(` Template sent to ${to}, messageId: ${result.sid}`);
    return { success: true, messageId: result.sid };
  } catch (error) {
    logger.error(' Template send exception:', error);
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

module.exports = async (req, res) => {
  // Verify this is a cron request (Vercel adds this header)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('CRON_SECRET not configured - denying request');
    return res.status(500).json({ success: false, error: 'Cron not configured' });
  }
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Verify Supabase admin client is available
  if (!supabaseAdmin) {
    logger.error('supabaseAdmin not initialized - missing Supabase credentials');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  try {
    logger.info(' Starting reservation reminder job...');

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    logger.info(` Looking for reservations on ${today}`);

    // Find all confirmed reservations for today that have a phone number
    const { data: reservations, error } = await supabaseAdmin
      .from('reservations')
      .select('id, reservation_id, restaurant_id, customer_name, customer_phone, date, time, party_size, ml_risk_level, ml_risk_score')
      .eq('date', today)
      .eq('status', 'confirmed')
      .not('customer_phone', 'is', null)
      .limit(500);

    if (error) {
      logger.error(' Error fetching reservations:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch reservations',
        details: error.message
      });
    }

    logger.info(` Found ${reservations?.length || 0} confirmed reservations for today`);

    // Batch-fetch restaurant names for all tenant restaurant_ids present in today's reservations
    const uniqueRestaurantIds = [...new Set(
      (reservations || []).map(r => r.restaurant_id).filter(Boolean)
    )];
    const restaurantNameMap = {};
    if (uniqueRestaurantIds.length > 0) {
      const { data: restaurantInfoRows, error: restaurantError } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_info')
        .select('id, restaurant_name')
        .in('id', uniqueRestaurantIds);
      if (restaurantError) {
        logger.error(' Error fetching restaurant info:', restaurantError);
      }
      for (const row of (restaurantInfoRows || [])) {
        restaurantNameMap[row.id] = row.restaurant_name;
      }
    }

    const results = {
      sent: 0,
      failed: 0,
      skipped: 0,
      details: []
    };

    // Send reminder to each reservation
    for (const reservation of (reservations || [])) {
      const {
        customer_name,
        customer_phone,
        time,
        party_size,
        reservation_id,
        restaurant_id
      } = reservation;

      const restaurantName = restaurantNameMap[restaurant_id] || 'the restaurant';

      // Skip if no phone number
      if (!customer_phone) {
        logger.info(` Skipping ${reservation_id} - no phone number`);
        results.skipped++;
        results.details.push({
          reservation_id,
          status: 'skipped',
          reason: 'No phone number'
        });
        continue;
      }

      // Format the time for display
      const formattedTime = formatTime(time);

      // Get the reminder template SID
      const reminderTemplateSid = process.env.TWILIO_TEMPLATE_RESERVATION_REMINDER;
      if (!reminderTemplateSid) {
        logger.error(' Missing TWILIO_TEMPLATE_RESERVATION_REMINDER environment variable');
        results.failed++;
        results.details.push({
          reservation_id,
          customer_name,
          status: 'failed',
          error: 'Reminder template SID not configured'
        });
        continue;
      }

      // Send the reminder template via Twilio
      // Content variables: {{1}}=name, {{2}}=restaurant, {{3}}=time, {{4}}=party_size
      const sendResult = await sendTemplateMessage(
        customer_phone,
        reminderTemplateSid,
        {
          '1': customer_name,
          '2': restaurantName,
          '3': formattedTime,
          '4': party_size.toString()
        }
      );

      if (sendResult.success) {
        logger.info(`Reminder sent to ${customer_name} (${customer_phone})`);
        results.sent++;
        results.details.push({
          reservation_id,
          customer_name,
          status: 'sent',
          messageId: sendResult.messageId
        });
      } else {
        logger.error(`Failed to send reminder to ${customer_name}:`, sendResult.error);
        results.failed++;
        results.details.push({
          reservation_id,
          customer_name,
          status: 'failed',
          error: sendResult.error
        });
      }

      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // ========================================================================
    // HIGH-RISK RESERVATIONS: Additional Handling
    // Send extra reminders and log automatic interventions
    // ========================================================================
    const highRiskReservations = (reservations || []).filter(r =>
      r.ml_risk_level === 'high' || r.ml_risk_level === 'very-high'
    );

    const highRiskResults = {
      total: highRiskReservations.length,
      interventions_logged: 0
    };

    if (highRiskReservations.length > 0) {
      logger.info(` Found ${highRiskReservations.length} high-risk reservations`);

      for (const reservation of highRiskReservations) {
        try {
          // Log automatic intervention for high-risk reservations
          // This helps track that the system sent extra attention to these
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
              logger.info(` Logged automatic intervention for high-risk reservation ${reservation.reservation_id}`);
            }
          }
        } catch (error) {
          logger.error(` Error processing high-risk reservation ${reservation.reservation_id}:`, error);
        }
      }
    }

    if (results.failed > 0) {
      const failedDetails = results.details.filter(d => d.status === 'failed');
      captureMessage(
        `CronReminders: ${results.failed} reminder(s) failed to send`,
        'warning',
        { errors: failedDetails, date: today }
      );
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

    logger.info(' Reminder job complete:', JSON.stringify(summary, null, 2));

    return res.status(200).json(summary);
  } catch (error) {
    logger.error(' Fatal error in reminder job:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};
