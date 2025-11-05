/**
 * Lambda ML Prediction Service
 *
 * Calls production XGBoost model deployed on AWS Lambda
 * Replaces local rule-based prediction with real ML inference
 */

const https = require('https');
const http = require('http');

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
 * @param {Object} features - Feature object with all 16 required features
 * @returns {Promise<Object>} - Lambda response with prediction
 */
async function callLambdaEndpoint(features) {
  return new Promise((resolve, reject) => {
    const url = new URL(ML_ENDPOINT_URL);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const postData = JSON.stringify({ features });

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
    console.log('[LambdaML] Starting prediction for reservation:', reservation.reservation_id);

    // 1. Extract features
    const features = extractLambdaFeatures(reservation, customerHistory);
    console.log('[LambdaML] Extracted features:', features);

    // 2. Call Lambda endpoint
    const lambdaResponse = await callLambdaEndpoint(features);
    console.log('[LambdaML] Lambda response:', lambdaResponse);

    // 3. Transform Lambda response to match existing format
    const prediction = lambdaResponse.prediction;

    return {
      noShowProbability: prediction.risk_score / 100, // Convert percentage to decimal
      noShowRisk: prediction.risk_level.toLowerCase(), // Convert "HIGH" to "high"
      prediction: prediction.risk_score > 50 ? 'no-show' : 'will-attend',
      confidence: prediction.confidence / 100, // Convert percentage to decimal
      features,
      recommendations: prediction.recommendations,
      metadata: {
        modelVersion: lambdaResponse.metadata.model_version,
        modelTrainedAt: lambdaResponse.metadata.training_date,
        predictedAt: new Date().toISOString(),
        rocAuc: lambdaResponse.metadata.roc_auc,
        source: 'lambda-xgboost-3.1.1'
      }
    };
  } catch (error) {
    console.error('[LambdaML] Prediction error:', error.message);

    // Fallback to default values on error
    return {
      error: error.message,
      noShowProbability: 0.37, // Default: 37% (base rate from training data)
      noShowRisk: 'medium', // Fallback to medium risk
      confidence: 0.0, // No confidence on error
      metadata: {
        modelVersion: 'v2.1-xgboost-3.1.1',
        modelTrainedAt: 'unknown',
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
              rocAuc: response.roc_auc,
              features: response.features?.length || 16,
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
