/**
 * ML Prediction API - XGBoost No-Show Prediction Endpoint
 * Loads trained XGBoost model and provides real-time no-show predictions
 * Model: v2.0-xgboost-hotel-trained (ROC AUC: 0.86)
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Model metadata
const MODEL_VERSION = 'v2.0-xgboost-hotel-trained';
const MODEL_PATH = path.join(process.cwd(), 'ml_models', 'restaurant_noshow_xgboost.json');
const METADATA_PATH = path.join(process.cwd(), 'ml_models', 'model_metadata.json');

/**
 * Validate that model exists and load metadata
 */
function loadModelMetadata() {
  try {
    if (!fs.existsSync(MODEL_PATH)) {
      throw new Error('XGBoost model file not found. Run training script first.');
    }

    if (!fs.existsSync(METADATA_PATH)) {
      throw new Error('Model metadata not found');
    }

    const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
    return metadata;
  } catch (error) {
    console.error('Error loading model metadata:', error);
    throw error;
  }
}

/**
 * Extract features from reservation data for model prediction
 * Maps restaurant reservation features to hotel booking training features
 */
function extractFeatures(reservationData) {
  const {
    party_size = 2,
    booking_lead_time_hours = 24,
    customer_no_show_rate = 0,
    is_repeat_customer = false,
    has_special_requests = false,
    special_request_count = 0,
    booking_changes_count = 0,
    has_deposit = false,
    is_tourist = false,
    is_travel_agency = false,
    reservation_date = new Date().toISOString(),
    reservation_time = '19:00'
  } = reservationData;

  // Parse date and time
  const resDate = new Date(reservation_date);
  const month_num = resDate.getMonth() + 1;
  const dayOfWeek = resDate.getDay();

  // Time-based features
  const is_weekend = (dayOfWeek === 5 || dayOfWeek === 6) ? 1 : 0;
  const hour = parseInt(reservation_time.split(':')[0]);
  const is_prime_time = (hour >= 18 && hour <= 21) ? 1 : 0;

  // Default values for hotel-specific features (not available for restaurants)
  const has_waiting_list = 0;
  const stays_in_weekend_nights = 0;
  const stays_in_week_nights = 0;

  // Return features in exact order expected by model
  return {
    booking_lead_time_hours: parseFloat(booking_lead_time_hours),
    month_num: parseInt(month_num),
    is_weekend: parseInt(is_weekend),
    is_prime_time: parseInt(is_prime_time),
    party_size: parseInt(party_size),
    is_tourist: parseInt(is_tourist ? 1 : 0),
    is_travel_agency: parseInt(is_travel_agency ? 1 : 0),
    is_repeat_customer: parseInt(is_repeat_customer ? 1 : 0),
    customer_no_show_rate: parseFloat(customer_no_show_rate),
    has_special_requests: parseInt(has_special_requests ? 1 : 0),
    special_request_count: parseInt(special_request_count),
    booking_changes_count: parseInt(booking_changes_count),
    has_deposit: parseInt(has_deposit ? 1 : 0),
    has_waiting_list: parseInt(has_waiting_list),
    stays_in_weekend_nights: parseInt(stays_in_weekend_nights),
    stays_in_week_nights: parseInt(stays_in_week_nights)
  };
}

/**
 * Run XGBoost prediction via Python subprocess
 */
async function runPrediction(features) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(process.cwd(), 'scripts', 'predict.py');

    // Spawn Python process
    const python = spawn('python', [pythonScript]);

    let stdout = '';
    let stderr = '';

    // Send features as JSON to stdin
    python.stdin.write(JSON.stringify(features));
    python.stdin.end();

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Python prediction failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse prediction result: ${error.message}`));
      }
    });

    python.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });
  });
}

/**
 * Calculate risk level from probability score
 */
function getRiskLevel(probability) {
  if (probability >= 0.7) return 'very-high';
  if (probability >= 0.5) return 'high';
  if (probability >= 0.3) return 'medium';
  return 'low';
}

/**
 * Generate recommendations based on risk level
 */
function getRecommendations(riskLevel, probability) {
  const recommendations = [];

  if (riskLevel === 'very-high') {
    recommendations.push('URGENT: Call customer immediately to confirm');
    recommendations.push('Require credit card deposit or prepayment');
    recommendations.push('Add to priority monitoring list');
    recommendations.push('Have backup waitlist ready');
  } else if (riskLevel === 'high') {
    recommendations.push('Send confirmation reminder 24 hours before');
    recommendations.push('Require credit card deposit');
    recommendations.push('Call to confirm 2 hours before reservation');
  } else if (riskLevel === 'medium') {
    recommendations.push('Send automated SMS reminder 24h before');
    recommendations.push('Confirm via email 48 hours before');
  } else {
    recommendations.push('Standard confirmation email');
  }

  return recommendations;
}

/**
 * Main API handler
 */
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  // Health check
  if (req.method === 'GET') {
    try {
      const metadata = loadModelMetadata();
      return res.status(200).json({
        success: true,
        model_version: MODEL_VERSION,
        status: 'ready',
        roc_auc_score: metadata.roc_auc_score,
        training_date: metadata.training_date,
        dataset_size: metadata.dataset_size,
        features_count: metadata.features.length,
        endpoint: '/api/ml-predict',
        methods: ['POST'],
        description: 'XGBoost no-show prediction model - trained on 119K hotel bookings'
      });
    } catch (error) {
      return res.status(503).json({
        success: false,
        status: 'unavailable',
        error: error.message
      });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST to get predictions.'
    });
  }

  try {
    const startTime = Date.now();

    // Load model metadata
    const metadata = loadModelMetadata();

    // Extract features from request
    const features = extractFeatures(req.body);

    // Run prediction via Python subprocess
    const prediction = await runPrediction(features);

    const probability = prediction.no_show_probability;
    const riskScore = probability * 100; // Convert to 0-100 scale
    const riskLevel = getRiskLevel(probability);
    const recommendations = getRecommendations(riskLevel, probability);

    const responseTime = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      model_version: MODEL_VERSION,
      prediction: {
        no_show_probability: parseFloat(probability.toFixed(4)),
        risk_score: parseFloat(riskScore.toFixed(1)),
        risk_level: riskLevel,
        show_probability: parseFloat((1 - probability).toFixed(4))
      },
      recommendations,
      feature_importance: prediction.feature_contributions || null,
      metadata: {
        model_accuracy: metadata.roc_auc_score,
        training_date: metadata.training_date,
        response_time_ms: responseTime,
        features_used: Object.keys(features).length
      },
      input_features: features
    });

  } catch (error) {
    console.error('ML prediction error:', error);
    return res.status(500).json({
      success: false,
      error: 'Prediction failed',
      message: error.message,
      model_version: MODEL_VERSION
    });
  }
};
