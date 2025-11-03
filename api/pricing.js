/**
 * Dynamic Pricing API
 *
 * Serverless function for pricing operations:
 * - Calculate dynamic price for reservations
 * - Manage pricing rules (CRUD)
 * - View pricing events history
 */

const { createClient } = require('@supabase/supabase-js');
const {
  calculatePrice,
  createDefaultPricingRules,
  getBasePrice,
  getDemandLevel
} = require('./services/dynamicPricing');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

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
    console.error('Error calculating price:', error);
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

    let query = supabase
      .from('pricing_rules')
      .select('*')
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
    console.error('Error fetching pricing rules:', error);
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

    // Insert rule
    const { data, error } = await supabase
      .from('pricing_rules')
      .insert({
        ...ruleData,
        is_active: ruleData.is_active !== undefined ? ruleData.is_active : true,
        priority: ruleData.priority || 100
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
    console.error('Error creating pricing rule:', error);
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

    // Update rule
    const { data, error } = await supabase
      .from('pricing_rules')
      .update(updates)
      .eq('id', rule_id)
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
    console.error('Error updating pricing rule:', error);
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

    const { error } = await supabase
      .from('pricing_rules')
      .delete()
      .eq('id', rule_id);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: 'Pricing rule deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting pricing rule:', error);
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
    console.error('Error creating default rules:', error);
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

    let query = supabase
      .from('pricing_events')
      .select('*')
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
    console.error('Error fetching pricing events:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch pricing events'
    });
  }
}

/**
 * Get pricing statistics
 */
async function handleGetStats(req, res) {
  try {
    const { start_date, end_date } = req.query;

    let query = supabase
      .from('pricing_events')
      .select('*');

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
    console.error('Error calculating pricing stats:', error);
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
  res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
        'stats'
      ]
    });
  }

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
            'stats'
          ]
        });
    }
  } catch (error) {
    console.error('Pricing API Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
};
