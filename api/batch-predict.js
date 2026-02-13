/**
 * Batch ML Prediction Endpoint
 *
 * Predicts no-show risk for multiple upcoming reservations
 * Useful for populating ML fields for existing reservations
 *
 * TODO: Multi-tenancy - This is a cron/background job. It needs to iterate
 * over ALL restaurants and run predictions for each. For now, it accepts
 * a restaurant_id query parameter or auth token. A full implementation
 * should fetch all active restaurant IDs and loop over them.
 */

const { getUpcomingReservations, updateReservation } = require('./_lib/supabase');
const { getCustomerStats } = require('./_lib/customer-history');
const { predictNoShow } = require('./ml/predict');
const { verifyAuth } = require('./_lib/auth');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ message: 'OK' });
  }

  try {
    // TODO: For true cron usage, this should iterate over all restaurants.
    // For now, get restaurantId from auth or query param.
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

    console.log('🔮 Starting batch prediction for upcoming reservations...');

    // Get all upcoming reservations (timezone from auth, defaults to UTC)
    const timezone = req.user?.timezone || 'UTC';
    const reservationsResult = await getUpcomingReservations(restaurantId, timezone);

    if (!reservationsResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch upcoming reservations'
      });
    }

    const reservations = reservationsResult.reservations;
    console.log(`📊 Found ${reservations.length} upcoming reservations`);

    // Filter to reservations that don't have ML predictions yet
    const needsPrediction = reservations.filter(r =>
      !r.no_show_risk_score && !r.no_show_risk_level
    );

    console.log(`🎯 ${needsPrediction.length} reservations need predictions`);

    if (needsPrediction.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'All reservations already have predictions',
        total_reservations: reservations.length,
        predictions_made: 0,
        already_predicted: reservations.length
      });
    }

    const results = [];
    const errors = [];

    // Process each reservation
    for (const reservation of needsPrediction) {
      try {
        console.log(`  Processing: ${reservation.customer_name} (${reservation.reservation_id})`);

        // Get customer history
        const customerHistory = await getCustomerStats(
          reservation.customer_email,
          reservation.customer_phone
        );

        // Create reservation object for prediction
        const reservationForPrediction = {
          reservation_id: reservation.reservation_id,
          date: reservation.date,
          time: reservation.time,
          party_size: reservation.party_size,
          customer_name: reservation.customer_name,
          customer_phone: reservation.customer_phone,
          customer_email: reservation.customer_email || '',
          special_requests: reservation.special_requests || '',
          booking_created_at: new Date().toISOString(), // Approximate
          is_special_occasion: false,
          confirmation_sent_at: new Date().toISOString(),
          confirmation_clicked: false
        };

        // Get prediction
        const prediction = await predictNoShow(reservationForPrediction, customerHistory);

        // Update reservation with ML fields
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

        console.log(`  ✅ Predicted: ${reservation.customer_name} - ${mlFields['ML Risk Level']} (${mlFields['ML Risk Score']}%)`);

      } catch (error) {
        console.error(`  ❌ Error predicting ${reservation.reservation_id}:`, error);
        errors.push({
          reservation_id: reservation.reservation_id,
          customer_name: reservation.customer_name,
          error: error.message
        });
      }
    }

    console.log(`✅ Batch prediction complete: ${results.length} successful, ${errors.length} errors`);

    return res.status(200).json({
      success: true,
      message: `Batch prediction complete`,
      total_reservations: reservations.length,
      predictions_made: results.length,
      already_predicted: reservations.length - needsPrediction.length,
      errors: errors.length,
      results: results,
      error_details: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('❌ Batch prediction error:', error);
    return res.status(500).json({
      success: false,
      error: 'Batch prediction failed',
      message: error.message
    });
  }
};
