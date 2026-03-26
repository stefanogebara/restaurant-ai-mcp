/**
 * Dynamic Pricing Engine
 *
 * Calculates optimal pricing based on:
 * - Time-based rules (day/time slots)
 * - Demand-based rules (occupancy, seats remaining)
 * - Event-based rules (holidays, special events)
 * - Customer tier (VIP discounts)
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('DynamicPricing');

// Base prices (can be configured per restaurant)
const BASE_PRICES = {
  lunch: 25, // R$25 base for lunch
  dinner: 40, // R$40 base for dinner
  default: 30 // R$30 default
};

/**
 * Calculate dynamic price for a reservation
 * @param {Object} params - Pricing parameters
 * @returns {Promise<Object>} Pricing calculation
 */
async function calculatePrice(params) {
  const {
    date,
    time,
    partySize,
    customerId,
    currentOccupancy,
    totalCapacity
  } = params;

  try {
    // 1. Determine base price based on time
    const basePrice = getBasePrice(time);

    // 2. Get all active pricing rules
    const { data: rules, error } = await supabaseAdmin
      .from('pricing_rules')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false }); // Higher priority first

    if (error) throw error;

    // 3. Find applicable rules
    const applicableRules = filterApplicableRules(rules, {
      date,
      time,
      currentOccupancy,
      totalCapacity,
      seatsRemaining: totalCapacity - currentOccupancy
    });

    // 4. Apply pricing modifiers
    let finalPrice = basePrice;
    let totalModifier = 0;
    const appliedRules = [];

    for (const rule of applicableRules) {
      const modifier = calculateModifier(rule, basePrice);
      totalModifier += modifier;
      finalPrice += modifier;

      appliedRules.push({
        rule_id: rule.id,
        rule_name: rule.rule_name,
        modifier: modifier,
        modifier_percentage: ((modifier / basePrice) * 100).toFixed(1) + '%'
      });
    }

    // 5. Check for customer tier discount
    let customerDiscount = 0;
    if (customerId) {
      const tierDiscount = await getCustomerTierDiscount(customerId);
      if (tierDiscount > 0) {
        customerDiscount = basePrice * (tierDiscount / 100);
        finalPrice -= customerDiscount;

        appliedRules.push({
          rule_id: 'customer_tier',
          rule_name: 'VIP Customer Discount',
          modifier: -customerDiscount,
          modifier_percentage: `-${tierDiscount}%`
        });
      }
    }

    // 6. Ensure minimum price (never go below 50% of base)
    const minimumPrice = basePrice * 0.5;
    if (finalPrice < minimumPrice) {
      finalPrice = minimumPrice;
    }

    // 7. Calculate demand level
    const occupancyPercentage = (currentOccupancy / totalCapacity) * 100;
    const demandLevel = getDemandLevel(occupancyPercentage);

    // 8. Log pricing event
    await logPricingEvent({
      base_price: basePrice,
      modifier_applied: totalModifier - customerDiscount,
      final_price: finalPrice,
      applied_rules: appliedRules,
      date,
      time_slot: getTimeSlot(time),
      occupancy_at_time: currentOccupancy,
      demand_level: demandLevel
    });

    return {
      success: true,
      pricing: {
        base_price: Math.round(basePrice * 100) / 100,
        final_price: Math.round(finalPrice * 100) / 100,
        total_modifier: Math.round(totalModifier * 100) / 100,
        customer_discount: Math.round(customerDiscount * 100) / 100,
        savings: Math.round((basePrice - finalPrice) * 100) / 100,
        demand_level: demandLevel,
        applied_rules: appliedRules
      }
    };

  } catch (error) {
    logger.error('Error calculating dynamic price:', error);
    return {
      success: false,
      error: error.message,
      pricing: {
        base_price: BASE_PRICES.default,
        final_price: BASE_PRICES.default,
        total_modifier: 0,
        applied_rules: []
      }
    };
  }
}

/**
 * Get base price based on time of day
 */
function getBasePrice(timeString) {
  const hour = parseInt(timeString.split(':')[0]);

  if (hour >= 11 && hour < 15) return BASE_PRICES.lunch;
  if (hour >= 17 && hour <= 23) return BASE_PRICES.dinner;

  return BASE_PRICES.default;
}

/**
 * Filter rules that apply to current context
 */
function filterApplicableRules(rules, context) {
  const { date, time, currentOccupancy, seatsRemaining } = context;

  const reservationDate = new Date(date);
  const dayOfWeek = reservationDate.toLocaleDateString('en-US', { weekday: 'long' });
  const hour = parseInt(time.split(':')[0]);

  return rules.filter(rule => {
    // Time-based rules
    if (rule.rule_type === 'time_based') {
      if (rule.day_of_week && rule.day_of_week !== dayOfWeek) return false;

      if (rule.time_slot_start && rule.time_slot_end) {
        const slotStart = parseInt(rule.time_slot_start.split(':')[0]);
        const slotEnd = parseInt(rule.time_slot_end.split(':')[0]);
        if (hour < slotStart || hour >= slotEnd) return false;
      }

      return true;
    }

    // Demand-based rules
    if (rule.rule_type === 'demand_based') {
      if (rule.occupancy_threshold) {
        const occupancyPercentage = (currentOccupancy / context.totalCapacity) * 100;
        return occupancyPercentage >= rule.occupancy_threshold;
      }

      if (rule.seats_remaining_threshold) {
        return seatsRemaining <= rule.seats_remaining_threshold;
      }

      return false;
    }

    // Event-based rules
    if (rule.rule_type === 'event_based') {
      if (rule.event_start_date && rule.event_end_date) {
        const eventStart = new Date(rule.event_start_date);
        const eventEnd = new Date(rule.event_end_date);
        return reservationDate >= eventStart && reservationDate <= eventEnd;
      }

      return false;
    }

    return false;
  });
}

/**
 * Calculate modifier amount based on rule
 */
function calculateModifier(rule, basePrice) {
  if (rule.price_modifier_type === 'percentage') {
    return basePrice * (rule.price_modifier_value / 100);
  }

  // Fixed amount
  return rule.price_modifier_value;
}

/**
 * Get customer tier discount percentage
 */
async function getCustomerTierDiscount(customerId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('customer_ltv')
      .select('customer_tier')
      .eq('customer_id', customerId)
      .single();

    if (error || !data) return 0;

    // VIP customers get 10% discount
    if (data.customer_tier === 'vip') return 10;

    // Regular customers get 5% discount
    if (data.customer_tier === 'regular') return 5;

    return 0;

  } catch (error) {
    logger.error('Error getting customer tier:', error);
    return 0;
  }
}

/**
 * Get time slot label
 */
function getTimeSlot(timeString) {
  const hour = parseInt(timeString.split(':')[0]);

  if (hour >= 11 && hour < 14) return 'Lunch (11AM-2PM)';
  if (hour >= 17 && hour < 19) return 'Early Dinner (5PM-7PM)';
  if (hour >= 19 && hour < 21) return 'Prime Dinner (7PM-9PM)';
  if (hour >= 21) return 'Late Dinner (9PM+)';

  return 'Other';
}

/**
 * Get demand level based on occupancy
 */
function getDemandLevel(occupancyPercentage) {
  if (occupancyPercentage >= 90) return 'surge';
  if (occupancyPercentage >= 70) return 'high';
  if (occupancyPercentage >= 40) return 'medium';
  return 'low';
}

/**
 * Log pricing event for audit trail
 */
async function logPricingEvent(eventData) {
  try {
    const { error } = await supabaseAdmin
      .from('pricing_events')
      .insert({
        event_type: 'price_calculated',
        base_price: eventData.base_price,
        modifier_applied: eventData.modifier_applied,
        final_price: eventData.final_price,
        pricing_rule_name: eventData.applied_rules.map(r => r.rule_name).join(', '),
        date: eventData.date,
        time_slot: eventData.time_slot,
        occupancy_at_time: eventData.occupancy_at_time,
        demand_level: eventData.demand_level
      });

    if (error) {
      logger.error('Error logging pricing event:', error);
    }
  } catch (error) {
    logger.error('Exception logging pricing event:', error);
  }
}

/**
 * Create default pricing rules for a restaurant
 */
async function createDefaultPricingRules() {
  const defaultRules = [
    // Peak hours surcharge
    {
      rule_name: 'Friday-Saturday Prime Time Surge',
      rule_type: 'time_based',
      day_of_week: null, // Applies to Fri/Sat
      time_slot_start: '19:00',
      time_slot_end: '21:00',
      price_modifier_type: 'percentage',
      price_modifier_value: 30, // +30%
      priority: 100
    },
    // Off-peak discount
    {
      rule_name: 'Early Week Lunch Discount',
      rule_type: 'time_based',
      day_of_week: null, // Mon-Thu
      time_slot_start: '11:00',
      time_slot_end: '14:00',
      price_modifier_type: 'percentage',
      price_modifier_value: -20, // -20%
      priority: 90
    },
    // High demand surge
    {
      rule_name: 'High Occupancy Surge',
      rule_type: 'demand_based',
      occupancy_threshold: 80, // 80% full
      price_modifier_type: 'percentage',
      price_modifier_value: 25, // +25%
      priority: 110
    },
    // Last minute discount
    {
      rule_name: 'Low Demand Discount',
      rule_type: 'demand_based',
      occupancy_threshold: 30, // Only 30% full
      price_modifier_type: 'percentage',
      price_modifier_value: -15, // -15%
      priority: 80
    }
  ];

  try {
    const { data, error } = await supabaseAdmin
      .from('pricing_rules')
      .insert(defaultRules)
      .select();

    if (error) throw error;

    logger.info(`✅ Created ${data.length} default pricing rules`);
    return { success: true, rules: data };

  } catch (error) {
    logger.error('Error creating default rules:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  calculatePrice,
  createDefaultPricingRules,
  getBasePrice,
  getDemandLevel
};
