/**
 * Usage Tracking Utility
 *
 * Provides fire-and-forget usage tracking and query helpers for
 * metered billing. Uses UPSERT to atomically increment daily counters
 * in the usage_tracking table.
 *
 * Usage:
 *   const { trackUsage } = require('./usage-tracking');
 *   trackUsage(restaurantId, 'reservation_created');  // fire-and-forget
 */

const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('UsageTracking');

// ============ HELPERS ============

/**
 * Get today's date as a YYYY-MM-DD string (UTC).
 * @returns {string}
 */
function getTodayUTC() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get the first day of the current month as YYYY-MM-DD.
 * @returns {string}
 */
function getFirstDayOfMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Get the last day of the current month as YYYY-MM-DD.
 * @returns {string}
 */
function getLastDayOfMonth() {
  const now = new Date();
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return lastDay.toISOString().split('T')[0];
}

// ============ TRACKING ============

/**
 * Track a single usage event for a restaurant.
 *
 * This is fire-and-forget: it does NOT return a promise you need to await
 * and will never throw. Errors are logged silently so the main request
 * flow is never blocked.
 *
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} metricType   - Metric key, e.g. 'reservation_created',
 *                                'ai_call_completed', 'sms_sent', 'portal_booking'
 */
function trackUsage(restaurantId, metricType) {
  if (!restaurantId || !metricType) {
    logger.warn('trackUsage called with missing params', { restaurantId, metricType });
    return;
  }

  if (!supabaseAdmin) {
    logger.warn('supabaseAdmin not available, skipping usage tracking');
    return;
  }

  const period = getTodayUTC();

  // Fire-and-forget: call increment_usage() PL/pgSQL function via RPC
  supabaseAdmin
    .rpc('increment_usage', {
      p_restaurant_id: restaurantId,
      p_metric_type: metricType,
      p_period: period,
    })
    .then(({ error }) => {
      if (error) {
        // RPC may not exist yet (migration not applied) - try direct insert as fallback
        logger.warn('increment_usage RPC failed, trying direct insert', { error: error.message });
        return supabaseAdmin
          .from('usage_tracking')
          .insert({
            restaurant_id: restaurantId,
            metric_type: metricType,
            period: period,
            count: 1,
          })
          .then(({ error: insertError }) => {
            // Silently ignore duplicate key or missing table errors
            if (insertError && !insertError.message?.includes('duplicate') && !insertError.message?.includes('does not exist')) {
              logger.error('Failed to track usage (insert fallback)', insertError);
            }
          });
      }
    })
    .catch((err) => {
      logger.error('Unexpected error in trackUsage', err);
    });
}

// ============ QUERIES ============

/**
 * Get usage data for a restaurant within a date range, grouped by metric_type.
 *
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} startDate    - Start date (YYYY-MM-DD), inclusive
 * @param {string} endDate      - End date (YYYY-MM-DD), inclusive
 * @returns {Promise<{success: boolean, data?: object[], error?: string}>}
 */
async function getUsageSummary(restaurantId, startDate, endDate) {
  if (!supabaseAdmin) {
    return { success: false, error: 'supabaseAdmin not available' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('usage_tracking')
      .select('metric_type, count')
      .eq('restaurant_id', restaurantId)
      .gte('period', startDate)
      .lte('period', endDate);

    if (error) {
      logger.error('getUsageSummary query failed', error);
      return { success: false, error: error.message };
    }

    // Aggregate by metric_type in JS (simple and avoids needing a custom RPC)
    const summary = {};
    for (const row of data) {
      if (!summary[row.metric_type]) {
        summary[row.metric_type] = 0;
      }
      summary[row.metric_type] += row.count;
    }

    // Convert to array format
    const result = Object.entries(summary).map(([metric_type, total_count]) => ({
      metric_type,
      total_count,
    }));

    return { success: true, data: result };
  } catch (err) {
    logger.error('getUsageSummary unexpected error', err);
    return { success: false, error: err.message };
  }
}

/**
 * Convenience wrapper: get current calendar month's usage for a restaurant.
 *
 * @param {string} restaurantId - Restaurant UUID
 * @returns {Promise<{success: boolean, data?: object[], error?: string}>}
 */
async function getMonthlyUsage(restaurantId) {
  const startDate = getFirstDayOfMonth();
  const endDate = getLastDayOfMonth();
  return getUsageSummary(restaurantId, startDate, endDate);
}

module.exports = {
  trackUsage,
  getUsageSummary,
  getMonthlyUsage,
};
