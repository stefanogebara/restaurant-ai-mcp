/**
 * Batch ML Prediction Endpoint
 *
 * Predicts no-show risk for multiple upcoming reservations.
 *
 * Two modes:
 *   1. Cron mode (CRON_SECRET auth) – iterates ALL active restaurants
 *   2. Single-restaurant mode (JWT or query param) – one restaurant only
 */

const { getUpcomingReservations, updateReservation, supabaseAdmin } = require('./_lib/supabase');
const { predictNoShow } = require('./_ml/predict');
const { verifyAuth } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');

const logger = createSecureLogger('BatchPredict');

const DEFAULT_CUSTOMER_STATS = {
  is_repeat_customer: false,
  total_reservations: 0,
  completed_reservations: 0,
  no_show_count: 0,
  no_show_rate: 0.15,
  cancellation_count: 0,
  average_party_size: 0,
  days_since_last_visit: null,
  vip_status: false,
  customer_id: null
};

/**
 * Convert a raw customer_history row into the stats format used by ml/features.js.
 */
function toCustomerStats(data) {
  const totalReservations = (data.total_visits || 0) + (data.total_no_shows || 0) + (data.total_cancellations || 0);
  const noShowRate = totalReservations > 0
    ? (data.total_no_shows || 0) / totalReservations
    : 0.15;

  return {
    is_repeat_customer: (data.total_visits || 0) > 0,
    total_reservations: totalReservations,
    completed_reservations: data.total_visits || 0,
    no_show_count: data.total_no_shows || 0,
    no_show_rate: parseFloat(noShowRate.toFixed(3)),
    cancellation_count: data.total_cancellations || 0,
    average_party_size: data.average_party_size || 0,
    days_since_last_visit: data.last_visit_date
      ? Math.ceil(Math.abs(new Date() - new Date(data.last_visit_date)) / (1000 * 60 * 60 * 24))
      : null,
    vip_status: data.vip_status || false,
    customer_id: data.id || null
  };
}

/**
 * Batch-fetch customer stats for a list of reservations in 2 queries (phone + email).
 * Returns a Map keyed by reservation record_id → stats object.
 */
async function batchGetCustomerStats(reservations, restaurantId) {
  const statsMap = new Map();

  // Initialize all with defaults
  for (const r of reservations) {
    statsMap.set(r.record_id, DEFAULT_CUSTOMER_STATS);
  }

  try {
    // Collect unique phones and emails
    const phones = [...new Set(reservations.map(r => r.customer_phone).filter(Boolean))];
    const emails = [...new Set(reservations.map(r => r.customer_email).filter(Boolean))];

    // Batch-fetch by phone and email in parallel
    const [phoneResult, emailResult] = await Promise.all([
      phones.length > 0
        ? supabaseAdmin
            .from('customer_history')
            .select('id, customer_phone, customer_email, total_visits, total_no_shows, total_cancellations, average_party_size, last_visit_date, vip_status, restaurant_id')
            .in('customer_phone', phones)
            .eq('restaurant_id', restaurantId)
        : { data: [], error: null },
      emails.length > 0
        ? supabaseAdmin
            .from('customer_history')
            .select('id, customer_phone, customer_email, total_visits, total_no_shows, total_cancellations, average_party_size, last_visit_date, vip_status, restaurant_id')
            .in('customer_email', emails)
            .eq('restaurant_id', restaurantId)
        : { data: [], error: null },
    ]);

    // Build lookup maps: identifier → customer_history row
    const byPhone = new Map();
    if (!phoneResult.error && phoneResult.data) {
      for (const row of phoneResult.data) {
        byPhone.set(row.customer_phone, row);
      }
    }

    const byEmail = new Map();
    if (!emailResult.error && emailResult.data) {
      for (const row of emailResult.data) {
        byEmail.set(row.customer_email, row);
      }
    }

    // Match each reservation: prefer phone match, fall back to email
    for (const r of reservations) {
      const row = (r.customer_phone && byPhone.get(r.customer_phone))
        || (r.customer_email && byEmail.get(r.customer_email));
      if (row) {
        statsMap.set(r.record_id, toCustomerStats(row));
      }
    }
  } catch (error) {
    logger.error('Error batch-fetching customer stats:', error.message);
    // statsMap already has defaults for every reservation
  }

  return statsMap;
}

/**
 * Fetch all active restaurant IDs from restaurant_config.
 */
async function getAllActiveRestaurantIds() {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, timezone');

  if (error) {
    logger.error('Failed to fetch restaurant list:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Run predictions for a single restaurant.
 * Returns { predictions_made, already_predicted, total, errors[] }
 */
async function predictForRestaurant(restaurantId, timezone = 'UTC') {
  const reservationsResult = await getUpcomingReservations(restaurantId, timezone);

  if (!reservationsResult.success) {
    return { predictions_made: 0, already_predicted: 0, total: 0, errors: ['Failed to fetch reservations'] };
  }

  const reservations = reservationsResult.reservations;
  const needsPrediction = reservations.filter(r =>
    !r.no_show_risk_score && !r.no_show_risk_level
  );

  if (needsPrediction.length === 0) {
    return { predictions_made: 0, already_predicted: reservations.length, total: reservations.length, errors: [] };
  }

  // Batch-fetch all customer stats in 2 queries instead of N sequential calls
  const customerStatsMap = await batchGetCustomerStats(needsPrediction, restaurantId);

  // Run predictions + updates in parallel with error isolation
  const settled = await Promise.allSettled(
    needsPrediction.map(async (reservation) => {
      const customerHistory = customerStatsMap.get(reservation.record_id) || DEFAULT_CUSTOMER_STATS;

      const reservationForPrediction = {
        reservation_id: reservation.reservation_id,
        date: reservation.date,
        time: reservation.time,
        party_size: reservation.party_size,
        customer_name: reservation.customer_name,
        customer_phone: reservation.customer_phone,
        customer_email: reservation.customer_email || '',
        special_requests: reservation.special_requests || '',
        booking_created_at: new Date().toISOString(),
        is_special_occasion: false,
        confirmation_sent_at: new Date().toISOString(),
        confirmation_clicked: false
      };

      const prediction = await predictNoShow(reservationForPrediction, customerHistory);

      const mlFields = {
        'ML Risk Score': Math.round(prediction.noShowProbability * 100),
        'ML Risk Level': prediction.noShowRisk,
        'ML Confidence': Math.round(prediction.confidence * 100),
        'ML Model Version': prediction.metadata?.modelVersion || '1.0.0',
        'ML Prediction Timestamp': new Date().toISOString()
      };

      await updateReservation(restaurantId, reservation.record_id, mlFields);

      return {
        reservation_id: reservation.reservation_id,
        customer_name: reservation.customer_name,
        risk_score: mlFields['ML Risk Score'],
        risk_level: mlFields['ML Risk Level'],
        success: true
      };
    })
  );

  const results = [];
  const errors = [];

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i];
    if (outcome.status === 'fulfilled') {
      results.push(outcome.value);
    } else {
      errors.push({
        reservation_id: needsPrediction[i].reservation_id,
        customer_name: needsPrediction[i].customer_name,
        error: outcome.reason?.message || 'Unknown error'
      });
    }
  }

  return {
    predictions_made: results.length,
    already_predicted: reservations.length - needsPrediction.length,
    total: reservations.length,
    errors,
    results
  };
}

module.exports = async (req, res) => {
  // Enable CORS
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Determine mode: cron (all restaurants) vs single-restaurant
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization;
    const isCron = cronSecret && authHeader === `Bearer ${cronSecret}`;

    // ---- Cron mode: iterate ALL restaurants ----
    if (isCron) {
      logger.info('Cron mode: running batch predictions for all restaurants');
      const restaurants = await getAllActiveRestaurantIds();
      logger.info(`Found ${restaurants.length} active restaurants`);

      const summary = { restaurants_processed: 0, total_predictions: 0, total_errors: 0, details: [] };

      for (const restaurant of restaurants) {
        const result = await predictForRestaurant(restaurant.id, restaurant.timezone || 'UTC');
        summary.restaurants_processed++;
        summary.total_predictions += result.predictions_made;
        summary.total_errors += result.errors.length;
        if (result.predictions_made > 0 || result.errors.length > 0) {
          summary.details.push({ restaurant_id: restaurant.id, ...result, results: undefined });
        }
      }

      logger.info(`Cron batch complete: ${summary.total_predictions} predictions across ${summary.restaurants_processed} restaurants`);
      return res.status(200).json({ success: true, mode: 'cron', ...summary });
    }

    // ---- Single-restaurant mode ----
    let restaurantId = req.query.restaurant_id;

    const authResult = await verifyAuth(req, { required: true });
    if (!authResult.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    req.user = authResult.user;
    restaurantId = req.user.restaurant_id || restaurantId;

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'Missing restaurant_id.'
      });
    }

    logger.info('Single-restaurant mode for', restaurantId);
    const timezone = req.user?.timezone || 'UTC';
    const result = await predictForRestaurant(restaurantId, timezone);

    logger.info(`Predictions complete: ${result.predictions_made} made, ${result.errors.length} errors`);

    return res.status(200).json({
      success: true,
      mode: 'single',
      restaurant_id: restaurantId,
      total_reservations: result.total,
      predictions_made: result.predictions_made,
      already_predicted: result.already_predicted,
      errors: result.errors.length,
      results: result.results,
      error_details: result.errors.length > 0 ? result.errors : undefined
    });

  } catch (error) {
    logger.error('Batch prediction error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Batch prediction failed',
      message: 'Something went wrong. Please try again.'
    });
  }
};
