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
const { logCronRun } = require('../_lib/cron-tracker');
const { getLocalDate } = require('../_lib/timezone');
const { sendReminderVoiceNote } = require('../services/whatsapp/voice-note-trigger');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');
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
  if (!bearerEquals(authHeader, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Verify Supabase admin client is available
  if (!supabaseAdmin) {
    logger.error('supabaseAdmin not initialized - missing Supabase credentials');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  // Phase U.3 kill switch — ops can disable this cron via
  // `UPDATE public.cron_config SET enabled=false WHERE job_name='send-reminders'`
  // without waiting for a redeploy. Fail-open if the lookup itself errors.
  if (!(await isCronEnabled('send-reminders'))) {
    logger.warn('send-reminders cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    logger.info(' Starting reservation reminder job...');

    // Fetch restaurant timezones to determine each restaurant's "today"
    const { data: restaurantConfigs } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, timezone');
    const timezoneMap = {};
    for (const cfg of (restaurantConfigs || [])) {
      timezoneMap[cfg.id] = cfg.timezone || 'UTC';
    }

    // Query yesterday+today+tomorrow (UTC) to cover all timezones (UTC-12 to UTC+14)
    const todayUTC = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    logger.info(` Looking for reservations on ${yesterday}..${tomorrow} (timezone-safe)`);

    // Find all confirmed reservations in the date window that have a phone number
    const { data: allReservations, error } = await supabaseAdmin
      .from('reservations')
      .select('id, reservation_id, restaurant_id, customer_name, customer_phone, date, time, party_size, ml_risk_level, ml_risk_score')
      .in('date', [yesterday, todayUTC, tomorrow])
      .eq('status', 'confirmed')
      .not('customer_phone', 'is', null)
      .limit(1500);

    // Filter to only reservations where date matches restaurant's local "today"
    const reservations = (allReservations || []).filter(r => {
      const tz = timezoneMap[r.restaurant_id] || 'UTC';
      const localToday = getLocalDate(tz);
      return r.date === localToday;
    });

    if (error) {
      logger.error(' Error fetching reservations:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch reservations',
        details: error.message
      });
    }

    logger.info(` Found ${reservations?.length || 0} confirmed reservations for today`);

    // Batch-fetch restaurant names + voice config for all tenant restaurant_ids
    const uniqueRestaurantIds = [...new Set(
      (reservations || []).map(r => r.restaurant_id).filter(Boolean)
    )];
    const restaurantNameMap = {};
    const restaurantVoiceMap = {}; // { id: { voice_id, language } }
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

      // Fetch voice config for voice note reminders. reminder_voice_notes_enabled
      // is now an explicit opt-in flag (Phase U.2) — having a voice_id alone
      // no longer triggers TTS, because that would fire ~$0.03 of ElevenLabs
      // cost for every reservation reminder at every restaurant with voice
      // configured. The flag defaults to false so existing restaurants get
      // only the free text reminder until they actively opt in.
      const { data: configRows, error: configError } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, voice_id, ai_config, reminder_voice_notes_enabled')
        .in('id', uniqueRestaurantIds);
      if (configError) {
        logger.warn('Error fetching restaurant voice config:', configError);
      }
      for (const row of (configRows || [])) {
        restaurantVoiceMap[row.id] = {
          voice_id: row.voice_id,
          language: row.ai_config?.language || 'en',
          voice_notes_enabled: row.reminder_voice_notes_enabled === true,
        };
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

        // Fire-and-forget: also send a voice note reminder if voice is
        // configured AND the restaurant has opted in. The voice_notes_enabled
        // flag (Phase U.2) gates a ~$0.03/reminder ElevenLabs TTS cost — at
        // 100 restaurants × 5 reminders/day that's $450/mo of TTS spend if
        // left at the previous "any voice_id triggers it" semantics. Now
        // off by default; restaurants can flip it via the voice-settings UI.
        const voiceConfig = restaurantVoiceMap[restaurant_id];
        if (voiceConfig?.voice_id && voiceConfig?.voice_notes_enabled) {
          sendReminderVoiceNote({
            restaurantId: restaurant_id,
            customerPhone: customer_phone,
            customerName: customer_name,
            time: formattedTime,
            restaurantName,
            voiceId: voiceConfig.voice_id,
            language: voiceConfig.language,
          }).catch(err => logger.warn('Voice note reminder failed (non-blocking)', {
            reservation_id,
            error: err.message,
          }));
        }
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
        { errors: failedDetails, date: todayUTC }
      );
    }

    const summary = {
      success: true,
      run_at: new Date().toISOString(),
      date: todayUTC,
      total_reservations: reservations?.length || 0,
      reminders_sent: results.sent,
      reminders_failed: results.failed,
      reminders_skipped: results.skipped,
      high_risk: highRiskResults,
      details: results.details
    };

    logger.info(' Reminder job complete:', JSON.stringify(summary, null, 2));
    await logCronRun('send-reminders', { sent: results.sent, failed: results.failed });

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
