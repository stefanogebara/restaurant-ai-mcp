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
const { getCustomerStats } = require('./_lib/customer-history');
const { predictNoShow } = require('./ml/predict');
const { verifyAuth } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('BatchPredict');

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

  // Batch fetch customer stats in parallel (fixes N+1 query pattern)
  const customerStatsMap = new Map();
  const statsPromises = needsPrediction.map(async (reservation) => {
    const key = `${reservation.customer_email || ''}|${reservation.customer_phone}`;
    if (!customerStatsMap.has(key)) {
      try {
        const stats = await getCustomerStats(reservation.customer_email, reservation.customer_phone);
        customerStatsMap.set(key, stats);
      } catch {
        customerStatsMap.set(key, null);
      }
    }
  });
  await Promise.all(statsPromises);

  const results = [];
  const errors = [];

  // Process predictions sequentially (writes depend on each other for rate limiting)
  for (const reservation of needsPrediction) {
    try {
      const key = `${reservation.customer_email || ''}|${reservation.customer_phone}`;
      const customerHistory = customerStatsMap.get(key) || {};

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

      results.push({
        reservation_id: reservation.reservation_id,
        customer_name: reservation.customer_name,
        risk_score: mlFields['ML Risk Score'],
        risk_level: mlFields['ML Risk Level'],
        success: true
      });

    } catch (error) {
      errors.push({
        reservation_id: reservation.reservation_id,
        customer_name: reservation.customer_name,
        error: error.message
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ message: 'OK' });
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

    const authResult = await verifyAuth(req, { required: false });
    if (authResult.user) {
      req.user = authResult.user;
      restaurantId = req.user.restaurant_id || restaurantId;
    }

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'Missing restaurant_id. Provide via query parameter or authentication.'
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
      message: error.message
    });
  }
};
