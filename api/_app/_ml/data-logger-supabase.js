/**
 * ML Training Data Logger - Supabase Version
 *
 * Automatically collects reservation data + outcomes for model retraining.
 * Stores data in Supabase ml_training_data table instead of CSV files.
 *
 * Data Collection Strategy:
 * 1. Log reservation at creation time (with ML prediction)
 * 2. Update outcome when:
 *    - Customer shows up (seated → completed service)
 *    - Customer no-shows (reservation time passes, not seated)
 *    - Customer cancels (status changed to cancelled)
 *
 * Benefits over CSV:
 * - Works in production (Vercel)
 * - Easy querying for stats
 * - Real-time training progress dashboard
 * - Automatic backups
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('MLDataLogger');

/**
 * Log a new reservation (at creation time)
 * @param {Object} reservation - Reservation data from reservations table
 * @param {Object} mlPrediction - ML risk prediction
 * @param {Object} customerHistory - Customer history from customer_history table
 */
async function logReservationCreated(reservation, mlPrediction, customerHistory = null) {
  try {
    const reservationDate = new Date(`${reservation.date}T${reservation.time}`);
    const dayOfWeek = reservationDate.getDay(); // 0=Sunday, 6=Saturday
    const hour = reservationDate.getHours();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isPrimeTime = (dayOfWeek === 5 || dayOfWeek === 6) && (hour >= 19 && hour <= 21);

    const trainingData = {
      // Reservation Reference
      reservation_id: reservation.reservation_id,

      // Timestamps
      reservation_date: reservation.date,
      reservation_time: reservation.time,

      // Customer Information
      customer_email: reservation.customer_email || null,
      customer_phone: reservation.customer_phone || null,
      customer_name: reservation.customer_name || null,

      // Reservation Features
      party_size: reservation.party_size,
      special_requests: reservation.special_requests || null,
      booking_lead_time_hours: calculateLeadTime(reservation),

      // Customer History Features
      is_repeat_customer: customerHistory ? customerHistory.total_visits > 0 : false,
      customer_visit_count: customerHistory ? customerHistory.total_visits || 0 : 0,
      customer_no_show_rate: customerHistory ?
        (customerHistory.total_no_shows / Math.max(1, customerHistory.total_visits)) : 0.15,
      days_since_last_visit: customerHistory ? calculateDaysSinceLastVisit(customerHistory) : 999,

      // Segovia-Specific Features
      customer_type: reservation.customer_type || null, // 'Tourist' or 'Local'
      language_preference: reservation.language_preference || null,
      seating_preference: reservation.seating_preference || null,
      special_occasion: reservation.special_occasion || null,
      dietary_restrictions: reservation.dietary_restrictions || null,
      first_time_visitor: reservation.first_time_visitor || false,

      // Time-based Features
      day_of_week: dayOfWeek,
      hour_of_day: hour,
      is_weekend: isWeekend,
      is_prime_time: isPrimeTime,

      // ML Prediction
      ml_predicted_risk_score: mlPrediction ? mlPrediction.riskScore : null,
      ml_predicted_risk_level: mlPrediction ? mlPrediction.riskLevel : null,
      ml_model_version: mlPrediction ? mlPrediction.modelVersion : null,

      // Actual Outcome (will be updated later)
      actual_outcome: 'pending'
    };

    const { data, error } = await supabaseAdmin
      .from('ml_training_data')
      .insert([trainingData])
      .select()
      .single();

    if (error) {
      logger.error('[DataLogger] Error logging reservation:', error);
      return { success: false, error: error.message };
    }

    logger.info(`[DataLogger] ✅ Logged reservation: ${reservation.reservation_id}`);
    return { success: true, data };

  } catch (error) {
    logger.error('[DataLogger] Exception logging reservation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update reservation outcome when customer shows up
 * @param {string} reservationId
 * @param {string} seatedAt - ISO timestamp
 * @param {string} completedAt - ISO timestamp
 */
async function logCustomerShowedUp(reservationId, seatedAt, completedAt) {
  return updateOutcome(reservationId, 'showed_up', {
    outcome_timestamp: new Date().toISOString(),
    seated_at: seatedAt,
    completed_at: completedAt
  });
}

/**
 * Update reservation outcome when customer no-shows
 * @param {string} reservationId
 */
async function logCustomerNoShow(reservationId) {
  return updateOutcome(reservationId, 'no_show', {
    outcome_timestamp: new Date().toISOString()
  });
}

/**
 * Update reservation outcome when customer cancels
 * @param {string} reservationId
 * @param {string} cancelledAt - ISO timestamp
 */
async function logCustomerCancelled(reservationId, cancelledAt) {
  return updateOutcome(reservationId, 'cancelled', {
    outcome_timestamp: cancelledAt || new Date().toISOString()
  });
}

/**
 * Update outcome in Supabase table
 * @param {string} reservationId
 * @param {string} outcome - 'showed_up', 'no_show', 'cancelled'
 * @param {Object} timestamps - Additional timestamp fields
 */
async function updateOutcome(reservationId, outcome, timestamps = {}) {
  try {
    const { data, error } = await supabaseAdmin
      .from('ml_training_data')
      .update({
        actual_outcome: outcome,
        ...timestamps
      })
      .eq('reservation_id', reservationId)
      .select();

    if (error) {
      logger.error(`[DataLogger] Error updating outcome for ${reservationId}:`, error);
      return { success: false, error: error.message };
    }

    if (!data || data.length === 0) {
      logger.warn(`[DataLogger] Reservation ${reservationId} not found in training data`);
      return { success: false, error: 'Reservation not found' };
    }

    logger.info(`[DataLogger] ✅ Updated outcome for ${reservationId}: ${outcome}`);
    return { success: true, data: data[0] };

  } catch (error) {
    logger.error('[DataLogger] Exception updating outcome:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get training data statistics
 * @returns {Promise<Object>} Statistics about collected training data
 */
async function getTrainingDataStats() {
  try {
    // Get total count
    const { count: totalCount, error: totalError } = await supabaseAdmin
      .from('ml_training_data')
      .select('*', { count: 'exact', head: true });

    if (totalError) throw totalError;

    // Get counts by outcome
    const { data: outcomes, error: outcomesError } = await supabaseAdmin
      .from('ml_training_data')
      .select('actual_outcome');

    if (outcomesError) throw outcomesError;

    // Count each outcome type
    const stats = {
      totalSamples: totalCount || 0,
      showedUp: 0,
      noShows: 0,
      cancelled: 0,
      pending: 0
    };

    outcomes.forEach(row => {
      switch (row.actual_outcome) {
        case 'showed_up':
          stats.showedUp++;
          break;
        case 'no_show':
          stats.noShows++;
          break;
        case 'cancelled':
          stats.cancelled++;
          break;
        default:
          stats.pending++;
      }
    });

    const completedSamples = stats.showedUp + stats.noShows + stats.cancelled;
    const noShowRate = completedSamples > 0
      ? ((stats.noShows / completedSamples) * 100).toFixed(1) + '%'
      : 'N/A';

    return {
      ...stats,
      completedSamples,
      noShowRate,
      readyForRetraining: completedSamples >= 100, // Need 100+ samples
      samplesNeeded: Math.max(0, 100 - completedSamples),
      environment: 'production'
    };

  } catch (error) {
    logger.error('[DataLogger] Error getting stats:', error);
    return {
      error: error.message,
      totalSamples: 0,
      completedSamples: 0,
      readyForRetraining: false
    };
  }
}

/**
 * Get Segovia-specific insights from training data
 * @returns {Promise<Object>} Segovia analytics
 */
async function getSegoviaInsights() {
  try {
    const { data, error } = await supabaseAdmin
      .from('ml_training_data')
      .select('customer_type, language_preference, seating_preference, special_occasion, dietary_restrictions, actual_outcome')
      .neq('actual_outcome', 'pending');

    if (error) throw error;

    // Analyze patterns
    const insights = {
      touristVsLocal: {
        tourist: { count: 0, noShowRate: 0, noShows: 0, total: 0 },
        local: { count: 0, noShowRate: 0, noShows: 0, total: 0 }
      },
      languageDistribution: {},
      seatingPreferences: {},
      specialOccasions: {},
      dietaryRestrictions: {},
      totalAnalyzed: data.length
    };

    data.forEach(row => {
      // Tourist vs Local analysis
      if (row.customer_type === 'Tourist') {
        insights.touristVsLocal.tourist.count++;
        insights.touristVsLocal.tourist.total++;
        if (row.actual_outcome === 'no_show') {
          insights.touristVsLocal.tourist.noShows++;
        }
      } else if (row.customer_type === 'Local') {
        insights.touristVsLocal.local.count++;
        insights.touristVsLocal.local.total++;
        if (row.actual_outcome === 'no_show') {
          insights.touristVsLocal.local.noShows++;
        }
      }

      // Language distribution
      if (row.language_preference) {
        insights.languageDistribution[row.language_preference] =
          (insights.languageDistribution[row.language_preference] || 0) + 1;
      }

      // Seating preferences
      if (row.seating_preference) {
        insights.seatingPreferences[row.seating_preference] =
          (insights.seatingPreferences[row.seating_preference] || 0) + 1;
      }

      // Special occasions
      if (row.special_occasion) {
        insights.specialOccasions[row.special_occasion] =
          (insights.specialOccasions[row.special_occasion] || 0) + 1;
      }

      // Dietary restrictions
      if (row.dietary_restrictions) {
        row.dietary_restrictions.forEach(restriction => {
          insights.dietaryRestrictions[restriction] =
            (insights.dietaryRestrictions[restriction] || 0) + 1;
        });
      }
    });

    // Calculate no-show rates
    if (insights.touristVsLocal.tourist.total > 0) {
      insights.touristVsLocal.tourist.noShowRate =
        (insights.touristVsLocal.tourist.noShows / insights.touristVsLocal.tourist.total * 100).toFixed(1);
    }
    if (insights.touristVsLocal.local.total > 0) {
      insights.touristVsLocal.local.noShowRate =
        (insights.touristVsLocal.local.noShows / insights.touristVsLocal.local.total * 100).toFixed(1);
    }

    return insights;

  } catch (error) {
    logger.error('[DataLogger] Error getting Segovia insights:', error);
    return { error: error.message };
  }
}

// Helper functions

function calculateLeadTime(reservation) {
  try {
    const createdAt = new Date(reservation.created_at || reservation.booking_created_at);
    const reservationTime = new Date(`${reservation.date}T${reservation.time}`);
    const diffHours = (reservationTime - createdAt) / (1000 * 60 * 60);
    return Math.max(0, diffHours.toFixed(2));
  } catch (error) {
    return 24; // Default
  }
}

function calculateDaysSinceLastVisit(customerHistory) {
  try {
    const lastVisitDate = customerHistory.last_visit_date;
    if (!lastVisitDate) return 999;

    const lastVisit = new Date(lastVisitDate);
    const today = new Date();
    const diffDays = Math.floor((today - lastVisit) / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  } catch (error) {
    return 999;
  }
}

module.exports = {
  logReservationCreated,
  logCustomerShowedUp,
  logCustomerNoShow,
  logCustomerCancelled,
  getTrainingDataStats,
  getSegoviaInsights // NEW!
};
