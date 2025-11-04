/**
 * ML Risk Scoring Service
 *
 * Calculates no-show risk for reservations using heuristic-based scoring.
 * Future: Replace with trained ML model (RandomForest, XGBoost, Neural Network)
 *
 * Target: Achieve 300-500% ROI on interventions
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const MODEL_VERSION = 'v1.1-heuristic-segovia'; // Updated with Segovia-specific factors

/**
 * Risk Factors (based on restaurant industry research):
 *
 * HIGH RISK:
 * - New customer (no history)
 * - Large party size (6+)
 * - Last-minute booking (< 2 hours)
 * - Prime time slots (7-9 PM Friday/Saturday)
 * - No deposit/credit card
 *
 * LOW RISK:
 * - Repeat customer with good history
 * - Small party (1-2)
 * - Advance booking (> 7 days)
 * - Off-peak times
 * - Credit card on file
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

  // Factor 3: Booking Lead Time (20 points)
  const bookingDate = new Date(created_at);
  const reservationDate = new Date(`${date}T${time}`);
  const leadTimeHours = (reservationDate - bookingDate) / (1000 * 60 * 60);

  if (leadTimeHours < 2) {
    riskScore += 20;
    factors.push({ factor: 'last_minute_booking', impact: 20, description: '< 2 hours notice' });
  } else if (leadTimeHours < 24) {
    riskScore += 10;
    factors.push({ factor: 'short_notice', impact: 10, description: '< 1 day notice' });
  } else if (leadTimeHours > 168) { // > 7 days
    riskScore += 5;
    factors.push({ factor: 'far_advance', impact: 5, description: '> 7 days advance' });
  }

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
 * Get customer history from database
 * @param {string} customerPhone
 * @returns {Object|null} Customer history record
 */
async function getCustomerHistory(customerPhone) {
  try {
    const { data, error } = await supabase
      .from('customer_history')
      .select('*')
      .eq('customer_phone', customerPhone)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - new customer
        return null;
      }
      console.error('Error fetching customer history:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception in getCustomerHistory:', error);
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
    const { data, error } = await supabase
      .from('reservations')
      .update({
        ml_risk_score: riskData.riskScore,
        ml_risk_level: riskData.riskLevel,
        ml_confidence: riskData.confidence,
        ml_model_version: riskData.modelVersion,
        ml_prediction_timestamp: new Date().toISOString()
      })
      .eq('reservation_id', reservationId)
      .select()
      .single();

    if (error) {
      console.error('Error updating reservation risk score:', error);
      throw error;
    }

    console.log(`✅ Updated risk score for ${reservationId}: ${riskData.riskScore} (${riskData.riskLevel})`);
    return data;
  } catch (error) {
    console.error('Exception in updateReservationRiskScore:', error);
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
  console.log(`\n🤖 ML Risk Scoring for ${reservation.reservation_id}`);

  // Calculate risk score
  const riskData = await calculateRiskScore(reservation);

  console.log(`📊 Risk Score: ${riskData.riskScore}/100 (${riskData.riskLevel})`);
  console.log(`📈 Confidence: ${riskData.confidence}%`);
  console.log(`🔍 Risk Factors:`);
  riskData.factors.forEach(f => {
    console.log(`   - ${f.description} (${f.impact > 0 ? '+' : ''}${f.impact})`);
  });

  // Update reservation in database
  await updateReservationRiskScore(reservation.reservation_id, riskData);

  // Determine if intervention is needed
  const needsIntervention = riskData.riskLevel === 'high' || riskData.riskLevel === 'very-high';  // Fixed: Use hyphen

  return {
    ...riskData,
    needsIntervention,
    recommendedIntervention: needsIntervention ? getRecommendedIntervention(riskData.riskLevel, riskData.riskScore) : null
  };
}

/**
 * Get recommended intervention based on risk level
 * @param {string} riskLevel
 * @param {number} riskScore
 * @returns {Object} Intervention recommendation
 */
function getRecommendedIntervention(riskLevel, riskScore) {
  if (riskLevel === 'very-high') {  // Fixed: Use hyphen to match enum
    return {
      type: 'deposit_required',  // Fixed: Match Supabase enum
      description: 'Require credit card deposit (€10-20 per person)',
      estimatedCost: 2, // Cost of payment processing
      estimatedValue: 50 // Average revenue per no-show prevented
    };
  } else if (riskLevel === 'high') {
    return {
      type: 'confirmation_call',  // Fixed: Match Supabase enum
      description: 'Confirmation call 24 hours before',
      estimatedCost: 3, // Staff time cost
      estimatedValue: 50
    };
  }
  return null;
}

module.exports = {
  calculateRiskScore,
  processReservation,
  updateReservationRiskScore,
  getRecommendedIntervention,
  MODEL_VERSION
};
