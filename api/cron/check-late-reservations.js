/**
 * Cron Job: Check Late Reservations
 *
 * Automatically marks reservations as "No-Show" if the customer is 20+ minutes late
 * without checking in or communicating with the restaurant.
 *
 * Runs every 5 minutes via Vercel Cron Jobs
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry, captureMessage } = require('../_lib/sentry');
initSentry();

const logger = createSecureLogger('CronLateReservations');
const LATE_THRESHOLD_MINUTES = 20;

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

  if (!supabaseAdmin) {
    logger.error('Supabase admin client not available');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  try {
    logger.info('Starting late reservation check...');

    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
    // Include yesterday UTC to handle restaurants in UTC- timezones (e.g. Americas)
    // where the local date may be one day behind UTC after midnight
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Calculate time 20 minutes ago
    const twentyMinutesAgo = new Date(now.getTime() - LATE_THRESHOLD_MINUTES * 60 * 1000);
    const lateTimeThreshold = twentyMinutesAgo.toTimeString().slice(0, 5); // HH:MM

    logger.info(`Looking for reservations on [${yesterday}, ${today}] with time <= ${lateTimeThreshold}`);

    // Find all "confirmed" reservations for today (and yesterday UTC for non-UTC timezones)
    // that haven't been checked in and whose reservation time was more than 20 minutes ago
    const { data: lateReservations, error } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .in('date', [today, yesterday])
      .eq('status', 'confirmed')
      .lte('time', lateTimeThreshold)
      .is('checked_in_at', null);

    if (error) {
      logger.error('Error fetching reservations:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch reservations',
        details: error.message
      });
    }

    logger.info(`Found ${lateReservations?.length || 0} late reservations`);

    const markedAsNoShow = [];
    const errors = [];

    // Mark each late reservation as no-show
    for (const reservation of (lateReservations || [])) {
      const {
        id: recordId,
        reservation_id: resId,
        customer_name: customerName,
        time,
        table_ids: tableIds
      } = reservation;

      try {
        // Mark as no-show
        const { error: updateError } = await supabaseAdmin
          .from('reservations')
          .update({
            status: 'no-show',
            notes: 'Automatically marked as no-show - 20+ minutes late without check-in'
          })
          .eq('id', recordId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        logger.info(`Marked as no-show: ${resId} (${customerName} at ${time})`);

        // If tables were assigned, release them back to Available status
        if (tableIds && tableIds.length > 0) {
          for (const tableId of tableIds) {
            try {
              const { error: tableError } = await supabaseAdmin
                .from('tables')
                .update({
                  status: 'available',
                  current_service_id: null
                })
                .eq('id', tableId);

              if (tableError) {
                logger.error(`Failed to release table ${tableId}:`, tableError.message);
              } else {
                logger.info(`Released table ${tableId}`);
              }
            } catch (tableError) {
              logger.error(`Failed to release table ${tableId}:`, tableError.message);
            }
          }
        }

        markedAsNoShow.push({
          reservation_id: resId,
          customer_name: customerName,
          time: time,
          tables_released: tableIds?.length || 0
        });
      } catch (error) {
        logger.error(`Failed to mark ${resId} as no-show:`, error.message);
        errors.push({
          reservation_id: resId,
          error: error.message
        });
      }
    }

    if (errors.length > 0) {
      captureMessage(
        `CronLateReservations: ${errors.length} reservation(s) failed to update`,
        'warning',
        { errors, checked_at: now.toISOString() }
      );
    }

    const summary = {
      success: true,
      checked_at: now.toISOString(),
      late_threshold_minutes: LATE_THRESHOLD_MINUTES,
      reservations_checked: lateReservations?.length || 0,
      marked_as_no_show: markedAsNoShow.length,
      errors: errors.length,
      details: {
        no_shows: markedAsNoShow,
        errors: errors
      }
    };

    logger.info('Late reservation check complete', summary);

    return res.status(200).json(summary);
  } catch (error) {
    logger.error('Fatal error checking late reservations:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};
