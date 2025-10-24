/**
 * Predictive Analytics API
 * Provides no-show predictions and revenue optimization insights using Gemini 2.5
 */

const {
  getAllTables,
  getActiveServiceRecords
} = require('./_lib/airtable');

const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const RESERVATIONS_TABLE_ID = process.env.RESERVATIONS_TABLE_ID;
const SERVICE_RECORDS_TABLE_ID = process.env.SERVICE_RECORDS_TABLE_ID;

/**
 * Get all reservations from Airtable
 */
async function getAllReservations() {
  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${RESERVATIONS_TABLE_ID}`;
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    return { success: true, records: response.data.records };
  } catch (error) {
    console.error('Error fetching reservations:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate no-show risk for upcoming reservations
 * Uses historical patterns to predict likelihood of no-shows
 */
async function predictNoShowRisks() {
  const reservationsResult = await getAllReservations();

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

  // Predict risk for each upcoming reservation
  const predictions = upcomingReservations.map(r => {
    const resDate = new Date(r.fields.Date);
    const resTime = r.fields.Time || '19:00';
    const partySize = r.fields['Party Size'] || 2;
    const daysAhead = Math.ceil((resDate - now) / (1000 * 60 * 60 * 24));

    // Risk factors
    let riskScore = historicalNoShowRate;

    // Last-minute bookings (< 24 hours) are higher risk
    if (daysAhead === 0) {
      riskScore += 0.15;
    }

    // Large parties are slightly higher risk
    if (partySize >= 6) {
      riskScore += 0.10;
    }

    // Prime time slots (7-9 PM) are lower risk
    const hour = parseInt(resTime.split(':')[0]);
    if (hour >= 19 && hour <= 21) {
      riskScore -= 0.05;
    }

    // Weekend bookings are lower risk
    const dayOfWeek = resDate.getDay();
    if (dayOfWeek === 5 || dayOfWeek === 6) { // Friday or Saturday
      riskScore -= 0.05;
    }

    // Cap between 0 and 1
    riskScore = Math.max(0, Math.min(1, riskScore));

    // Determine risk level
    let riskLevel = 'low';
    if (riskScore > 0.4) riskLevel = 'high';
    else if (riskScore > 0.2) riskLevel = 'medium';

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
      risk_score: parseFloat((riskScore * 100).toFixed(1)),
      risk_level: riskLevel,
      days_until: daysAhead,
      recommendations
    };
  });

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
async function getRevenueOpportunities() {
  const results = await Promise.all([
    getAllReservations(),
    getActiveServiceRecords(),
    getAllTables()
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

  // Calculate opportunities
  const opportunities = [];

  // 1. No-show reduction opportunity
  const cancelledOrNoShow = recentReservations.filter(r =>
    r.fields.Status === 'cancelled' || r.fields.Status === 'no-show'
  ).length;

  if (cancelledOrNoShow > 0) {
    const avgCoversPerReservation = 3; // Estimate
    const avgRevenuePerCover = 45; // Estimate
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
    const avgRevenuePerTable = 150;
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
    potential_gain: Math.round(totalCapacity * 12 * 45 * 0.2), // 20% increase potential
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
    potential_gain: Math.round(recentReservations.length * 3 * 45 * 0.15), // 15% increase
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { type } = req.query;

    if (type === 'no-show') {
      const result = await predictNoShowRisks();
      return res.status(200).json(result);
    } else if (type === 'revenue') {
      const result = await getRevenueOpportunities();
      return res.status(200).json(result);
    } else {
      // Return both by default
      const [noShowResult, revenueResult] = await Promise.all([
        predictNoShowRisks(),
        getRevenueOpportunities()
      ]);

      return res.status(200).json({
        success: true,
        no_show_predictions: noShowResult.success ? noShowResult : null,
        revenue_opportunities: revenueResult.success ? revenueResult : null
      });
    }
  } catch (error) {
    console.error('Predictive analytics error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to calculate predictive analytics'
    });
  }
};
