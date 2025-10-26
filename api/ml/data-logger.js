/**
 * ML Training Data Logger
 *
 * Automatically collects reservation data + outcomes for model retraining.
 * This builds a custom restaurant dataset to replace the hotel booking data.
 *
 * Data Collection Strategy:
 * 1. Log reservation at creation time (with ML prediction)
 * 2. Update outcome when:
 *    - Customer shows up (seated → completed service)
 *    - Customer no-shows (reservation time passes, not seated)
 *    - Customer cancels (status changed to cancelled)
 *
 * Export Format: CSV compatible with train_model.py
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const appendFileAsync = promisify(fs.appendFile);
const writeFileAsync = promisify(fs.writeFile);

const TRAINING_DATA_DIR = path.join(__dirname, '../../ml-training-data');
const TRAINING_LOG_FILE = path.join(TRAINING_DATA_DIR, 'restaurant_training_data.csv');

// Check if we're in a writable environment (local dev) vs read-only (Vercel production)
let isFileSystemWritable = false;

try {
  // Ensure directory exists
  if (!fs.existsSync(TRAINING_DATA_DIR)) {
    fs.mkdirSync(TRAINING_DATA_DIR, { recursive: true });
  }

  // Initialize CSV with headers if it doesn't exist
  if (!fs.existsSync(TRAINING_LOG_FILE)) {
    const headers = [
      'reservation_id',
      'created_at',
      'reservation_date',
      'reservation_time',
      'customer_email',
      'customer_phone',
      'customer_name',
      'party_size',
      'special_requests',
      'booking_lead_time_hours',
      'is_repeat_customer',
      'customer_visit_count',
      'customer_no_show_rate',
      'days_since_last_visit',
      'ml_predicted_probability',
      'ml_predicted_risk_level',
      'actual_outcome', // 'showed_up', 'no_show', 'cancelled'
      'outcome_timestamp',
      'seated_at',
      'completed_at'
    ].join(',') + '\n';

    fs.writeFileSync(TRAINING_LOG_FILE, headers);
    console.log('[DataLogger] Initialized training data log:', TRAINING_LOG_FILE);
  }

  isFileSystemWritable = true;
  console.log('[DataLogger] File system is writable - data collection enabled');
} catch (error) {
  console.warn('[DataLogger] File system is read-only (Vercel production) - data collection disabled');
  console.warn('[DataLogger] Training data will only be collected in local development');
}

/**
 * Log a new reservation (at creation time)
 */
async function logReservationCreated(reservation, mlPrediction, customerHistory = null) {
  // Skip logging if filesystem is read-only (Vercel production)
  if (!isFileSystemWritable) {
    console.warn('[DataLogger] Skipping reservation log - filesystem read-only');
    return { success: false, reason: 'filesystem_read_only' };
  }

  try {
    const row = [
      reservation.reservation_id || '',
      reservation.created_at || new Date().toISOString(),
      reservation.date || '',
      reservation.time || '',
      reservation.customer_email || '',
      reservation.customer_phone || '',
      reservation.customer_name || '',
      reservation.party_size || 0,
      `"${(reservation.special_requests || '').replace(/"/g, '""')}"`, // Escape quotes
      calculateLeadTime(reservation),
      customerHistory ? (customerHistory.fields['Completed Reservations'] > 0 ? 1 : 0) : 0,
      customerHistory ? (customerHistory.fields['Completed Reservations'] || 0) : 0,
      customerHistory ? (customerHistory.fields['No Show Risk Score'] || 0.15) : 0.15,
      customerHistory ? calculateDaysSinceLastVisit(customerHistory) : 999,
      mlPrediction ? mlPrediction.noShowProbability : '',
      mlPrediction ? mlPrediction.noShowRisk : '',
      'pending', // Will be updated later
      '', // outcome_timestamp - filled when outcome known
      '', // seated_at - filled when seated
      ''  // completed_at - filled when service complete
    ].join(',') + '\n';

    await appendFileAsync(TRAINING_LOG_FILE, row);
    console.log('[DataLogger] Logged reservation:', reservation.reservation_id);

    return { success: true };
  } catch (error) {
    console.error('[DataLogger] Error logging reservation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Update reservation outcome when customer shows up
 */
async function logCustomerShowedUp(reservationId, seatedAt, completedAt) {
  return updateOutcome(reservationId, 'showed_up', new Date().toISOString(), seatedAt, completedAt);
}

/**
 * Update reservation outcome when customer no-shows
 */
async function logCustomerNoShow(reservationId) {
  return updateOutcome(reservationId, 'no_show', new Date().toISOString());
}

/**
 * Update reservation outcome when customer cancels
 */
async function logCustomerCancelled(reservationId, cancelledAt) {
  return updateOutcome(reservationId, 'cancelled', cancelledAt || new Date().toISOString());
}

/**
 * Update outcome in CSV file
 * Note: For production, consider using a database instead of CSV for easier updates
 */
async function updateOutcome(reservationId, outcome, outcomeTimestamp, seatedAt = '', completedAt = '') {
  // Skip updating if filesystem is read-only (Vercel production)
  if (!isFileSystemWritable) {
    console.warn('[DataLogger] Skipping outcome update - filesystem read-only');
    return { success: false, reason: 'filesystem_read_only' };
  }

  try {
    // Read entire file
    const fileContent = fs.readFileSync(TRAINING_LOG_FILE, 'utf-8');
    const lines = fileContent.split('\n');

    // Find and update the line
    let updated = false;
    const updatedLines = lines.map(line => {
      if (line.includes(reservationId)) {
        const cols = line.split(',');
        // Update outcome columns (indices 16, 17, 18, 19)
        cols[16] = outcome;
        cols[17] = outcomeTimestamp;
        cols[18] = seatedAt;
        cols[19] = completedAt;
        updated = true;
        return cols.join(',');
      }
      return line;
    });

    if (updated) {
      await writeFileAsync(TRAINING_LOG_FILE, updatedLines.join('\n'));
      console.log(`[DataLogger] Updated outcome for ${reservationId}: ${outcome}`);
      return { success: true };
    } else {
      console.warn(`[DataLogger] Reservation ${reservationId} not found in training log`);
      return { success: false, error: 'Reservation not found' };
    }
  } catch (error) {
    console.error('[DataLogger] Error updating outcome:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get training data statistics
 */
function getTrainingDataStats() {
  try {
    // If filesystem is read-only, return empty stats with helpful message
    if (!isFileSystemWritable) {
      return {
        totalSamples: 0,
        showedUp: 0,
        noShows: 0,
        cancelled: 0,
        pending: 0,
        completedSamples: 0,
        noShowRate: 'N/A',
        readyForRetraining: false,
        samplesNeeded: 100,
        environment: 'production',
        note: 'Data collection only available in local development. Consider using Airtable or Supabase for production data storage.'
      };
    }

    if (!fs.existsSync(TRAINING_LOG_FILE)) {
      return {
        totalSamples: 0,
        showedUp: 0,
        noShows: 0,
        cancelled: 0,
        pending: 0,
        completedSamples: 0,
        noShowRate: 'N/A',
        readyForRetraining: false,
        samplesNeeded: 100
      };
    }

    const fileContent = fs.readFileSync(TRAINING_LOG_FILE, 'utf-8');
    const lines = fileContent.split('\n').filter(line => line.trim().length > 0);

    // First line is header
    const dataLines = lines.slice(1);

    let showedUp = 0;
    let noShows = 0;
    let cancelled = 0;
    let pending = 0;

    dataLines.forEach(line => {
      const cols = line.split(',');
      const outcome = cols[16]; // actual_outcome column

      if (outcome === 'showed_up') showedUp++;
      else if (outcome === 'no_show') noShows++;
      else if (outcome === 'cancelled') cancelled++;
      else pending++;
    });

    const totalCompleted = showedUp + noShows + cancelled;
    const readyForRetraining = totalCompleted >= 100; // Need 100+ samples to retrain

    return {
      totalSamples: dataLines.length,
      showedUp,
      noShows,
      cancelled,
      pending,
      completedSamples: totalCompleted,
      noShowRate: totalCompleted > 0 ? (noShows / totalCompleted * 100).toFixed(1) + '%' : 'N/A',
      readyForRetraining,
      samplesNeeded: Math.max(0, 100 - totalCompleted)
    };
  } catch (error) {
    console.error('[DataLogger] Error getting stats:', error);
    return { error: error.message };
  }
}

// Helper functions

function calculateLeadTime(reservation) {
  try {
    const createdAt = new Date(reservation.created_at || reservation.booking_created_at);
    const reservationTime = new Date(`${reservation.date}T${reservation.time}`);
    const diffHours = (reservationTime - createdAt) / (1000 * 60 * 60);
    return Math.max(0, diffHours);
  } catch (error) {
    return 24; // Default
  }
}

function calculateDaysSinceLastVisit(customerHistory) {
  try {
    const lastVisitDate = customerHistory.fields['Last Visit Date'];
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
  TRAINING_LOG_FILE
};
