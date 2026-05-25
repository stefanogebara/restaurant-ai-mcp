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
const { localToUtcDate } = require('../_lib/timezone');
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
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD (UTC)
    // Include yesterday UTC to handle restaurants in UTC- timezones (e.g. Americas)
    // where the local date may be one day behind UTC after midnight
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // V.2 timezone fix.
    //
    // The previous query computed lateTimeThreshold = `now - 20 min` in
    // LAMBDA local time (which is UTC on Vercel), then filtered the DB
    // with `.lte('time', lateTimeThreshold)`. The `time` column stores
    // each reservation's LOCAL time-of-day, so the comparison was
    // mixing two different clocks. Concrete bug: a São Paulo restaurant
    // (UTC-3) booking at 21:00 local = 00:00 UTC next day; at 21:21
    // local (00:21 UTC) the threshold was '00:01' UTC and the query
    // filter `time <= '00:01'` against the stored `time='21:00'` failed
    // → reservation never flagged late.
    //
    // Fix: drop the time filter from the DB query (fetch ALL confirmed
    // unchecked reservations for today/yesterday), then per-row build
    // the UTC instant from (date, time, restaurant_timezone) and
    // compare against `now`. Cron fires every 15 minutes, candidate
    // set per tick is small (a handful of reservations per active
    // restaurant), so the wider fetch is cheap.
    logger.info(`Looking for reservations on [${yesterday}, ${today}] across all restaurants`);

    const { data: candidateReservations, error } = await supabaseAdmin
      .from('reservations')
      .select('id, reservation_id, customer_name, time, table_ids, restaurant_id, status, date')
      .in('date', [today, yesterday])
      .eq('status', 'confirmed')
      .is('checked_in_at', null);

    if (error) {
      logger.error('Error fetching reservations:', error.message);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch reservations'
      });
    }

    // Pull each involved restaurant's timezone in one batch. Default to
    // UTC for any row missing a configured tz — that matches the
    // pre-fix behaviour for those restaurants instead of silently
    // mis-flagging them.
    const restaurantIds = [...new Set((candidateReservations || []).map((r) => r.restaurant_id))];
    const timezoneByRestaurant = {};
    if (restaurantIds.length > 0) {
      const { data: tzRows } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_info')
        .select('id, timezone')
        .in('id', restaurantIds);
      for (const row of (tzRows || [])) {
        timezoneByRestaurant[row.id] = row.timezone || 'UTC';
      }
    }

    // Now filter to TRULY-late rows: reservation_at_utc <= now - 20 min.
    const lateThresholdMs = now.getTime() - LATE_THRESHOLD_MINUTES * 60 * 1000;
    const lateReservations = (candidateReservations || []).filter((r) => {
      const tz = timezoneByRestaurant[r.restaurant_id] || 'UTC';
      try {
        const reservationUtc = localToUtcDate(r.date, r.time, tz);
        return reservationUtc.getTime() <= lateThresholdMs;
      } catch {
        // Malformed date/time/tz — skip (don't mass-no-show on bad data).
        return false;
      }
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
        const { error: updateError } = await supabaseAdmin
          .from('reservations')
          .update({
            status: 'no-show',
            notes: 'Automatically marked as no-show - 20+ minutes late without check-in'
          })
          .eq('id', recordId)
          .eq('restaurant_id', reservationRestaurantId);

        if (updateError) {
          throw new Error(updateError.message);
        }

        logger.info(`Marked as no-show: ${resId} (${customerName} at ${time})`);

        // If tables were assigned, release them back to Available status (batched, scoped by restaurant_id)
        if (tableIds && tableIds.length > 0) {
          try {
            const { error: tableError } = await supabaseAdmin
              .from('tables')
              .update({
                status: 'available',
                current_service_id: null
              })
              .in('id', tableIds)
              .eq('restaurant_id', reservationRestaurantId);

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
