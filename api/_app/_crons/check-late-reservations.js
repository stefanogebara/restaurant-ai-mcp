/**
 * Cron Job: Check Late Reservations
 *
 * Automatically marks reservations as "No-Show" if the customer is 20+ minutes late
 * without checking in or communicating with the restaurant.
 *
 * Runs every 15 minutes via Vercel Cron Jobs
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry, captureMessage } = require('../_lib/sentry');
const { logCronRun } = require('../_lib/cron-tracker');
const { localSlotToInstant } = require('../_lib/timezone');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');
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
  if (!bearerEquals(authHeader, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!supabaseAdmin) {
    logger.error('Supabase admin client not available');
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  // Phase U.3 kill switch — every-15-min fire so ops needs a quick way
  // to stop it if it starts mass-flagging valid reservations as no-show.
  if (!(await isCronEnabled('check-late-reservations'))) {
    logger.warn('check-late-reservations cron disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    logger.info('Starting late reservation check...');

    const now = new Date();
    // Include both neighboring UTC days for restaurants across midnight.
    // Only the restaurant's local date and time can establish lateness.
    const candidateDates = [-1, 0, 1].map(offset => (
      new Date(now.getTime() + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    ));
    const { data: candidateReservations, error } = await supabaseAdmin
      .from('reservations')
      .select('id, reservation_id, customer_name, time, table_ids, restaurant_id, status, date')
      .in('date', candidateDates)
      .eq('status', 'confirmed')
      .is('checked_in_at', null);

    if (error) {
      logger.error('Error fetching reservations:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch reservations'
      });
    }

    // Missing or invalid timezones are skipped, since guessing can flag a
    // guest before their reservation time.
    const restaurantIds = [...new Set((candidateReservations || []).map((r) => r.restaurant_id))];
    const timezoneByRestaurant = {};
    if (restaurantIds.length > 0) {
      const { data: tzRows, error: tzError } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, timezone')
        .in('id', restaurantIds);
      if (tzError) {
        // Sem fuso não dá pra decidir atraso: marcar no-show com timezone
        // errado é pior que não marcar. Aborta o ciclo; o próximo tenta.
        logger.error('Falha ao buscar timezones — ciclo abortado para não marcar no-show errado', {
          error: tzError.message,
        });
        return res.status(500).json({ success: false, error: 'timezone_lookup_failed' });
      }
      for (const row of (tzRows || [])) {
        timezoneByRestaurant[row.id] = row.timezone;
      }
    }

    // PostgREST sends PostgreSQL time values with seconds. Keep that
    // precision so the 20-minute threshold cannot fire early.
    const lateThresholdMs = now.getTime() - LATE_THRESHOLD_MINUTES * 60 * 1000;
    const lateReservations = (candidateReservations || []).filter((r) => {
      const timezone = timezoneByRestaurant[r.restaurant_id];
      const time = typeof r.time === 'string' && r.time.match(/^(\d{2}:\d{2})(?::([0-5]\d(?:\.\d+)?))?$/);
      if (!timezone || !time) return false;
      const instant = localSlotToInstant(r.date, time[1], timezone);
      return instant !== null && instant.getTime() + Number(time[2] || 0) * 1000 <= lateThresholdMs;
    });

    logger.info(`Found ${lateReservations.length} late reservations (timezone-aware)`);

    const markedAsNoShow = [];
    const errors = [];

    // Mark each late reservation as no-show
    for (const reservation of (lateReservations || [])) {
      const {
        id: recordId,
        reservation_id: resId,
        customer_name: customerName,
        time,
        table_ids: tableIds,
        restaurant_id: reservationRestaurantId
      } = reservation;

      try {
        // Mark as no-show
        // SEC-H2: Add restaurant_id filter as defense-in-depth alongside the PK match
        const { data: updated, error: updateError } = await supabaseAdmin
          .from('reservations')
          .update({
            status: 'no-show',
            notes: 'Automatically marked as no-show - 20+ minutes late without check-in'
          })
          .eq('id', recordId)
          .eq('restaurant_id', reservationRestaurantId)
          .eq('status', 'confirmed').is('checked_in_at', null)
          .eq('date', reservation.date).eq('time', time).select('id').maybeSingle();

        if (updateError) {
          throw new Error(updateError.message);
        }

        if (!updated) continue;

        logger.info(`Marked as no-show: ${resId} (${customerName} at ${time})`);

        // Release assigned tables only while reserved. A late arrival may
        // have occupied the table after we marked the no-show.
        if (tableIds && tableIds.length > 0) {
          try {
            const { error: tableError } = await supabaseAdmin
              .from('tables')
              .update({
                status: 'available',
                current_service_id: null
              })
              .in('id', tableIds)
              .eq('restaurant_id', reservationRestaurantId).eq('status', 'reserved');

            if (tableError) {
              logger.error(`Failed to release tables [${tableIds.join(', ')}]:`, tableError.message);
            } else {
              logger.info(`Released ${tableIds.length} table(s) [${tableIds.join(', ')}] for restaurant ${reservationRestaurantId}`);
            }
          } catch (tableError) {
            logger.error(`Failed to release tables [${tableIds.join(', ')}]:`, tableError.message);
          }
        }

        markedAsNoShow.push({
          reservation_id: resId,
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
    await logCronRun('check-late-reservations', { marked: markedAsNoShow.length, errors: errors.length });

    return res.status(200).json(summary);
  } catch (error) {
    logger.error('Fatal error checking late reservations:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};
