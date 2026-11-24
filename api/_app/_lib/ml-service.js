/**
 * ML Service - Integration layer for XGBoost model
 * Provides fallback from ML predictions to heuristic scoring
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('MLService');

const MODEL_VERSION = 'v2.0-xgboost-hotel-trained';
const MODEL_PATH = path.join(process.cwd(), 'ml_models', 'restaurant_noshow_xgboost.json');
const PYTHON_SCRIPT = path.join(process.cwd(), 'scripts', 'predict.py');

/**
 * Check if ML model is available
 */
function isModelAvailable() {
  return fs.existsSync(MODEL_PATH) && fs.existsSync(PYTHON_SCRIPT);
}

/**
 * Extract features from reservation record for ML prediction
 */
function extractFeaturesFromReservation(reservation) {
  const fields = reservation.fields || reservation;

  // Calculate booking lead time
  const now = new Date();
  const reservationDate = new Date(fields.Date || fields.date);
  const bookingCreated = new Date(fields.created_time || fields.createdTime || now);
  const leadTimeHours = (reservationDate - bookingCreated) / (1000 * 60 * 60);

  // Parse time
  const reservationTime = fields.Time || fields.time || '19:00';

  // Customer history (if available)
  const customerNoShowRate = parseFloat(fields['Customer No-Show Rate'] || fields.customer_no_show_rate || 0);
  const isRepeatCustomer = fields['Is Repeat Customer'] || fields.is_repeat_customer || false;

  // Special requests
  const specialRequests = fields['Special Requests'] || fields.special_requests || '';
  const hasSpecialRequests = specialRequests && specialRequests.length > 0;
  const specialRequestCount = hasSpecialRequests ? specialRequests.split(',').length : 0;

  // Booking metadata
  const bookingChanges = parseInt(fields['Booking Changes'] || fields.booking_changes_count || 0);
  const hasDeposit = fields['Has Deposit'] || fields.has_deposit || false;

  // Customer type
  const isTourist = fields['Is Tourist'] || fields.is_tourist || false;
  const isTravelAgency = fields['Is Travel Agency'] || fields.is_travel_agency || false;

  return {
    party_size: parseInt(fields['Party Size'] || fields.party_size || 2),
    booking_lead_time_hours: Math.max(0, leadTimeHours),
    customer_no_show_rate: customerNoShowRate,
    is_repeat_customer: isRepeatCustomer,
    has_special_requests: hasSpecialRequests,
    special_request_count: specialRequestCount,
    booking_changes_count: bookingChanges,
    has_deposit: hasDeposit,
    is_tourist: isTourist,
    is_travel_agency: isTravelAgency,
    reservation_date: fields.Date || fields.date,
    reservation_time: reservationTime
  };
}

/**
 * Run ML prediction for a single reservation
 */
async function predictNoShowML(reservationFeatures) {
  return new Promise((resolve, reject) => {
    const python = spawn('python', [PYTHON_SCRIPT]);

    let stdout = '';
    let stderr = '';

    // Feature mapping for model
    const modelFeatures = {
      booking_lead_time_hours: parseFloat(reservationFeatures.booking_lead_time_hours || 24),
      month_num: new Date(reservationFeatures.reservation_date).getMonth() + 1,
      is_weekend: [5, 6].includes(new Date(reservationFeatures.reservation_date).getDay()) ? 1 : 0,
      is_prime_time: (() => {
        const hour = parseInt((reservationFeatures.reservation_time || '19:00').split(':')[0]);
        return (hour >= 18 && hour <= 21) ? 1 : 0;
      })(),
      party_size: parseInt(reservationFeatures.party_size || 2),
      is_tourist: reservationFeatures.is_tourist ? 1 : 0,
      is_travel_agency: reservationFeatures.is_travel_agency ? 1 : 0,
      is_repeat_customer: reservationFeatures.is_repeat_customer ? 1 : 0,
      customer_no_show_rate: parseFloat(reservationFeatures.customer_no_show_rate || 0),
      has_special_requests: reservationFeatures.has_special_requests ? 1 : 0,
      special_request_count: parseInt(reservationFeatures.special_request_count || 0),
      booking_changes_count: parseInt(reservationFeatures.booking_changes_count || 0),
      has_deposit: reservationFeatures.has_deposit ? 1 : 0,
      has_waiting_list: 0,
      stays_in_weekend_nights: 0,
      stays_in_week_nights: 0
    };

    python.stdin.write(JSON.stringify(modelFeatures));
    python.stdin.end();

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ML prediction failed: ${stderr}`));
        return;
      }

      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse ML result: ${error.message}`));
      }
    });

    python.on('error', (error) => {
      reject(new Error(`Failed to spawn Python: ${error.message}`));
    });
  });
}

/**
 * Get no-show prediction with ML or fallback to heuristic
 */
async function getPrediction(reservation, options = {}) {
  const { useML = true, fallbackToHeuristic = true } = options;

  try {
    // Try ML prediction if available and enabled
    if (useML && isModelAvailable()) {
      const features = extractFeaturesFromReservation(reservation);
      const mlResult = await predictNoShowML(features);

      return {
        method: 'ml',
        model_version: MODEL_VERSION,
        no_show_probability: mlResult.no_show_probability,
        risk_score: mlResult.no_show_probability * 100,
        risk_level: getRiskLevel(mlResult.no_show_probability),
        feature_contributions: mlResult.feature_contributions
      };
    }
  } catch (error) {
    logger.error('ML prediction failed:', error.message);

    if (!fallbackToHeuristic) {
      throw error;
    }
  }

  // Fallback to heuristic scoring
  return getHeuristicPrediction(reservation);
}

/**
 * Heuristic prediction (fallback)
 */
function getHeuristicPrediction(reservation) {
  const fields = reservation.fields || reservation;
  const now = new Date();
  const resDate = new Date(fields.Date || fields.date);
  const resTime = fields.Time || fields.time || '19:00';
  const partySize = parseInt(fields['Party Size'] || fields.party_size || 2);
  const daysAhead = Math.ceil((resDate - now) / (1000 * 60 * 60 * 24));

  let riskScore = 0.15; // Base 15% risk

  // Last-minute bookings
  if (daysAhead === 0) riskScore += 0.15;

  // Large parties
  if (partySize >= 6) riskScore += 0.10;

  // Prime time (lower risk)
  const hour = parseInt(resTime.split(':')[0]);
  if (hour >= 19 && hour <= 21) riskScore -= 0.05;

  // Weekend (lower risk)
  const dayOfWeek = resDate.getDay();
  if (dayOfWeek === 5 || dayOfWeek === 6) riskScore -= 0.05;

  riskScore = Math.max(0, Math.min(1, riskScore));

  return {
    method: 'heuristic',
    model_version: 'v1.1-heuristic',
    no_show_probability: riskScore,
    risk_score: riskScore * 100,
    risk_level: getRiskLevel(riskScore),
    feature_contributions: null
  };
}

/**
 * Calculate risk level from probability
 */
function getRiskLevel(probability) {
  if (probability >= 0.7) return 'very-high';
  if (probability >= 0.5) return 'high';
  if (probability >= 0.3) return 'medium';
  return 'low';
}

module.exports = {
  isModelAvailable,
  getPrediction,
  extractFeaturesFromReservation,
  MODEL_VERSION
};
