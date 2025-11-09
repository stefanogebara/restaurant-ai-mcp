/**
 * ML Performance Dashboard API
 * Provides comprehensive ML intervention analytics and ROI tracking
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Get overall ROI summary metrics
 */
async function getROISummary(days) {
  const { data, error } = await supabase.rpc('get_ml_roi_summary', { days_back: days });

  if (error) {
    // Fallback to direct query if RPC doesn't exist
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('ml_interventions')
      .select('*')
      .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

    if (fallbackError) throw fallbackError;

    return calculateROISummary(fallbackData);
  }

  return data[0] || {};
}

/**
 * Calculate ROI summary from raw data
 */
function calculateROISummary(interventions) {
  const total = interventions.length;
  const totalCost = interventions.reduce((sum, i) => sum + parseFloat(i.cost_of_intervention || 0), 0);
  const totalSaved = interventions.reduce((sum, i) => sum + parseFloat(i.value_saved || 0), 0);
  const roi = totalCost > 0 ? Math.round((totalSaved / totalCost) * 100) : 0;

  const showed = interventions.filter(i => i.actual_outcome === 'showed_up').length;
  const noShow = interventions.filter(i => i.actual_outcome === 'no_show').length;
  const cancelled = interventions.filter(i => i.actual_outcome === 'cancelled').length;
  const withAction = interventions.filter(i => i.action_taken === true).length;

  const successRate = withAction > 0 ? ((showed / withAction) * 100).toFixed(1) : 0;
  const meetsTarget = roi >= 300;

  return {
    total_interventions: total,
    total_cost: totalCost.toFixed(2),
    total_value_saved: totalSaved.toFixed(2),
    total_roi: roi,
    target_roi: '300-500%',
    meets_target: meetsTarget,
    outcomes: {
      showed_up: showed,
      no_show: noShow,
      cancelled: cancelled
    },
    intervention_effectiveness: {
      interventions_with_action: withAction,
      successful_interventions: showed,
      success_rate: `${successRate}%`
    }
  };
}

/**
 * Get recent intervention timeline with details
 */
async function getInterventionTimeline(days, limit = 20) {
  const { data, error } = await supabase
    .from('ml_interventions')
    .select('*')
    .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return data.map(intervention => ({
    id: intervention.intervention_id,
    reservation_id: intervention.reservation_id,
    risk_level: intervention.ml_risk_level,
    risk_score: parseFloat(intervention.ml_risk_score),
    type: intervention.intervention_type,
    action_taken: intervention.action_taken,
    outcome: intervention.actual_outcome,
    cost: parseFloat(intervention.cost_of_intervention || 0),
    value_saved: parseFloat(intervention.value_saved || 0),
    roi: intervention.cost_of_intervention > 0
      ? Math.round((intervention.value_saved / intervention.cost_of_intervention) * 100)
      : null,
    created_at: intervention.created_at,
    action_timestamp: intervention.action_timestamp
  }));
}

/**
 * Get intervention type breakdown with performance metrics
 */
async function getTypeBreakdown(days) {
  const { data, error } = await supabase
    .from('ml_interventions')
    .select('*')
    .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

  if (error) throw error;

  // Group by type
  const typeMap = {};

  data.forEach(intervention => {
    const type = intervention.intervention_type;
    if (!typeMap[type]) {
      typeMap[type] = {
        type,
        count: 0,
        total_cost: 0,
        total_saved: 0,
        showed: 0,
        total_interventions: 0
      };
    }

    typeMap[type].count++;
    typeMap[type].total_cost += parseFloat(intervention.cost_of_intervention || 0);
    typeMap[type].total_saved += parseFloat(intervention.value_saved || 0);

    if (intervention.actual_outcome === 'showed_up') {
      typeMap[type].showed++;
    }

    typeMap[type].total_interventions++;
  });

  // Calculate metrics
  return Object.values(typeMap).map(type => ({
    type: type.type,
    count: type.count,
    avg_cost: (type.total_cost / type.count).toFixed(2),
    success_rate: ((type.showed / type.total_interventions) * 100).toFixed(1),
    roi: type.total_cost > 0
      ? Math.round((type.total_saved / type.total_cost) * 100)
      : null,
    total_saved: type.total_saved.toFixed(2),
    total_cost: type.total_cost.toFixed(2)
  })).filter(t => t.type !== 'none') // Filter out "none" interventions
    .sort((a, b) => (b.roi || 0) - (a.roi || 0)); // Sort by ROI descending
}

/**
 * Get ROI trend over time (weekly)
 */
async function getROITrend(days) {
  const { data, error } = await supabase
    .from('ml_interventions')
    .select('*')
    .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Group by week
  const weekMap = {};

  data.forEach(intervention => {
    const date = new Date(intervention.created_at);
    // Get Monday of the week
    const monday = new Date(date);
    monday.setDate(date.getDate() - date.getDay() + (date.getDay() === 0 ? -6 : 1));
    const weekKey = monday.toISOString().split('T')[0];

    if (!weekMap[weekKey]) {
      weekMap[weekKey] = {
        week_start: weekKey,
        interventions: 0,
        cost: 0,
        saved: 0
      };
    }

    weekMap[weekKey].interventions++;
    weekMap[weekKey].cost += parseFloat(intervention.cost_of_intervention || 0);
    weekMap[weekKey].saved += parseFloat(intervention.value_saved || 0);
  });

  // Calculate ROI for each week
  return Object.values(weekMap)
    .map(week => ({
      week_start: week.week_start,
      interventions: week.interventions,
      roi: week.cost > 0 ? Math.round((week.saved / week.cost) * 100) : 0,
      value_saved: week.saved.toFixed(2),
      cost: week.cost.toFixed(2)
    }))
    .sort((a, b) => new Date(b.week_start) - new Date(a.week_start))
    .slice(0, 12); // Last 12 weeks
}

/**
 * Generate smart recommendations based on data
 */
function generateRecommendations(breakdown, summary) {
  const recommendations = [];

  if (!breakdown || breakdown.length === 0) {
    return [{
      type: 'info',
      icon: '📊',
      message: 'Start tracking interventions to receive personalized recommendations',
      priority: 'low'
    }];
  }

  // Find best performing intervention type
  const bestType = breakdown
    .filter(t => t.count >= 3) // Min sample size
    .sort((a, b) => (b.roi || 0) - (a.roi || 0))[0];

  if (bestType && bestType.roi > 400) {
    recommendations.push({
      type: 'increase_usage',
      icon: '🔥',
      message: `${formatInterventionType(bestType.type)} shows ${bestType.roi}% ROI with ${bestType.success_rate}% success - use more often!`,
      priority: 'high',
      action: 'increase',
      intervention_type: bestType.type
    });
  }

  // Find worst performing type
  const worstType = breakdown
    .filter(t => t.count >= 3)
    .sort((a, b) => (a.roi || 0) - (b.roi || 0))[0];

  if (worstType && worstType.roi !== null && worstType.roi < 200) {
    recommendations.push({
      type: 'review_strategy',
      icon: '⚠️',
      message: `${formatInterventionType(worstType.type)} underperforming at ${worstType.roi}% ROI - review strategy`,
      priority: 'medium',
      action: 'review',
      intervention_type: worstType.type
    });
  }

  // Check overall ROI vs target
  const roi = parseInt(summary.total_roi || 0);
  if (roi >= 300) {
    recommendations.push({
      type: 'success',
      icon: '🎯',
      message: `Exceeding target ROI at ${roi}% - great work!`,
      priority: 'low'
    });
  } else if (roi > 0 && roi < 300) {
    recommendations.push({
      type: 'improve',
      icon: '📈',
      message: `Current ROI ${roi}% is below 300% target - focus on high-performing intervention types`,
      priority: 'high'
    });
  }

  // Budget check (if total cost is available)
  const totalCost = parseFloat(summary.total_cost || 0);
  if (totalCost > 200) {
    recommendations.push({
      type: 'budget',
      icon: '💰',
      message: `Spent €${totalCost.toFixed(0)} this period - consider optimizing intervention costs`,
      priority: 'low'
    });
  }

  return recommendations.length > 0 ? recommendations : [{
    type: 'info',
    icon: '✨',
    message: 'All systems performing well - keep up the great work!',
    priority: 'low'
  }];
}

/**
 * Format intervention type for display
 */
function formatInterventionType(type) {
  const typeMap = {
    'confirmation_call': 'Confirmation Calls',
    'deposit_required': 'Deposit Requirements',
    'premium_seating': 'Premium Seating Offers',
    'sms_reminder': 'SMS Reminders',
    'email_reminder': 'Email Reminders',
    'none': 'No Intervention'
  };

  return typeMap[type] || type.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/**
 * Serverless function handler
 */
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action = 'all', period = 30 } = req.query;

    // Validate period
    const days = parseInt(period);
    if (isNaN(days) || days < 1 || days > 365) {
      return res.status(400).json({ error: 'Invalid period. Must be between 1 and 365 days.' });
    }

    let result = {};

    // Fetch different data based on action
    switch (action) {
      case 'summary':
        result = await getROISummary(days);
        break;

      case 'timeline':
        result = await getInterventionTimeline(days);
        break;

      case 'breakdown':
        result = await getTypeBreakdown(days);
        break;

      case 'trend':
        result = await getROITrend(days);
        break;

      case 'all':
      default:
        // Fetch all data in parallel
        const [summary, timeline, breakdown, trend] = await Promise.all([
          getROISummary(days),
          getInterventionTimeline(days),
          getTypeBreakdown(days),
          getROITrend(days)
        ]);

        result = {
          summary,
          timeline,
          breakdown,
          trend,
          recommendations: generateRecommendations(breakdown, summary)
        };
        break;
    }

    res.status(200).json({
      success: true,
      data: result,
      period: days,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('ML Performance API Error:', error);
    res.status(500).json({
      error: 'Failed to fetch ML performance data',
      details: error.message
    });
  }
};
