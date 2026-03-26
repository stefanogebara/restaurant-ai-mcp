/**
 * ML Risk Scoring Service
 *
 * Calculates no-show risk for reservations using heuristic-based scoring.
 * Future: Replace with trained ML model (RandomForest, XGBoost, Neural Network)
 *
 * Target: Achieve 300-500% ROI on interventions
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('MLRiskScoring');

const MODEL_VERSION = 'v1.2-heuristic-segovia-fixed'; // Fixed lead time U-curve + configurable costs

// ============================================================================
// COST CONFIGURATION - Adjust these based on YOUR restaurant's actual costs
// ============================================================================

const INTERVENTION_COSTS = {
  // Confirmation call: Staff time to make 5-10 min call
  // Example: If staff makes R$18/hr, 10 min = R$3
  // ADJUST THIS: Use your actual labor cost
  confirmation_call: 3,

  // Deposit processing: Payment processor fees + admin overhead
  // Example: Stripe 2.9% + R$0.30 = ~R$0.88 per R$20 deposit, rounded to R$2
  // ADJUST THIS: Use your actual payment processing fees
  deposit_required: 2,

  // SMS reminder: Per-message cost from Twilio/etc
  sms_reminder: 0.05,

  // Email reminder: Essentially free (automated)
  email_reminder: 0,

  // Premium seating: Goodwill gesture, no direct cost
  premium_seating: 0
};

// Average revenue per no-show prevented
// AUTO-CALCULATED from actual service_records data
// Falls back to R$50 if no data available yet
let AVERAGE_NO_SHOW_VALUE_CACHE = null;
let CACHE_TIMESTAMP = null;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // Refresh every 24 hours

/**
 * Risk Factors (based on 2023-2024 restaurant industry research):
 *
 * HIGH RISK:
 * - New customer (no history)
 * - Large party size (6+)
 * - Short notice booking (1-2 days) - impulsive
 * - Far advance booking (>7 days) - plans change
 * - Prime time slots (7-9 PM Friday/Saturday)
 * - No email contact
 * - Tourist customers (travel uncertainty)
 *
 * LOW RISK:
 * - Repeat customer with good history
 * - Small party (1-2)
 * - Same-day urgent booking (<4 hours) - committed customer
 * - Sweet spot booking (2-7 days) - planned dining
 * - Off-peak times
 * - Special occasions (birthday, anniversary)
 * - Dietary restrictions (shows intentionality)
 */

/**
 * Calculate ML risk score for a reservation
 * @param {Object} reservation - Reservation data
 * @returns {Object} { riskScore, riskLevel, confidence, factors }
 */
async function calculateRiskScore(reservation) {
  const {
    customer_phone,
    customer_email,
    party_size,
    date,
    time,
    created_at
  } = reservation;

  let riskScore = 0;
  let confidence = 85; // Base confidence for heuristic model
  const factors = [];

  // Factor 1: Customer History (30 points)
  const customerHistory = await getCustomerHistory(customer_phone);
  if (!customerHistory) {
    riskScore += 30;
    factors.push({ factor: 'new_customer', impact: 30, description: 'No booking history' });
  } else {
    const noShowRate = customerHistory.total_no_shows / Math.max(1, customerHistory.total_visits);
    if (noShowRate > 0.3) {
      riskScore += 40;
      factors.push({ factor: 'high_no_show_history', impact: 40, description: `${(noShowRate * 100).toFixed(0)}% no-show rate` });
    } else if (noShowRate > 0.1) {
      riskScore += 20;
      factors.push({ factor: 'moderate_no_show_history', impact: 20, description: `${(noShowRate * 100).toFixed(0)}% no-show rate` });
    } else {
      riskScore -= 10;
      factors.push({ factor: 'good_history', impact: -10, description: 'Reliable customer' });
    }
  }

  // Factor 2: Party Size (25 points)
  if (party_size >= 8) {
    riskScore += 25;
    factors.push({ factor: 'very_large_party', impact: 25, description: `${party_size} people` });
  } else if (party_size >= 6) {
    riskScore += 15;
    factors.push({ factor: 'large_party', impact: 15, description: `${party_size} people` });
  } else if (party_size >= 4) {
    riskScore += 5;
    factors.push({ factor: 'medium_party', impact: 5, description: `${party_size} people` });
  }

  // Factor 3: Booking Lead Time (20 points) - U-SHAPED CURVE
  // Research shows: same-day urgent = LOW risk, short notice = HIGH risk, far future = HIGH risk
  const bookingDate = new Date(created_at);
  const reservationDate = new Date(`${date}T${time}`);
  const leadTimeHours = (reservationDate - bookingDate) / (1000 * 60 * 60);

  if (leadTimeHours < 4) {
    // Same-day urgent (<4 hours): Customer is coming NOW - very committed
    riskScore -= 10;
    factors.push({ factor: 'same_day_urgent', impact: -10, description: '< 4 hours - urgent/committed' });
  } else if (leadTimeHours < 48) {
    // Short notice (1-2 days): Impulsive booking, plans may change
    riskScore += 15;
    factors.push({ factor: 'short_notice', impact: 15, description: '1-2 days - impulsive booking' });
  } else if (leadTimeHours > 168) {
    // Far future (>7 days): Plans change, may forget
    riskScore += 20;
    factors.push({ factor: 'far_advance', impact: 20, description: '> 7 days - plans may change' });
  }
  // Sweet spot (2-7 days): Planned dining, no adjustment

  // Factor 4: Time Slot (15 points)
  const hour = parseInt(time.split(':')[0]);
  const reservationDateTime = new Date(`${date}T${time}`);
  const dayOfWeek = reservationDateTime.getDay(); // 0 = Sunday, 6 = Saturday

  if ((dayOfWeek === 5 || dayOfWeek === 6) && (hour >= 19 && hour <= 21)) {
    riskScore += 15;
    factors.push({ factor: 'prime_time', impact: 15, description: 'Friday/Saturday 7-9 PM' });
  } else if (hour >= 19 && hour <= 21) {
    riskScore += 8;
    factors.push({ factor: 'peak_hour', impact: 8, description: 'Peak dinner time' });
  }

  // Factor 5: Contact Information (10 points)
  if (!customer_email) {
    riskScore += 10;
    factors.push({ factor: 'no_email', impact: 10, description: 'Phone only contact' });
  }

  // === SEGOVIA-SPECIFIC RISK FACTORS (NEW!) ===

  // Factor 6: Customer Type - Tourist vs Local (15 points)
  if (reservation.customer_type === 'Tourist') {
    riskScore += 15;
    factors.push({ factor: 'tourist', impact: 15, description: 'International tourist (travel uncertainty)' });
  } else if (reservation.customer_type === 'Local') {
    riskScore -= 5;
    factors.push({ factor: 'local', impact: -5, description: 'Local customer (more reliable)' });
  }

  // Factor 7: Language Barrier (10 points)
  if (reservation.language_preference && reservation.language_preference !== 'Spanish') {
    riskScore += 10;
    factors.push({ factor: 'language_barrier', impact: 10, description: `${reservation.language_preference} speaker (communication risk)` });
  }

  // Factor 8: Special Occasion (Reduces Risk!) (-10 points)
  if (reservation.special_occasion) {
    const lowRiskOccasions = ['Birthday', 'Anniversary', 'Celebration'];
    if (lowRiskOccasions.includes(reservation.special_occasion)) {
      riskScore -= 10;
      factors.push({ factor: 'special_occasion', impact: -10, description: `${reservation.special_occasion} (high commitment)` });
    }
  }

  // Factor 9: Terrace Seating Weather Risk (12 points)
  // Terrace requests are popular in Segovia but weather-dependent
  if (reservation.seating_preference === 'Terrace') {
    // Check if it's a last-minute booking (weather uncertainty)
    if (leadTimeHours < 24) {
      riskScore += 12;
      factors.push({ factor: 'terrace_weather_risk', impact: 12, description: 'Last-minute terrace request (weather risk)' });
    }
  }

  // Factor 10: Dietary Restrictions - Cochinillo Alternatives (5 points)
  // Customers with dietary restrictions are more intentional
  if (reservation.dietary_restrictions && reservation.dietary_restrictions.length > 0) {
    riskScore -= 5;
    factors.push({ factor: 'dietary_needs', impact: -5, description: `${reservation.dietary_restrictions.join(', ')} (intentional planning)` });
  }

  // Factor 11: First-Time Visitor (8 points)
  if (reservation.first_time_visitor === true) {
    riskScore += 8;
    factors.push({ factor: 'first_timer', impact: 8, description: 'First visit to restaurant' });
  }

  // Normalize score to 0-100
  riskScore = Math.min(100, Math.max(0, riskScore));

  // Determine risk level
  let riskLevel;
  if (riskScore >= 75) {
    riskLevel = 'very-high';  // Fixed: Use hyphen to match Supabase enum
  } else if (riskScore >= 50) {
    riskLevel = 'high';
  } else if (riskScore >= 25) {
    riskLevel = 'medium';
  } else {
    riskLevel = 'low';
  }

  return {
    riskScore: parseFloat(riskScore.toFixed(2)),
    riskLevel,
    confidence,
    factors,
    modelVersion: MODEL_VERSION
  };
}

/**
 * Calculate average revenue per table from actual service records
 * Uses last 30 days of completed services with total_bill data
 * Caches result for 24 hours to reduce database load
 * @returns {Promise<number>} Average revenue in euros
 */
async function calculateAverageNoShowValue() {
  // Check cache first
  const now = Date.now();
  if (AVERAGE_NO_SHOW_VALUE_CACHE && CACHE_TIMESTAMP && (now - CACHE_TIMESTAMP) < CACHE_DURATION_MS) {
    return AVERAGE_NO_SHOW_VALUE_CACHE;
  }

  try {
    // Calculate from last 30 days of completed service records
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data, error } = await supabaseAdmin
      .from('service_records')
      .select('total_bill')
      .eq('status', 'completed')
      .not('total_bill', 'is', null) // Only records with bill data
      .gte('actual_departure', thirtyDaysAgo.toISOString());

    if (error) {
      logger.error('[mlRiskScoring] Error fetching service records for avg revenue:', error);
      return 50; // Fallback default
    }

    if (!data || data.length === 0) {
      logger.info('[mlRiskScoring] No service records with total_bill found. Using default R$50.');
      return 50; // No data yet, use default
    }

    // Calculate average
    const totalRevenue = data.reduce((sum, record) => sum + (record.total_bill || 0), 0);
    const average = Math.round(totalRevenue / data.length);

    // Update cache
    AVERAGE_NO_SHOW_VALUE_CACHE = average;
    CACHE_TIMESTAMP = now;

    logger.info(`[mlRiskScoring] Calculated avg revenue from ${data.length} records: R$${average}`);
    return average;

  } catch (error) {
    logger.error('[mlRiskScoring] Exception calculating avg revenue:', error);
    return 50; // Fallback on error
  }
}

/**
 * Get customer history from database
 * @param {string} customerPhone
 * @returns {Object|null} Customer history record
 */
async function getCustomerHistory(customerPhone) {
  try {
    const { data, error } = await supabaseAdmin
      .from('customer_history')
      .select('*')
      .eq('customer_phone', customerPhone)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - new customer
        return null;
      }
      logger.error('Error fetching customer history:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('Exception in getCustomerHistory:', error);
    return null;
  }
}

/**
 * Update reservation with ML risk score
 * @param {string} reservationId
 * @param {Object} riskData
 */
async function updateReservationRiskScore(reservationId, riskData) {
  try {
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update({
        ml_risk_score: riskData.riskScore,
        ml_risk_level: riskData.riskLevel,
        ml_confidence: riskData.confidence,
        ml_model_version: riskData.modelVersion,
        ml_prediction_timestamp: new Date().toISOString(),
        ml_risk_factors: riskData.factors // Store detailed factors for staff explanations
      })
      .eq('reservation_id', reservationId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating reservation risk score:', error);
      throw error;
    }

    logger.info(`✅ Updated risk score for ${reservationId}: ${riskData.riskScore} (${riskData.riskLevel})`);
    return data;
  } catch (error) {
    logger.error('Exception in updateReservationRiskScore:', error);
    throw error;
  }
}

/**
 * Process reservation and calculate risk score
 * This is called when a new reservation is created
 * @param {Object} reservation
 * @returns {Object} Risk assessment results
 */
async function processReservation(reservation) {
  logger.info(`\n🤖 ML Risk Scoring for ${reservation.reservation_id}`);

  // Calculate risk score
  const riskData = await calculateRiskScore(reservation);

  logger.info(`📊 Risk Score: ${riskData.riskScore}/100 (${riskData.riskLevel})`);
  logger.info(`📈 Confidence: ${riskData.confidence}%`);
  logger.info(`🔍 Risk Factors:`);
  riskData.factors.forEach(f => {
    logger.info(`   - ${f.description} (${f.impact > 0 ? '+' : ''}${f.impact})`);
  });

  // Update reservation in database
  await updateReservationRiskScore(reservation.reservation_id, riskData);

  // Determine if intervention is needed
  const needsIntervention = riskData.riskLevel === 'high' || riskData.riskLevel === 'very-high';

  // Get recommended intervention (async - uses auto-calculated average revenue)
  const recommendedIntervention = needsIntervention
    ? await getRecommendedIntervention(riskData.riskLevel, riskData.riskScore)
    : null;

  return {
    ...riskData,
    needsIntervention,
    recommendedIntervention
  };
}

/**
 * Get recommended intervention based on risk level
 * @param {string} riskLevel
 * @param {number} riskScore
 * @param {number} avgRevenue - Auto-calculated average revenue (optional, will calculate if not provided)
 * @returns {Promise<Object>} Intervention recommendation
 */
async function getRecommendedIntervention(riskLevel, riskScore, avgRevenue = null) {
  // Get average revenue (uses cache if available)
  const estimatedValue = avgRevenue || await calculateAverageNoShowValue();

  if (riskLevel === 'very-high') {
    return {
      type: 'deposit_required',
      description: 'Require credit card deposit (R$10-20 per person)',
      estimatedCost: INTERVENTION_COSTS.deposit_required, // Configurable: payment processing fees
      estimatedValue
    };
  } else if (riskLevel === 'high') {
    return {
      type: 'confirmation_call',
      description: 'Confirmation call 24 hours before',
      estimatedCost: INTERVENTION_COSTS.confirmation_call, // Configurable: staff time cost
      estimatedValue
    };
  }
  return null;
}

module.exports = {
  calculateRiskScore,
  processReservation,
  updateReservationRiskScore,
  getRecommendedIntervention,
  calculateAverageNoShowValue, // Export for testing/manual calculation
  MODEL_VERSION,
  INTERVENTION_COSTS // Export for configuration/testing
};
