/**
 * Customer Lifetime Value (LTV) Calculator
 *
 * Calculates and updates customer LTV metrics based on:
 * - Visit frequency and recency
 * - Spending patterns
 * - Customer tier segmentation
 * - Churn risk prediction
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('LTVCalculator');

/**
 * Calculate LTV for a specific customer
 * @param {string} customerId - Customer identifier (phone or email)
 * @param {string|null} restaurantId - Optional restaurant ID to filter by
 * @returns {Promise<Object>} LTV metrics
 */
async function calculateCustomerLTV(customerId, restaurantId = null) {
  try {
    // 1. Get all revenue records for this customer
    let query = supabaseAdmin
      .from('revenue_records')
      .select('id, customer_id, restaurant_id, service_date, total_amount, party_size, payment_method, created_at')
      .eq('customer_id', customerId);

    // Filter by restaurant if specified
    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data: revenues, error: revenueError } = await query
      .order('service_date', { ascending: true });

    if (revenueError) throw revenueError;

    // If no revenue history, return default values
    if (!revenues || revenues.length === 0) {
      return {
        customer_id: customerId,
        restaurant_id: restaurantId,
        total_visits: 0,
        total_revenue: 0,
        avg_revenue_per_visit: 0,
        customer_tier: 'new',
        lifetime_value: 0,
        churn_risk_score: 50 // Neutral for new customers
      };
    }

    // 2. Calculate basic metrics
    const totalVisits = revenues.length;
    const totalRevenue = revenues.reduce((sum, r) => sum + parseFloat(r.total_revenue || 0), 0);
    const avgRevenuePerVisit = totalRevenue / totalVisits;
    const highestSingleVisit = Math.max(...revenues.map(r => parseFloat(r.total_revenue || 0)));

    // 3. Calculate visit frequency
    const firstVisit = new Date(revenues[0].service_date);
    const lastVisit = new Date(revenues[revenues.length - 1].service_date);
    const daysBetweenFirstAndLast = (lastVisit - firstVisit) / (1000 * 60 * 60 * 24);
    const avgDaysBetweenVisits = totalVisits > 1 ? daysBetweenFirstAndLast / (totalVisits - 1) : 0;

    // 4. Predict next visit (if pattern exists)
    const predictedNextVisit = avgDaysBetweenVisits > 0
      ? new Date(lastVisit.getTime() + (avgDaysBetweenVisits * 24 * 60 * 60 * 1000))
      : null;

    // 5. Calculate average party size
    const avgPartySize = revenues.reduce((sum, r) => sum + (r.party_size || 0), 0) / totalVisits;

    // 6. Find favorite time slot and day
    const timeSlots = revenues.map(r => getTimeSlot(r.service_time));
    const favoriteTimeSlot = getMostCommon(timeSlots);

    const days = revenues.map(r => new Date(r.service_date).toLocaleDateString('en-US', { weekday: 'long' }));
    const favoriteDay = getMostCommon(days);

    // 7. Calculate churn risk (needed by tier calculation)
    const daysSinceLastVisit = (new Date() - lastVisit) / (1000 * 60 * 60 * 24);
    const churnRiskScore = calculateChurnRisk(daysSinceLastVisit, avgDaysBetweenVisits, totalVisits);

    // 8. Calculate customer tier (uses daysSinceLastVisit for at_risk detection)
    const customerTier = calculateTier(totalVisits, totalRevenue, avgRevenuePerVisit, {
      daysSinceLastVisit,
    });

    // 9. Calculate Lifetime Value (predicted total value)
    const lifetimeValue = calculatePredictedLTV(
      totalRevenue,
      avgRevenuePerVisit,
      avgDaysBetweenVisits,
      churnRiskScore
    );

    return {
      customer_id: customerId,
      restaurant_id: restaurantId,
      total_visits: totalVisits,
      first_visit_date: firstVisit.toISOString().split('T')[0],
      last_visit_date: lastVisit.toISOString().split('T')[0],
      avg_days_between_visits: Math.round(avgDaysBetweenVisits * 10) / 10,
      predicted_next_visit_date: predictedNextVisit ? predictedNextVisit.toISOString().split('T')[0] : null,
      total_revenue: Math.round(totalRevenue * 100) / 100,
      avg_revenue_per_visit: Math.round(avgRevenuePerVisit * 100) / 100,
      highest_single_visit_revenue: Math.round(highestSingleVisit * 100) / 100,
      avg_party_size: Math.round(avgPartySize * 10) / 10,
      favorite_time_slot: favoriteTimeSlot,
      favorite_day: favoriteDay,
      customer_tier: customerTier,
      lifetime_value: Math.round(lifetimeValue * 100) / 100,
      churn_risk_score: Math.round(churnRiskScore * 10) / 10
    };

  } catch (error) {
    logger.error('Error calculating LTV:', error);
    throw error;
  }
}

/**
 * Batch calculate LTV for all customers
 * @param {string|null} restaurantId - Optional restaurant ID to filter by
 * @returns {Promise<Array>} Array of LTV calculations
 */
async function calculateAllCustomerLTV(restaurantId = null) {
  try {
    // Get all unique customer IDs from revenue records
    let query = supabaseAdmin
      .from('revenue_records')
      .select('customer_id');

    // Filter by restaurant if specified
    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data: customers, error } = await query.order('customer_id');

    if (error) throw error;

    const uniqueCustomers = [...new Set(customers.map(c => c.customer_id))];

    logger.info(`📊 Calculating LTV for ${uniqueCustomers.length} customers${restaurantId ? ` (restaurant: ${restaurantId})` : ''}...`);

    const results = [];
    for (const customerId of uniqueCustomers) {
      try {
        const ltv = await calculateCustomerLTV(customerId, restaurantId);
        results.push(ltv);

        // Update or insert into customer_ltv table
        await upsertCustomerLTV(ltv);
      } catch (err) {
        logger.error(`Failed to calculate LTV for ${customerId}:`, err);
      }
    }

    logger.info(`✅ Calculated LTV for ${results.length} customers`);
    return results;

  } catch (error) {
    logger.error('Error in batch LTV calculation:', error);
    throw error;
  }
}

/**
 * Upsert customer LTV data into database
 */
async function upsertCustomerLTV(ltvData) {
  const { error } = await supabaseAdmin
    .from('customer_ltv')
    .upsert(
      {
        ...ltvData,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'customer_id' }
    );

  if (error) {
    logger.error('Error upserting LTV data:', error);
    throw error;
  }
}

/**
 * Helper: Get time slot from time string
 */
function getTimeSlot(timeString) {
  if (!timeString) return 'Unknown';

  const hour = parseInt(timeString.split(':')[0]);

  if (hour >= 11 && hour < 14) return 'Lunch (11AM-2PM)';
  if (hour >= 17 && hour < 19) return 'Early Dinner (5PM-7PM)';
  if (hour >= 19 && hour < 21) return 'Prime Dinner (7PM-9PM)';
  if (hour >= 21) return 'Late Dinner (9PM+)';

  return 'Other';
}

/**
 * Helper: Get most common item in array
 */
function getMostCommon(arr) {
  if (!arr || arr.length === 0) return null;

  const counts = {};
  arr.forEach(item => {
    counts[item] = (counts[item] || 0) + 1;
  });

  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

/**
 * Calculate customer tier based on visits, revenue, recency, and tags.
 *
 * Tiers (evaluated in priority order):
 *   at_risk  — last_visit > 60 days AND was regular or vip
 *   vip      — 10+ visits AND top 20% revenue, OR tagged 'vip'
 *   regular  — 4-9 visits
 *   occasional — 2-3 visits
 *   new      — 1 visit
 *
 * @param {number}   visits
 * @param {number}   totalRevenue
 * @param {number}   avgRevenue         (unused, kept for compat)
 * @param {Object}   [opts]
 * @param {number}   [opts.daysSinceLastVisit]
 * @param {string}   [opts.previousTier]
 * @param {string[]} [opts.tags]
 * @param {number}   [opts.revenueP80]  — 80th-percentile revenue threshold
 */
function calculateTier(visits, totalRevenue, avgRevenue, opts = {}) {
  const {
    daysSinceLastVisit = 0,
    previousTier,
    tags = [],
    revenueP80 = Infinity,
  } = opts;

  // At-risk: hasn't visited in 60+ days AND was regular or vip
  if (
    daysSinceLastVisit > 60 &&
    (previousTier === 'regular' || previousTier === 'vip')
  ) {
    return 'at_risk';
  }

  // VIP: explicitly tagged OR (10+ visits AND top 20% revenue)
  const normalizedTags = (tags || []).map(t =>
    typeof t === 'string' ? t.trim().toLowerCase() : ''
  );
  if (normalizedTags.includes('vip')) {
    return 'vip';
  }
  if (visits >= 10 && totalRevenue >= revenueP80) {
    return 'vip';
  }

  // Regular: 4-9 visits
  if (visits >= 4) {
    return 'regular';
  }

  // Occasional: 2-3 visits
  if (visits >= 2) {
    return 'occasional';
  }

  // New: 1 visit
  return 'new';
}

/**
 * Calculate churn risk score (0-100)
 */
function calculateChurnRisk(daysSinceLastVisit, avgDaysBetween, totalVisits) {
  // New customers (1 visit) have neutral risk
  if (totalVisits === 1) return 50;

  // If no pattern established
  if (avgDaysBetween === 0) return 50;

  // Calculate how overdue they are
  const expectedNextVisit = avgDaysBetween * 1.5; // Grace period of 50%
  const overdueRatio = daysSinceLastVisit / expectedNextVisit;

  // Convert to 0-100 score (higher = more at risk)
  let riskScore = Math.min(100, overdueRatio * 50);

  // Reduce risk for loyal customers (10+ visits)
  if (totalVisits >= 10) {
    riskScore *= 0.7; // 30% reduction
  }

  return Math.max(0, Math.min(100, riskScore));
}

/**
 * Calculate predicted lifetime value
 * Formula: (Avg Revenue * Visits Per Year * Avg Customer Lifespan) - Churn Risk
 */
function calculatePredictedLTV(totalRevenue, avgRevenue, avgDaysBetween, churnRisk) {
  // If no visit pattern, use conservative estimate
  if (avgDaysBetween === 0) {
    return totalRevenue * 2; // Assume they'll return once more
  }

  // Calculate visits per year
  const visitsPerYear = 365 / avgDaysBetween;

  // Estimate customer lifespan (3 years baseline, reduced by churn risk)
  const baseLifespanYears = 3;
  const churnMultiplier = 1 - (churnRisk / 200); // 0% risk = 1.0, 100% risk = 0.5
  const estimatedLifespanYears = baseLifespanYears * churnMultiplier;

  // Calculate LTV
  const predictedLTV = avgRevenue * visitsPerYear * estimatedLifespanYears;

  return predictedLTV;
}

module.exports = {
  calculateCustomerLTV,
  calculateAllCustomerLTV,
  upsertCustomerLTV,
  // Exported for testing
  calculateTier,
};
