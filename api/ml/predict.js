/**
 * No-Show Prediction Service
 *
 * Loads trained model and makes predictions on new reservations
 */

const { extractAllFeatures } = require('./features');

// Import inline model data (serverless-compatible)
const MODEL_DATA = require('./model-data');

// ============================================================================
// MODEL LOADING
// ============================================================================

let MODEL = null;
let MODEL_METADATA = null;

/**
 * Load trained model (from inline data)
 */
function loadModel() {
  if (MODEL) {
    return MODEL; // Already loaded
  }

  try {
    console.log('[ML] Loading no-show prediction model...');

    // Use inline model data (no file system access needed)
    MODEL_METADATA = {
      trainedAt: MODEL_DATA.trainedAt,
      version: MODEL_DATA.version,
      featureNames: MODEL_DATA.featureNames,
      type: MODEL_DATA.type
    };

    MODEL = MODEL_DATA.model;

    console.log('[ML] Model loaded successfully (inline data)');
    console.log(`[ML] Version: ${MODEL_METADATA.version}`);
    console.log(`[ML] Trained: ${MODEL_METADATA.trainedAt}`);

    return MODEL;
  } catch (error) {
    console.error('[ML] Failed to load model:', error.message);
    return null;
  }
}

/**
 * Reload model (useful after retraining)
 */
function reloadModel() {
  MODEL = null;
  MODEL_METADATA = null;
  return loadModel();
}

// ============================================================================
// PREDICTION
// ============================================================================

/**
 * Predict no-show probability for a reservation
 *
 * @param {Object} reservation - Reservation object
 * @param {Object} customerHistory - Customer history object (optional)
 * @returns {Object} - { noShowProbability, noShowRisk, features, metadata }
 */
function predictNoShow(reservation, customerHistory = null) {
  try {
    // 1. Load model if not loaded
    const model = loadModel();

    if (!model) {
      return {
        error: 'Model not available',
        noShowProbability: 0.5, // Default: 50% (unknown)
        noShowRisk: 'medium', // Fallback to medium risk
        confidence: 0.0, // No confidence without model
        metadata: {
          modelVersion: '1.0.0',
          modelTrainedAt: 'unknown',
          predictedAt: new Date().toISOString()
        }
      };
    }

    // 2. Extract features
    const features = extractAllFeatures(reservation, customerHistory);

    // 3. Prepare feature vector
    const featureVector = MODEL_METADATA.featureNames.map(name => features[name]);

    // 4. Make prediction
    const prediction = model.predict ? model.predict(featureVector) : simplePred(featureVector, model);

    // 5. Convert to probability (0-1)
    // For binary classification, prediction is 0 or 1
    // We can add confidence scores if needed
    const noShowProbability = prediction === 1 ? 0.75 : 0.25; // Simplified

    // 6. Determine risk level
    const noShowRisk = calculateRiskLevel(noShowProbability);

    // 7. Return prediction result
    return {
      noShowProbability,
      noShowRisk,
      prediction: prediction === 1 ? 'no-show' : 'will-attend',
      confidence: Math.abs(noShowProbability - 0.5) * 2, // 0-1 scale
      features,
      metadata: {
        modelVersion: MODEL_METADATA.version,
        modelTrainedAt: MODEL_METADATA.trainedAt,
        predictedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('[ML] Prediction error:', error.message);

    return {
      error: error.message,
      noShowProbability: 0.5,
      noShowRisk: 'medium', // Fallback to medium risk
      confidence: 0.0, // No confidence on error
      metadata: {
        modelVersion: '1.0.0',
        modelTrainedAt: 'unknown',
        predictedAt: new Date().toISOString()
      }
    };
  }
}

/**
 * Simple prediction function for fallback
 */
function simplePred(featureVector, model) {
  if (!model.featureImportance) {
    // Fallback: use booking lead time
    const leadTime = featureVector[0];
    return leadTime > 48 ? 1 : 0;
  }

  let score = 0;
  for (let i = 0; i < featureVector.length; i++) {
    score += featureVector[i] * model.featureImportance[i];
  }

  return score > 0 ? 1 : 0;
}

/**
 * Calculate risk level from probability
 */
function calculateRiskLevel(probability) {
  if (probability < 0.25) return 'low';
  if (probability < 0.50) return 'medium';
  if (probability < 0.75) return 'high';
  return 'very-high';
}

// ============================================================================
// BATCH PREDICTION
// ============================================================================

/**
 * Predict no-show for multiple reservations
 *
 * @param {Array} reservations - Array of reservation objects
 * @param {Object} customerHistoryMap - Map of email/phone -> customer history
 * @returns {Array} - Array of prediction results
 */
function predictBatch(reservations, customerHistoryMap = {}) {
  const results = [];

  for (const reservation of reservations) {
    const email = reservation.customer_email || reservation['Customer Email'];
    const phone = reservation.customer_phone || reservation['Customer Phone'];

    const customerHistory = customerHistoryMap[email] || customerHistoryMap[phone] || null;

    const prediction = predictNoShow(reservation, customerHistory);

    results.push({
      reservation_id: reservation.reservation_id || reservation['Reservation ID'],
      ...prediction
    });
  }

  return results;
}

// ============================================================================
// MODEL INFO
// ============================================================================

/**
 * Get model information
 */
function getModelInfo() {
  const model = loadModel();

  if (!model) {
    return {
      available: false,
      error: 'Model not loaded'
    };
  }

  return {
    available: true,
    version: MODEL_METADATA.version,
    trainedAt: MODEL_METADATA.trainedAt,
    type: MODEL_METADATA.type,
    features: MODEL_METADATA.featureNames.length,
    notes: 'Proof-of-concept model. Use Python XGBoost for production.'
  };
}

// ============================================================================
// EXPLANATION
// ============================================================================

/**
 * Explain prediction (feature contributions)
 *
 * @param {Object} features - Feature vector object
 * @returns {Array} - Top contributing features
 */
function explainPrediction(features) {
  const model = loadModel();

  if (!model || !model.featureImportance) {
    return [];
  }

  // Get feature importance scores
  const featureContributions = [];

  for (let i = 0; i < MODEL_METADATA.featureNames.length; i++) {
    const featureName = MODEL_METADATA.featureNames[i];
    const featureValue = features[featureName];
    const importance = model.featureImportance[i];

    featureContributions.push({
      feature: featureName,
      value: featureValue,
      importance: importance,
      contribution: featureValue * importance
    });
  }

  // Sort by absolute contribution
  featureContributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  // Return top 5
  return featureContributions.slice(0, 5);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  predictNoShow,
  predictBatch,
  getModelInfo,
  explainPrediction,
  loadModel,
  reloadModel
};
