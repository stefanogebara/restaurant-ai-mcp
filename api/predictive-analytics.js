/**
 * Predictive Analytics API
 * Provides no-show predictions and revenue optimization insights
 * Uses XGBoost ML model (v2.0) with fallback to heuristic scoring
 */

const {
  getAllTables,
  getActiveServiceRecords,
  supabaseAdmin
} = require('./_lib/supabase');

const { getPrediction, isModelAvailable } = require('./_lib/ml-service');
const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const logger = createSecureLogger('PredictiveAnalytics');

/**
 * Get all reservations from Supabase
 */
async function getAllReservations(restaurantId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('restaurant_id', restaurantId);

    if (error) throw error;

    // Map to Airtable-compatible format so downstream code works unchanged
    const records = (data || []).map(r => ({
      fields: {
        Date: r.date,
        Time: r.time,
        Status: r.status,
        'Party Size': r.party_size,
        'Customer Name': r.customer_name,
        'Reservation ID': r.reservation_id,
      },
      createdTime: r.created_at,
    }));
    return { success: true, records };
  } catch (error) {
    logger.error('Error fetching reservations:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate no-show risk for upcoming reservations
 * Uses historical patterns to predict likelihood of no-shows
 */
async function predictNoShowRisks(restaurantId) {
  const reservationsResult = await getAllReservations(restaurantId);

  if (!reservationsResult.success) {
    return { success: false, error: 'Failed to fetch reservations' };
  }

  const reservations = reservationsResult.records || [];
  const now = new Date();

  // Get upcoming reservations (next 7 days)
  const upcomingReservations = reservations.filter(r => {
    const resDate = new Date(r.fields.Date);
    const daysDiff = (resDate - now) / (1000 * 60 * 60 * 24);
    return daysDiff >= 0 && daysDiff <= 7 && r.fields.Status !== 'cancelled';
  });

  // Calculate historical no-show rate
  const pastReservations = reservations.filter(r => {
    const resDate = new Date(r.fields.Date);
    return resDate < now;
  });

  const totalPast = pastReservations.length;
  const cancelledOrNoShow = pastReservations.filter(r =>
    r.fields.Status === 'cancelled' || r.fields.Status === 'no-show'
  ).length;

  const historicalNoShowRate = totalPast > 0 ? (cancelledOrNoShow / totalPast) : 0.15;

  // Check if ML model is available
  const mlAvailable = isModelAvailable();
  logger.info(`ML Model ${mlAvailable ? 'available' : 'not available'} - using ${mlAvailable ? 'XGBoost v2.0' : 'heuristic v1.1'}`);

  // Predict risk for each upcoming reservation
  const predictions = await Promise.all(upcomingReservations.map(async (r) => {
    const resDate = new Date(r.fields.Date);
    const resTime = r.fields.Time || '19:00';
    const partySize = r.fields['Party Size'] || 2;
    const daysAhead = Math.ceil((resDate - now) / (1000 * 60 * 60 * 24));

    let riskScore;
    let riskLevel;
    let predictionMethod = 'heuristic';

    try {
      // Get ML prediction with automatic fallback
      const prediction = await getPrediction(r, {
        useML: true,
        fallbackToHeuristic: true
      });

      riskScore = prediction.risk_score; // Already 0-100 scale
      riskLevel = prediction.risk_level;
      predictionMethod = prediction.method;

      // Map very-high to high for frontend compatibility
      if (riskLevel === 'very-high') {
        riskLevel = 'high';
      }
    } catch (error) {
      logger.error('Prediction error for reservation:', r.fields['Reservation ID'], error.message);

      // Emergency fallback to simple heuristic
      riskScore = historicalNoShowRate;
      if (daysAhead === 0) riskScore += 0.15;
      if (partySize >= 6) riskScore += 0.10;

      const hour = parseInt(resTime.split(':')[0]);
      if (hour >= 19 && hour <= 21) riskScore -= 0.05;

      const dayOfWeek = resDate.getDay();
      if (dayOfWeek === 5 || dayOfWeek === 6) riskScore -= 0.05;

      riskScore = Math.max(0, Math.min(1, riskScore)) * 100;

      riskLevel = 'low';
      if (riskScore > 40) riskLevel = 'high';
      else if (riskScore > 20) riskLevel = 'medium';
    }

    // Recommendations based on risk
    const recommendations = [];
    if (riskLevel === 'high') {
      recommendations.push('Send confirmation reminder 24 hours before');
      recommendations.push('Require credit card deposit');
      recommendations.push('Call to confirm 2 hours before reservation');
    } else if (riskLevel === 'medium') {
      recommendations.push('Send automated SMS reminder');
      recommendations.push('Confirm via email 48 hours before');
    }

    return {
      reservation_id: r.fields['Reservation ID'],
      customer_name: r.fields['Customer Name'],
      party_size: partySize,
      date: r.fields.Date,
      time: resTime,
      risk_score: parseFloat(riskScore.toFixed(1)), // Already 0-100 scale
      risk_level: riskLevel,
      days_until: daysAhead,
      recommendations,
      prediction_method: predictionMethod, // 'ml' or 'heuristic'
      model_version: predictionMethod === 'ml' ? 'v2.0-xgboost' : 'v1.1-heuristic'
    };
  }));

  // Sort by risk score (highest first)
  predictions.sort((a, b) => b.risk_score - a.risk_score);

  // Calculate summary
  const highRisk = predictions.filter(p => p.risk_level === 'high').length;
  const mediumRisk = predictions.filter(p => p.risk_level === 'medium').length;
  const lowRisk = predictions.filter(p => p.risk_level === 'low').length;

  return {
    success: true,
    predictions: predictions.slice(0, 10), // Top 10 highest risk
    summary: {
      total_upcoming: upcomingReservations.length,
      high_risk: highRisk,
      medium_risk: mediumRisk,
      low_risk: lowRisk,
      historical_no_show_rate: parseFloat((historicalNoShowRate * 100).toFixed(1)),
      estimated_potential_no_shows: Math.round(upcomingReservations.length * historicalNoShowRate)
    }
  };
}

/**
 * Calculate revenue optimization opportunities
 */
async function getRevenueOpportunities(restaurantId) {
  const results = await Promise.all([
    getAllReservations(restaurantId),
    getActiveServiceRecords(restaurantId),
    getAllTables(restaurantId)
  ]);

  const reservationsResult = results[0];
  const activePartiesResult = results[1];
  const tablesResult = results[2];

  if (!reservationsResult.success || !tablesResult.success) {
    return { success: false, error: 'Failed to fetch data' };
  }

  const reservations = reservationsResult.records || [];
  const tables = tablesResult.tables || [];

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Recent data for analysis
  const recentReservations = reservations.filter(r => {
    const resDate = new Date(r.fields.Date || r.createdTime);
    return resDate >= thirtyDaysAgo;
  });

  const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);

  // Fetch actual avg revenue per cover from service_records (fall back to 40 default)
  let avgRevenuePerCover = 40;
  let avgCoversPerReservation = 3;
  try {
    const { data: serviceData } = await supabaseAdmin
      .from('service_records')
      .select('total_bill, party_size')
      .eq('restaurant_id', restaurantId)
      .not('total_bill', 'is', null)
      .gt('total_bill', 0)
      .limit(200);
    if (serviceData && serviceData.length >= 5) {
      const totalBill = serviceData.reduce((s, r) => s + (r.total_bill || 0), 0);
      const totalCovers = serviceData.reduce((s, r) => s + (r.party_size || 2), 0);
      avgRevenuePerCover = Math.round(totalBill / totalCovers);
      avgCoversPerReservation = Math.round(totalCovers / serviceData.length);
    }
  } catch (e) {
    logger.warn('Failed to fetch service_records for revenue estimate, using default');
  }

  // Calculate opportunities
  const opportunities = [];

  // 1. No-show reduction opportunity
  const cancelledOrNoShow = recentReservations.filter(r =>
    r.fields.Status === 'cancelled' || r.fields.Status === 'no-show'
  ).length;

  if (cancelledOrNoShow > 0) {
    const potentialRevenue = cancelledOrNoShow * 0.5 * avgCoversPerReservation * avgRevenuePerCover;

    opportunities.push({
      category: 'No-Show Reduction',
      description: 'Implement confirmation reminders and deposits to reduce no-shows',
      current_loss: Math.round(cancelledOrNoShow * avgCoversPerReservation * avgRevenuePerCover),
      potential_gain: Math.round(potentialRevenue),
      recovery_rate: '50%',
      actions: [
        'Send SMS reminders 24h before reservation',
        'Require credit card for parties of 6+',
        'Implement waitlist for last-minute fills',
        'Call high-risk reservations to confirm'
      ],
      priority: 'high',
      implementation_difficulty: 'medium',
      estimated_timeline: '2-4 weeks'
    });
  }

  // 2. Off-peak hour filling
  const timeSlotCounts = {};
  recentReservations.forEach(r => {
    const time = r.fields.Time || '';
    const hour = parseInt(time.split(':')[0]) || 0;
    timeSlotCounts[hour] = (timeSlotCounts[hour] || 0) + 1;
  });

  const peakHourAvg = Math.max(...Object.values(timeSlotCounts));
  const offPeakHours = Object.entries(timeSlotCounts).filter(([hour, count]) => {
    const h = parseInt(hour);
    return (h >= 17 && h < 22) && count < peakHourAvg * 0.5;
  });

  if (offPeakHours.length > 0) {
    const avgRevenuePerTable = avgRevenuePerCover * avgCoversPerReservation;
    const potentialTables = offPeakHours.length * 5; // 5 tables per off-peak hour
    const potentialRevenue = potentialTables * avgRevenuePerTable * 30; // Per month

    opportunities.push({
      category: 'Off-Peak Optimization',
      description: 'Fill empty tables during slow hours with promotions',
      current_loss: Math.round(potentialRevenue),
      potential_gain: Math.round(potentialRevenue * 0.4),
      recovery_rate: '40%',
      actions: [
        'Early bird special (5-6:30 PM): 15% off',
        'Weekday lunch promotion',
        'Happy hour menu extension',
        'Partner with local offices for lunch programs'
      ],
      priority: 'medium',
      implementation_difficulty: 'low',
      estimated_timeline: '1-2 weeks'
    });
  }

  // 3. Table turn optimization
  opportunities.push({
    category: 'Table Turnover',
    description: 'Improve table turnover rate during peak hours',
    current_loss: 0,
    potential_gain: Math.round(totalCapacity * 12 * avgRevenuePerCover * 0.2), // 20% increase potential
    recovery_rate: '20%',
    actions: [
      'Optimize menu for faster service',
      'Implement pre-ordering for large parties',
      'Streamline payment process (QR code menus)',
      'Better kitchen-floor communication'
    ],
    priority: 'medium',
    implementation_difficulty: 'medium',
    estimated_timeline: '4-6 weeks'
  });

  // 4. Upselling and premium experiences
  opportunities.push({
    category: 'Revenue Per Cover',
    description: 'Increase average revenue per customer through upselling',
    current_loss: 0,
    potential_gain: Math.round(recentReservations.length * avgCoversPerReservation * avgRevenuePerCover * 0.15), // 15% increase
    recovery_rate: '15%',
    actions: [
      'Train staff on wine pairing suggestions',
      'Highlight premium menu items',
      'Offer tasting menus for special occasions',
      'Dessert and after-dinner drink promotions'
    ],
    priority: 'high',
    implementation_difficulty: 'low',
    estimated_timeline: '1-2 weeks'
  });

  // Sort by potential gain (highest first)
  opportunities.sort((a, b) => b.potential_gain - a.potential_gain);

  // Calculate total opportunity
  const totalPotentialGain = opportunities.reduce((sum, opp) => sum + opp.potential_gain, 0);

  return {
    success: true,
    opportunities: opportunities.map((opp, index) => ({ ...opp, rank: index + 1 })),
    summary: {
      total_opportunities: opportunities.length,
      total_potential_revenue: totalPotentialGain,
      estimated_monthly_impact: Math.round(totalPotentialGain / 12),
      quick_wins: opportunities.filter(o => o.implementation_difficulty === 'low').length,
      high_priority: opportunities.filter(o => o.priority === 'high').length
    }
  };
}

/**
 * Main handler for predictive analytics endpoints
 */
module.exports = async (req, res) => {
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Apply rate limiting (60 requests per minute)
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return; // 429 response already sent

  // Verify authentication
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      error: authResult.error,
      message: 'Authentication required to access predictive analytics'
    });
  }
  req.user = authResult.user;

  // Check subscription status
  let subscriptionChecked = false;
  await checkSubscription(req, res, () => { subscriptionChecked = true; });
  if (!subscriptionChecked) return; // Response already sent by middleware

  // Check feature access - advanced_analytics required for predictive analytics
  let featureAllowed = false;
  requireFeature('advanced_analytics')(req, res, () => { featureAllowed = true; });
  if (!featureAllowed) return; // Response already sent by middleware

  try {
    const restaurantId = req.user.restaurant_id;
    const { type } = req.query;

    if (type === 'no-show') {
      const result = await predictNoShowRisks(restaurantId);
      return res.status(200).json(result);
    } else if (type === 'revenue') {
      const result = await getRevenueOpportunities(restaurantId);
      return res.status(200).json(result);
    } else {
      // Return both by default
      const [noShowResult, revenueResult] = await Promise.all([
        predictNoShowRisks(restaurantId),
        getRevenueOpportunities(restaurantId)
      ]);

      return res.status(200).json({
        success: true,
        no_show_predictions: noShowResult.success ? noShowResult : null,
        revenue_opportunities: revenueResult.success ? revenueResult : null
      });
    }
  } catch (error) {
    logger.error('Predictive analytics error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate predictive analytics'
    });
  }
};
