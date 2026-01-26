/**
 * Cron Job: Send Reservation Reminders
 *
 * Sends WhatsApp template reminders to customers with reservations scheduled for today.
 * Uses Twilio Content Templates for WhatsApp messaging.
 *
 * Runs daily at 9 AM via Vercel Cron Jobs
 */

const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');
const { createSecureLogger } = require('../_lib/secure-logger');
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

    console.log(`[CRON] Sending template ${contentSid} to ${to}`);

    const result = await client.messages.create({
      from: fromNumber,
      to: toNumber,
      contentSid: contentSid,
      contentVariables: JSON.stringify(contentVariables)
    });

    console.log(`[CRON] Template sent to ${to}, messageId: ${result.sid}`);
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
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Initialize Supabase client
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.error(' Missing Supabase credentials');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    logger.info(' Starting reservation reminder job...');

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    console.log(`[CRON] Looking for reservations on ${today}`);

    // Get restaurant info for the restaurant name
    const { data: restaurantInfo, error: restaurantError } = await supabase
      .from('restaurant_info')
      .select('restaurant_name')
      .limit(1)
      .single();

    if (restaurantError) {
      logger.error(' Error fetching restaurant info:', restaurantError);
    }

    const restaurantName = restaurantInfo?.restaurant_name || 'the restaurant';

    // Find all confirmed reservations for today that have a phone number
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('date', today)
      .eq('status', 'confirmed')
      .not('customer_phone', 'is', null);

    if (error) {
      logger.error(' Error fetching reservations:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch reservations',
        details: error.message
      });
    }

    console.log(`[CRON] Found ${reservations?.length || 0} confirmed reservations for today`);

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
        reservation_id
      } = reservation;

      // Skip if no phone number
      if (!customer_phone) {
        console.log(`[CRON] Skipping ${reservation_id} - no phone number`);
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
        console.log(`[CRON] ✓ Reminder sent to ${customer_name} (${customer_phone})`);
        results.sent++;
        results.details.push({
          reservation_id,
          customer_name,
          status: 'sent',
          messageId: sendResult.messageId
        });
      } else {
        console.error(`[CRON] ✗ Failed to send reminder to ${customer_name}:`, sendResult.error);
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

    const summary = {
      success: true,
      run_at: new Date().toISOString(),
      date: today,
      total_reservations: reservations?.length || 0,
      reminders_sent: results.sent,
      reminders_failed: results.failed,
      reminders_skipped: results.skipped,
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
