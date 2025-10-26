/**
 * ML Predictions API Routes
 *
 * Endpoints for no-show prediction
 */

const { predictNoShow, predictBatch, getModelInfo, explainPrediction } = require('../ml/predict');
const { findOrCreateCustomer } = require('../_lib/customer-history');

// ============================================================================
// PREDICTION ENDPOINTS
// ============================================================================

/**
 * POST /api/ml/predict
 *
 * Predict no-show probability for a single reservation
 *
 * Body:
 * {
 *   reservation: {
 *     reservation_id: string,
 *     date: string,
 *     time: string,
 *     party_size: number,
 *     special_requests: string,
 *     booking_created_at: string,
 *     customer_email: string,
 *     customer_phone: string,
 *     customer_name: string
 *   }
 * }
 */
async function handlePredict(req, res) {
  try {
    const { reservation } = req.body;

    if (!reservation) {
      return res.status(400).json({
        error: 'Missing reservation object'
      });
    }

    // Get customer history
    let customerHistory = null;

    if (reservation.customer_email || reservation.customer_phone) {
      customerHistory = await findOrCreateCustomer(
        reservation.customer_email,
        reservation.customer_phone,
        reservation.customer_name || 'Unknown'
      );
    }

    // Make prediction
    const prediction = predictNoShow(reservation, customerHistory);

    return res.json({
      success: true,
      prediction
    });
  } catch (error) {
    console.error('[ML API] Prediction error:', error);

    return res.status(500).json({
      error: error.message
    });
  }
}

/**
 * POST /api/ml/predict-batch
 *
 * Predict no-show probability for multiple reservations
 *
 * Body:
 * {
 *   reservations: [...]
 * }
 */
async function handlePredictBatch(req, res) {
  try {
    const { reservations } = req.body;

    if (!reservations || !Array.isArray(reservations)) {
      return res.status(400).json({
        error: 'Missing or invalid reservations array'
      });
    }

    // Get customer history for all unique customers
    const customerHistoryMap = {};

    for (const reservation of reservations) {
      const email = reservation.customer_email;
      const phone = reservation.customer_phone;

      if ((email || phone) && !customerHistoryMap[email] && !customerHistoryMap[phone]) {
        const history = await findOrCreateCustomer(
          email,
          phone,
          reservation.customer_name || 'Unknown'
        );

        if (email) customerHistoryMap[email] = history;
        if (phone) customerHistoryMap[phone] = history;
      }
    }

    // Make batch predictions
    const predictions = predictBatch(reservations, customerHistoryMap);

    return res.json({
      success: true,
      predictions,
      count: predictions.length
    });
  } catch (error) {
    console.error('[ML API] Batch prediction error:', error);

    return res.status(500).json({
      error: error.message
    });
  }
}

/**
 * GET /api/ml/model-info
 *
 * Get information about the loaded model
 */
function handleModelInfo(req, res) {
  try {
    const info = getModelInfo();

    return res.json({
      success: true,
      model: info
    });
  } catch (error) {
    console.error('[ML API] Model info error:', error);

    return res.status(500).json({
      error: error.message
    });
  }
}

/**
 * POST /api/ml/explain
 *
 * Explain a prediction (feature contributions)
 *
 * Body:
 * {
 *   reservation: {...}
 * }
 */
async function handleExplain(req, res) {
  try {
    const { reservation } = req.body;

    if (!reservation) {
      return res.status(400).json({
        error: 'Missing reservation object'
      });
    }

    // Get customer history
    let customerHistory = null;

    if (reservation.customer_email || reservation.customer_phone) {
      customerHistory = await findOrCreateCustomer(
        reservation.customer_email,
        reservation.customer_phone,
        reservation.customer_name || 'Unknown'
      );
    }

    // Make prediction
    const prediction = predictNoShow(reservation, customerHistory);

    // Get explanation
    const explanation = explainPrediction(prediction.features);

    return res.json({
      success: true,
      prediction: {
        noShowProbability: prediction.noShowProbability,
        noShowRisk: prediction.noShowRisk,
        prediction: prediction.prediction
      },
      explanation,
      topFeatures: explanation.map(f => ({
        feature: f.feature,
        value: f.value,
        importance: f.importance.toFixed(2)
      }))
    });
  } catch (error) {
    console.error('[ML API] Explanation error:', error);

    return res.status(500).json({
      error: error.message
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  handlePredict,
  handlePredictBatch,
  handleModelInfo,
  handleExplain
};
