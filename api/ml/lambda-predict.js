/**
 * Lambda ML Prediction Service
 *
 * Calls production XGBoost model deployed on AWS Lambda
 * Replaces local rule-based prediction with real ML inference
 */

const https = require('https');
const http = require('http');
const { createSecureLogger } = require('../_lib/secure-logger');
const logger = createSecureLogger('MLLambdaPredict');

// Lambda endpoint from Vercel environment variable
const ML_ENDPOINT_URL = process.env.ML_ENDPOINT_URL || 'https://ht5iob5wezlylbl5qc72ehfk6i0srrwl.lambda-url.us-east-1.on.aws/';

/**
 * Extract features for Lambda ML model
 * Matches the 16 features expected by the deployed XGBoost model
 */
function extractLambdaFeatures(reservation, customerHistory = null) {
  const now = new Date();
  const reservationDate = new Date(reservation.date + 'T' + reservation.time);

  // Calculate booking lead time in hours
  const bookingCreatedAt = reservation.booking_created_at ? new Date(reservation.booking_created_at) : now;
  const bookingLeadTimeHours = (reservationDate - bookingCreatedAt) / (1000 * 60 * 60);

  // Month number (1-12)
  const monthNum = reservationDate.getMonth() + 1;

  // Is weekend (Friday=5, Saturday=6, Sunday=0)
  const dayOfWeek = reservationDate.getDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0 ? 1 : 0;

  // Is prime time (7PM-9PM = 19:00-21:00)
  const hour = reservationDate.getHours();
  const isPrimeTime = hour >= 19 && hour <= 21 ? 1 : 0;

  // Party size
  const partySize = parseInt(reservation.party_size) || 2;

  // Is tourist (placeholder - can be enhanced with phone area code analysis)
  const isTourist = bookingLeadTimeHours > 168 ? 1 : 0; // >7 days

  // Is travel agency (check email domain or special requests)
  const email = (reservation.customer_email || '').toLowerCase();
  const isTravelAgency = email.includes('booking.com') || email.includes('expedia') || email.includes('airbnb') ? 1 : 0;

  // Is repeat customer
  const isRepeatCustomer = customerHistory && customerHistory.total_visits > 1 ? 1 : 0;

  // Customer no-show rate
  const customerNoShowRate = customerHistory && customerHistory.total_visits > 0
    ? (customerHistory.total_no_shows || 0) / customerHistory.total_visits
    : 0.15; // Default 15% for new customers

  // Special requests
  const specialRequests = reservation.special_requests || '';
  const hasSpecialRequests = specialRequests.trim().length > 0 ? 1 : 0;
  const specialRequestCount = specialRequests ? specialRequests.split(',').length : 0;

  // Booking changes (placeholder - would need tracking)
  const bookingChangesCount = 0;

  // Has deposit (placeholder - would need payment integration)
  const hasDeposit = 0;

  // Has waiting list (placeholder - would need waitlist feature)
  const hasWaitingList = 0;

  // Stays in weekend/week nights (for hotel model compatibility)
  const staysInWeekendNights = 0;
  const staysInWeekNights = 0;

  return {
    booking_lead_time_hours: Math.max(0, bookingLeadTimeHours),
    month_num: monthNum,
    is_weekend: isWeekend,
    is_prime_time: isPrimeTime,
    party_size: partySize,
    is_tourist: isTourist,
    is_travel_agency: isTravelAgency,
    is_repeat_customer: isRepeatCustomer,
    customer_no_show_rate: customerNoShowRate,
    has_special_requests: hasSpecialRequests,
    special_request_count: specialRequestCount,
    booking_changes_count: bookingChangesCount,
    has_deposit: hasDeposit,
    has_waiting_list: hasWaitingList,
    stays_in_weekend_nights: staysInWeekendNights,
    stays_in_week_nights: staysInWeekNights
  };
}

/**
 * Call Lambda ML endpoint for prediction
 *
 * @param {Object} reservation - Reservation object with date, time, party_size
 * @returns {Promise<Object>} - Lambda response with prediction
 */
async function callLambdaEndpoint(reservation) {
  return new Promise((resolve, reject) => {
    const url = new URL(ML_ENDPOINT_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    // Format reservation data for Lambda
    const reservationDate = new Date(reservation.date + 'T' + reservation.time);
    const bookingDate = reservation.booking_created_at ? new Date(reservation.booking_created_at) : new Date();

    const postData = JSON.stringify({
      reservation_date: reservationDate.toISOString(),
      party_size: parseInt(reservation.party_size) || 2,
      booking_date: bookingDate.toISOString()
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000 // 10 second timeout
    };

    const req = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse Lambda response: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Lambda request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Lambda request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Predict no-show probability using Lambda ML endpoint
 *
 * @param {Object} reservation - Reservation object
 * @param {Object} customerHistory - Customer history object (optional)
 * @returns {Promise<Object>} - { noShowProbability, noShowRisk, confidence, metadata }
 */
async function predictNoShow(reservation, customerHistory = null) {
  try {
    logger.info('[LambdaML] Starting prediction for reservation:', reservation.reservation_id);

    // Call Lambda endpoint directly with reservation
    // Lambda will extract features internally from reservation_date, party_size, booking_date
    const lambdaResponse = await callLambdaEndpoint(reservation);
    logger.info('[LambdaML] Lambda response:', JSON.stringify(lambdaResponse, null, 2));

    // Lambda response structure:
    // {
    //   success: true,
    //   prediction: {
    //     risk_score: 45,
    //     risk_level: "MEDIUM",
    //     probability: 0.45,
    //     will_show: true
    //   },
    //   recommendations: ["...", "..."],
    //   model_version: "v2.0-xgboost-hotel-trained",
    //   features_used: 16
    // }

    if (!lambdaResponse.success) {
      throw new Error('Lambda prediction failed');
    }

    const prediction = lambdaResponse.prediction;

    // Extract features for response (for debugging/logging purposes)
    const features = extractLambdaFeatures(reservation, customerHistory);

    // Transform Lambda response to match expected format
    // Lambda returns: risk_level ("HIGH", "MEDIUM", "LOW", "CRITICAL")
    // We need: noShowRisk ("high", "medium", "low", "critical")
    return {
      noShowProbability: prediction.probability, // Already a decimal (0.45)
      noShowRisk: prediction.risk_level.toLowerCase(), // Convert "HIGH" to "high"
      prediction: prediction.will_show ? 'will-attend' : 'no-show',
      confidence: 0.85, // Lambda doesn't return confidence, use default high confidence
      features,
      recommendations: lambdaResponse.recommendations || [],
      metadata: {
        modelVersion: lambdaResponse.model_version,
        modelTrainedAt: '2025-11-05',
        predictedAt: new Date().toISOString(),
        rocAuc: 0.8600,
        featuresUsed: lambdaResponse.features_used || 16,
        source: 'lambda-xgboost-hotel-trained'
      }
    };
  } catch (error) {
    logger.error('[LambdaML] Prediction error:', error.message);

    // Fallback to default values on error
    return {
      error: error.message,
      noShowProbability: 0.37, // Default: 37% (base rate from training data)
      noShowRisk: 'medium', // Fallback to medium risk
      prediction: 'will-attend',
      confidence: 0.0, // No confidence on error
      features: null,
      recommendations: [],
      metadata: {
        modelVersion: 'v2.0-xgboost-hotel-trained',
        modelTrainedAt: '2025-11-05',
        predictedAt: new Date().toISOString(),
        source: 'fallback-on-error'
      }
    };
  }
}

/**
 * Get Lambda ML model information
 */
async function getModelInfo() {
  try {
    const url = new URL(ML_ENDPOINT_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        timeout: 5000
      };

      const req = client.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            resolve({
              available: response.status === 'ready',
              version: response.model_version,
              rocAuc: response.roc_auc_score,
              features: response.features || 16,
              endpoint: ML_ENDPOINT_URL,
              type: 'XGBoost 3.1.1 on AWS Lambda'
            });
          } catch (error) {
            reject(new Error(`Failed to parse health check response: ${error.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Health check failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Health check timed out'));
      });

      req.end();
    });
  } catch (error) {
    return {
      available: false,
      error: error.message
    };
  }
}

module.exports = {
  predictNoShow,
  getModelInfo,
  extractLambdaFeatures
};
