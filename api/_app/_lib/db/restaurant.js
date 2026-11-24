/**
 * Restaurant info and plan operations
 * Extracted from supabase.js
 */

const { supabase, handleSupabaseResponse } = require('./clients');

// ============ RESTAURANT INFO ============

const getRestaurantInfo = async (restaurantId) => {
  // Query restaurant_config in the restaurant schema by ID
  const { data, error } = await supabase
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, restaurant_name, phone, email, business_hours, average_dining_duration_minutes, timezone')
    .eq('id', restaurantId)
    .single();

  if (error) return handleSupabaseResponse(null, error, 'GET restaurant info');

  return {
    success: true,
    data: {
      records: [{
        id: data.id,
        fields: {
          'Restaurant Name': data.restaurant_name,
          'Phone': data.phone,
          'Email': data.email,
          'Address': data.address,
          'Business Hours': data.business_hours,
          'Avg Dining Duration': data.avg_dining_duration_minutes,
          'Timezone': data.timezone
        }
      }]
    }
  };
};

const updateRestaurantPlan = async (restaurantId, plan, customerEmail = null) => {
  // Get current restaurant config
  const { data: current, error: fetchError } = await supabase
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, metric_profile')
    .eq('id', restaurantId)
    .single();

  if (fetchError) return handleSupabaseResponse(null, fetchError, 'FETCH restaurant info for plan update');

  // Merge with existing metric_profile
  const updatedProfile = {
    ...(current.metric_profile || {}),
    plan: plan,
    plan_updated_at: new Date().toISOString()
  };

  if (customerEmail) {
    updatedProfile.customer_email = customerEmail;
  }

  const { data, error } = await supabase
    .schema('restaurant')
    .from('restaurant_config')
    .update({ metric_profile: updatedProfile })
    .eq('id', restaurantId)
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'UPDATE restaurant plan');

  return {
    success: true,
    data: {
      id: data.id,
      plan: plan
    }
  };
};

module.exports = {
  getRestaurantInfo,
  updateRestaurantPlan,
};
