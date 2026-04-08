/**
 * Dynamic Pricing API
 *
 * Serverless function for pricing operations:
 * - Calculate dynamic price for reservations
 * - Manage pricing rules (CRUD)
 * - View pricing events history
 */

const { createSecureLogger } = require('./_lib/secure-logger');
const { verifyAuth } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const logger = createSecureLogger('Pricing');
const {
  calculatePrice,
  createDefaultPricingRules,
  getBasePrice,
  getDemandLevel
} = require('./services/dynamicPricing');

/**
 * Calculate dynamic price for a reservation
 */
async function handleCalculatePrice(req, res) {
  try {
    const {
      date,
      time,
      party_size,
      customer_id,
      current_occupancy,
      total_capacity
    } = req.body;

    // Validate required parameters
    if (!date || !time || !party_size) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: date, time, party_size'
      });
    }

    // Calculate price
    const result = await calculatePrice({
      date,
      time,
      partySize: parseInt(party_size),
      customerId: customer_id,
      currentOccupancy: current_occupancy || 0,
      totalCapacity: total_capacity || 100
    });

    return res.status(200).json(result);

  } catch (error) {
    logger.error('Error calculating price:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate price'
    });
  }
}

/**
 * Get all pricing rules
 */
async function handleGetRules(req, res) {
  try {
    const { is_active, rule_type } = req.query;

    // All pricing_rules columns needed — returned to client dashboard
    let query = supabaseAdmin
      .from('pricing_rules')
      .select('*')
      .eq('restaurant_id', req.restaurantId)
      .order('priority', { ascending: false });

    // Filter by active status
    if (is_active !== undefined) {
      query = query.eq('is_active', is_active === 'true');
    }

    // Filter by rule type
    if (rule_type) {
      const validTypes = ['time_based', 'demand_based', 'event_based'];
      if (!validTypes.includes(rule_type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid rule_type. Must be one of: ${validTypes.join(', ')}`
        });
      }
      query = query.eq('rule_type', rule_type);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        total_rules: data.length,
        rules: data
      }
    });

  } catch (error) {
    logger.error('Error fetching pricing rules:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch pricing rules'
    });
  }
}

/**
 * Create a new pricing rule
 */
async function handleCreateRule(req, res) {
  try {
    const ruleData = req.body;

    // Validate required fields
    if (!ruleData.rule_name || !ruleData.rule_type || !ruleData.price_modifier_type || ruleData.price_modifier_value === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: rule_name, rule_type, price_modifier_type, price_modifier_value'
      });
    }

    // Validate rule type
    const validTypes = ['time_based', 'demand_based', 'event_based'];
    if (!validTypes.includes(ruleData.rule_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid rule_type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Validate price modifier type
    const validModifierTypes = ['percentage', 'fixed'];
    if (!validModifierTypes.includes(ruleData.price_modifier_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid price_modifier_type. Must be one of: ${validModifierTypes.join(', ')}`
      });
    }

    // Insert rule with allowlisted fields only
    const ALLOWED_RULE_FIELDS = ['rule_name', 'rule_type', 'price_modifier_type', 'price_modifier_value',
      'description', 'conditions', 'time_start', 'time_end', 'days_of_week', 'is_active', 'priority',
      'min_occupancy', 'max_occupancy', 'min_party_size', 'max_party_size', 'event_name', 'start_date', 'end_date'];
    const sanitizedData = {};
    for (const field of ALLOWED_RULE_FIELDS) {
      if (ruleData[field] !== undefined) sanitizedData[field] = ruleData[field];
    }
    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .insert({
        ...sanitizedData,
        restaurant_id: req.restaurantId,
        is_active: sanitizedData.is_active !== undefined ? sanitizedData.is_active : true,
        priority: sanitizedData.priority || 100
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      success: true,
      message: 'Pricing rule created successfully',
      data: data
    });

  } catch (error) {
    logger.error('Error creating pricing rule:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create pricing rule'
    });
  }
}

/**
 * Update an existing pricing rule
 */
async function handleUpdateRule(req, res) {
  try {
    const { rule_id } = req.query;
    const updates = req.body;

    if (!rule_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: rule_id'
      });
    }

    // Validate price modifier type if provided
    if (updates.price_modifier_type) {
      const validModifierTypes = ['percentage', 'fixed'];
      if (!validModifierTypes.includes(updates.price_modifier_type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid price_modifier_type. Must be one of: ${validModifierTypes.join(', ')}`
        });
      }
    }

    // Update rule with allowlisted fields only
    const ALLOWED_UPDATE_FIELDS = ['rule_name', 'rule_type', 'price_modifier_type', 'price_modifier_value',
      'description', 'conditions', 'time_start', 'time_end', 'days_of_week', 'is_active', 'priority',
      'min_occupancy', 'max_occupancy', 'min_party_size', 'max_party_size', 'event_name', 'start_date', 'end_date'];
    const sanitizedUpdates = {};
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (updates[field] !== undefined) sanitizedUpdates[field] = updates[field];
    }
    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .update(sanitizedUpdates)
      .eq('id', rule_id)
      .eq('restaurant_id', req.restaurantId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Pricing rule not found'
        });
      }
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: 'Pricing rule updated successfully',
      data: data
    });

  } catch (error) {
    logger.error('Error updating pricing rule:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update pricing rule'
    });
  }
}

/**
 * Delete a pricing rule
 */
async function handleDeleteRule(req, res) {
  try {
    const { rule_id } = req.query;

    if (!rule_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: rule_id'
      });
    }

    const { error } = await supabaseAdmin
      .from('pricing_rules')
      .delete()
      .eq('id', rule_id)
      .eq('restaurant_id', req.restaurantId);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: 'Pricing rule deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting pricing rule:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete pricing rule'
    });
  }
}

/**
 * Create default pricing rules
 */
async function handleCreateDefaults(req, res) {
  try {
    const result = await createDefaultPricingRules();

    if (result.success) {
      return res.status(201).json({
        success: true,
        message: `Created ${result.rules.length} default pricing rules`,
        data: result.rules
      });
    } else {
      throw new Error(result.error);
    }

  } catch (error) {
    logger.error('Error creating default rules:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create default pricing rules'
    });
  }
}

/**
 * Get pricing events history
 */
async function handleGetEvents(req, res) {
  try {
    const { start_date, end_date, demand_level, limit = 100 } = req.query;

    // TODO: Replace select('*') with explicit columns once pricing_events schema is confirmed
    let query = supabaseAdmin
      .from('pricing_events')
      .select('*')
      .eq('restaurant_id', req.restaurantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Filter by date range
    if (start_date) {
      query = query.gte('date', start_date);
    }
    if (end_date) {
      query = query.lte('date', end_date);
    }

    // Filter by demand level
    if (demand_level) {
      const validLevels = ['low', 'medium', 'high', 'surge'];
      if (!validLevels.includes(demand_level)) {
        return res.status(400).json({
          success: false,
          error: `Invalid demand_level. Must be one of: ${validLevels.join(', ')}`
        });
      }
      query = query.eq('demand_level', demand_level);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: {
        total_events: data.length,
        events: data
      }
    });

  } catch (error) {
    logger.error('Error fetching pricing events:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch pricing events'
    });
  }
}

/**
 * Get comprehensive pricing analytics
 */
async function handleGetAnalytics(req, res) {
  try {
    const { start_date, end_date } = req.query;

    let query = supabaseAdmin
      .from('pricing_events')
      .select('*')
      .eq('restaurant_id', req.restaurantId);

    // Filter by date range
    if (start_date) {
      query = query.gte('date', start_date);
    }
    if (end_date) {
      query = query.lte('date', end_date);
    }

    const { data: events, error } = await query;

    if (error) throw error;

    if (!events || events.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          summary: {
            total_events: 0,
            total_revenue_lift: 0,
            total_discount_given: 0,
            net_revenue_impact: 0,
            avg_price_increase_pct: 0
          },
          by_rule_type: {},
          by_demand_level: {},
          by_time_slot: {},
          most_effective_rules: [],
          timeline: []
        }
      });
    }

    // Calculate summary metrics
    const totalRevenueLift = events.reduce((sum, e) => {
      const modifier = parseFloat(e.modifier_applied) || 0;
      return sum + (modifier > 0 ? modifier : 0);
    }, 0);

    const totalDiscountGiven = events.reduce((sum, e) => {
      const modifier = parseFloat(e.modifier_applied) || 0;
      return sum + (modifier < 0 ? Math.abs(modifier) : 0);
    }, 0);

    const netRevenueImpact = totalRevenueLift - totalDiscountGiven;

    const totalBaseRevenue = events.reduce((sum, e) => sum + (parseFloat(e.base_price) || 0), 0);
    const avgPriceIncreasePct = totalBaseRevenue > 0 ? (netRevenueImpact / totalBaseRevenue) * 100 : 0;

    // Group by rule type
    const byRuleType = {};
    events.forEach(e => {
      const ruleType = e.pricing_rule_name ? (e.pricing_rule_name.includes('Surge') || e.pricing_rule_name.includes('Premium') ? 'surge' :
                        e.pricing_rule_name.includes('Discount') || e.pricing_rule_name.includes('Special') ? 'discount' : 'standard') : 'unknown';

      if (!byRuleType[ruleType]) {
        byRuleType[ruleType] = {
          count: 0,
          revenue_lift: 0,
          discount_given: 0,
          net_impact: 0
        };
      }

      const modifier = parseFloat(e.modifier_applied) || 0;
      byRuleType[ruleType].count++;
      if (modifier > 0) {
        byRuleType[ruleType].revenue_lift += modifier;
      } else {
        byRuleType[ruleType].discount_given += Math.abs(modifier);
      }
      byRuleType[ruleType].net_impact = byRuleType[ruleType].revenue_lift - byRuleType[ruleType].discount_given;
    });

    // Group by demand level
    const byDemandLevel = {};
    ['low', 'medium', 'high', 'surge'].forEach(level => {
      const levelEvents = events.filter(e => e.demand_level === level);
      if (levelEvents.length > 0) {
        const lift = levelEvents.reduce((sum, e) => sum + Math.max(0, parseFloat(e.modifier_applied) || 0), 0);
        const discount = levelEvents.reduce((sum, e) => sum + Math.abs(Math.min(0, parseFloat(e.modifier_applied) || 0)), 0);

        byDemandLevel[level] = {
          count: levelEvents.length,
          revenue_lift: lift,
          discount_given: discount,
          net_impact: lift - discount,
          avg_modifier: levelEvents.reduce((sum, e) => sum + (parseFloat(e.modifier_applied) || 0), 0) / levelEvents.length
        };
      }
    });

    // Group by time slot
    const byTimeSlot = {};
    events.forEach(e => {
      const timeSlot = e.time_slot || 'unknown';
      if (!byTimeSlot[timeSlot]) {
        byTimeSlot[timeSlot] = {
          count: 0,
          revenue_lift: 0,
          discount_given: 0,
          net_impact: 0
        };
      }

      const modifier = parseFloat(e.modifier_applied) || 0;
      byTimeSlot[timeSlot].count++;
      if (modifier > 0) {
        byTimeSlot[timeSlot].revenue_lift += modifier;
      } else {
        byTimeSlot[timeSlot].discount_given += Math.abs(modifier);
      }
      byTimeSlot[timeSlot].net_impact = byTimeSlot[timeSlot].revenue_lift - byTimeSlot[timeSlot].discount_given;
    });

    // Most effective rules (top 5 by net impact)
    const ruleImpacts = {};
    events.forEach(e => {
      if (e.pricing_rule_name) {
        if (!ruleImpacts[e.pricing_rule_name]) {
          ruleImpacts[e.pricing_rule_name] = {
            rule_name: e.pricing_rule_name,
            applications: 0,
            total_impact: 0
          };
        }
        ruleImpacts[e.pricing_rule_name].applications++;
        ruleImpacts[e.pricing_rule_name].total_impact += (parseFloat(e.modifier_applied) || 0);
      }
    });

    const mostEffectiveRules = Object.values(ruleImpacts)
      .sort((a, b) => b.total_impact - a.total_impact)
      .slice(0, 5)
      .map(rule => ({
        ...rule,
        avg_impact: rule.total_impact / rule.applications
      }));

    // Timeline (group by date)
    const timeline = {};
    events.forEach(e => {
      const date = e.date || 'unknown';
      if (!timeline[date]) {
        timeline[date] = {
          date,
          events: 0,
          revenue_lift: 0,
          discount_given: 0,
          net_impact: 0
        };
      }

      const modifier = parseFloat(e.modifier_applied) || 0;
      timeline[date].events++;
      if (modifier > 0) {
        timeline[date].revenue_lift += modifier;
      } else {
        timeline[date].discount_given += Math.abs(modifier);
      }
      timeline[date].net_impact = timeline[date].revenue_lift - timeline[date].discount_given;
    });

    const timelineArray = Object.values(timeline).sort((a, b) => new Date(a.date) - new Date(b.date));

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          total_events: events.length,
          total_revenue_lift: Math.round(totalRevenueLift * 100) / 100,
          total_discount_given: Math.round(totalDiscountGiven * 100) / 100,
          net_revenue_impact: Math.round(netRevenueImpact * 100) / 100,
          avg_price_increase_pct: Math.round(avgPriceIncreasePct * 100) / 100
        },
        by_rule_type: byRuleType,
        by_demand_level: byDemandLevel,
        by_time_slot: byTimeSlot,
        most_effective_rules: mostEffectiveRules,
        timeline: timelineArray
      }
    });

  } catch (error) {
    logger.error('Error calculating pricing analytics:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate pricing analytics'
    });
  }
}

/**
 * Get pricing statistics
 */
async function handleGetStats(req, res) {
  try {
    const { start_date, end_date } = req.query;

    let query = supabaseAdmin
      .from('pricing_events')
      .select('*')
      .eq('restaurant_id', req.restaurantId);

    // Filter by date range
    if (start_date) {
      query = query.gte('date', start_date);
    }
    if (end_date) {
      query = query.lte('date', end_date);
    }

    const { data: events, error } = await query;

    if (error) throw error;

    if (!events || events.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          total_events: 0,
          avg_base_price: 0,
          avg_final_price: 0,
          avg_modifier: 0,
          demand_breakdown: { low: 0, medium: 0, high: 0, surge: 0 }
        }
      });
    }

    // Calculate statistics
    const totalBasePrice = events.reduce((sum, e) => sum + (parseFloat(e.base_price) || 0), 0);
    const totalFinalPrice = events.reduce((sum, e) => sum + (parseFloat(e.final_price) || 0), 0);
    const totalModifier = events.reduce((sum, e) => sum + (parseFloat(e.modifier_applied) || 0), 0);

    const avgBasePrice = totalBasePrice / events.length;
    const avgFinalPrice = totalFinalPrice / events.length;
    const avgModifier = totalModifier / events.length;

    // Demand level breakdown
    const demandBreakdown = {
      low: events.filter(e => e.demand_level === 'low').length,
      medium: events.filter(e => e.demand_level === 'medium').length,
      high: events.filter(e => e.demand_level === 'high').length,
      surge: events.filter(e => e.demand_level === 'surge').length
    };

    return res.status(200).json({
      success: true,
      data: {
        total_events: events.length,
        avg_base_price: Math.round(avgBasePrice * 100) / 100,
        avg_final_price: Math.round(avgFinalPrice * 100) / 100,
        avg_modifier: Math.round(avgModifier * 100) / 100,
        demand_breakdown: demandBreakdown
      }
    });

  } catch (error) {
    logger.error('Error calculating pricing stats:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate pricing statistics'
    });
  }
}

/**
 * Main serverless function handler
 */
module.exports = async (req, res) => {
  // Enable CORS
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'pricing', 30, 60);
  if (rateLimited) return;

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ success: false, error: auth.error });
  }

  // Multi-tenant: require restaurant_id from authenticated user
  const restaurantId = req.user?.restaurant_id;
  if (!restaurantId) {
    return res.status(403).json({ success: false, error: 'Restaurant context required' });
  }

  const { action } = req.query;

  if (!action) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: action',
      available_actions: [
        'calculate',
        'rules',
        'create-rule',
        'update-rule',
        'delete-rule',
        'create-defaults',
        'events',
        'stats',
        'analytics'
      ]
    });
  }

  // Inject restaurantId into req for handler access
  req.restaurantId = restaurantId;

  try {
    switch (action) {
      case 'calculate':
        if (req.method !== 'POST') {
          return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST for calculate action.'
          });
        }
        return await handleCalculatePrice(req, res);

      case 'rules':
        return await handleGetRules(req, res);

      case 'create-rule':
        if (req.method !== 'POST') {
          return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST for create-rule action.'
          });
        }
        return await handleCreateRule(req, res);

      case 'update-rule':
        if (req.method !== 'PUT' && req.method !== 'PATCH') {
          return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use PUT or PATCH for update-rule action.'
          });
        }
        return await handleUpdateRule(req, res);

      case 'delete-rule':
        if (req.method !== 'DELETE') {
          return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use DELETE for delete-rule action.'
          });
        }
        return await handleDeleteRule(req, res);

      case 'create-defaults':
        if (req.method !== 'POST') {
          return res.status(405).json({
            success: false,
            error: 'Method not allowed. Use POST for create-defaults action.'
          });
        }
        return await handleCreateDefaults(req, res);

      case 'events':
        return await handleGetEvents(req, res);

      case 'stats':
        return await handleGetStats(req, res);

      case 'analytics':
        return await handleGetAnalytics(req, res);

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: [
            'calculate',
            'rules',
            'create-rule',
            'update-rule',
            'delete-rule',
            'create-defaults',
            'events',
            'stats',
            'analytics'
          ]
        });
    }
  } catch (error) {
    logger.error('Pricing API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
