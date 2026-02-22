/**
 * Restaurant Info & Subscription Database Operations
 *
 * Restaurant configuration lookups and Stripe subscription CRUD.
 * Multi-tenant: every query is scoped by restaurant_id.
 */

const { supabase, handleSupabaseResponse, withRetry } = require('./db-clients');

// ============ RESTAURANT INFO ============

const getRestaurantInfo = async (restaurantId) => {
  let data, error;
  try {
    ({ data, error } = await withRetry(() =>
      supabase
        .schema('restaurant')
        .from('restaurant_config')
        .select('*')
        .eq('id', restaurantId)
        .single()
    ));
  } catch (err) {
    return handleSupabaseResponse(null, err, 'GET restaurant info');
  }

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
  // Fetch current restaurant config
  let current, fetchError;
  try {
    ({ data: current, error: fetchError } = await withRetry(() =>
      supabase
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, metric_profile')
        .eq('id', restaurantId)
        .single()
    ));
  } catch (err) {
    return handleSupabaseResponse(null, err, 'FETCH restaurant info for plan update');
  }

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

  let data, error;
  try {
    ({ data, error } = await withRetry(() =>
      supabase
        .schema('restaurant')
        .from('restaurant_config')
        .update({ metric_profile: updatedProfile })
        .eq('id', restaurantId)
        .select()
        .single()
    ));
  } catch (err) {
    return handleSupabaseResponse(null, err, 'UPDATE restaurant plan');
  }

  if (error) return handleSupabaseResponse(null, error, 'UPDATE restaurant plan');

  return {
    success: true,
    data: {
      id: data.id,
      plan: plan
    }
  };
};

// ============ SUBSCRIPTIONS ============

const getSubscriptions = async (restaurantId, filter = {}) => {
  let data, error;
  try {
    ({ data, error } = await withRetry(() => {
      let query = supabase.from('subscriptions').select('*')
        .eq('restaurant_id', restaurantId);
      if (filter.customer_id) query = query.eq('customer_id', filter.customer_id);
      if (filter.customer_email) query = query.eq('customer_email', filter.customer_email);
      return query;
    }));
  } catch (err) {
    return handleSupabaseResponse(null, err, 'GET subscriptions');
  }

  if (error) return handleSupabaseResponse(null, error, 'GET subscriptions');

  return {
    success: true,
    data: {
      records: data.map(s => ({
        id: s.id,
        fields: {
          'Subscription ID': s.subscription_id,
          'Customer ID': s.customer_id,
          'Customer Email': s.customer_email,
          'Plan Name': s.plan_name,
          'Price ID': s.price_id,
          'Status': s.status,
          'Current Period Start': s.current_period_start,
          'Current Period End': s.current_period_end,
          'Trial End': s.trial_end,
          'Canceled At': s.canceled_at,
          'Created At': s.created_at
        }
      }))
    }
  };
};

const getSubscriptionByCustomerId = async (restaurantId, customerId) => {
  const result = await getSubscriptions(restaurantId, { customer_id: customerId });

  if (result.success && result.data.records && result.data.records.length > 0) {
    const subscription = result.data.records[0];
    return {
      success: true,
      subscription: {
        subscription_id: subscription.fields['Subscription ID'],
        customer_id: subscription.fields['Customer ID'],
        customer_email: subscription.fields['Customer Email'],
        plan_name: subscription.fields['Plan Name'],
        price_id: subscription.fields['Price ID'],
        status: subscription.fields['Status'],
        current_period_start: subscription.fields['Current Period Start'],
        current_period_end: subscription.fields['Current Period End'],
        trial_end: subscription.fields['Trial End'],
        canceled_at: subscription.fields['Canceled At'],
        created_at: subscription.fields['Created At'],
        record_id: subscription.id
      }
    };
  }

  return {
    success: false,
    error: true,
    message: 'Subscription not found'
  };
};

const getSubscriptionByEmail = async (restaurantId, email) => {
  // First, try to get from subscriptions table
  let subscriptions, subError;
  try {
    ({ data: subscriptions, error: subError } = await withRetry(() =>
      supabase
        .from('subscriptions')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('customer_email', email)
        .limit(1)
    ));
  } catch (err) {
    subError = err;
  }

  if (!subError && subscriptions && subscriptions.length > 0) {
    const sub = subscriptions[0];
    return {
      success: true,
      subscription: {
        subscription_id: sub.subscription_id,
        customer_id: sub.customer_id,
        customer_email: sub.customer_email,
        plan_name: sub.plan_name,
        price_id: sub.price_id,
        status: sub.status,
        current_period_start: sub.current_period_start,
        current_period_end: sub.current_period_end,
        trial_end: sub.trial_end,
        canceled_at: sub.canceled_at,
        created_at: sub.created_at,
        record_id: sub.id
      }
    };
  }

  // Fallback: Check restaurant_config.metric_profile.plan (set during onboarding)
  let restaurantConfig, infoError;
  try {
    ({ data: restaurantConfig, error: infoError } = await withRetry(() =>
      supabase
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, metric_profile')
        .eq('id', restaurantId)
        .single()
    ));
  } catch (err) {
    infoError = err;
  }

  if (!infoError && restaurantConfig && restaurantConfig.metric_profile?.plan) {
    const plan = restaurantConfig.metric_profile.plan;
    return {
      success: true,
      subscription: {
        subscription_id: 'onboarding-plan',
        customer_id: null,
        customer_email: restaurantConfig.metric_profile.customer_email || email,
        plan_name: plan,
        price_id: null,
        status: 'active',  // Assume active if set in onboarding
        current_period_start: restaurantConfig.metric_profile.onboarding_completed_at,
        current_period_end: null,  // No end date for onboarding plans
        trial_end: null,
        canceled_at: null,
        created_at: restaurantConfig.metric_profile.onboarding_completed_at,
        record_id: restaurantConfig.id
      }
    };
  }

  return {
    success: false,
    error: true,
    message: 'Subscription not found'
  };
};

const createSubscription = async (restaurantId, fields) => {
  let data, error;
  try {
    ({ data, error } = await withRetry(() =>
      supabase
        .from('subscriptions')
        .insert({
          restaurant_id: restaurantId,
          subscription_id: fields['Subscription ID'],
          customer_id: fields['Customer ID'],
          customer_email: fields['Customer Email'],
          plan_name: fields['Plan Name'],
          price_id: fields['Price ID'],
          status: fields['Status'],
          current_period_start: fields['Current Period Start'],
          current_period_end: fields['Current Period End'],
          trial_end: fields['Trial End']
        })
        .select()
        .single()
    ));
  } catch (err) {
    return handleSupabaseResponse(null, err, 'CREATE subscription');
  }

  if (error) return handleSupabaseResponse(null, error, 'CREATE subscription');

  return {
    success: true,
    data: {
      id: data.id,
      fields: {
        'Subscription ID': data.subscription_id,
        'Status': data.status
      }
    }
  };
};

const updateSubscription = async (restaurantId, subscriptionId, fields) => {
  const updates = {};

  if (fields['Status']) updates.status = fields['Status'];
  if (fields['Canceled At']) updates.canceled_at = fields['Canceled At'];
  if (fields['Current Period Start']) updates.current_period_start = fields['Current Period Start'];
  if (fields['Current Period End']) updates.current_period_end = fields['Current Period End'];

  let data, error;
  try {
    ({ data, error } = await withRetry(() =>
      supabase
        .from('subscriptions')
        .update(updates)
        .eq('restaurant_id', restaurantId)
        .eq('subscription_id', subscriptionId)
        .select()
        .single()
    ));
  } catch (err) {
    return handleSupabaseResponse(null, err, 'UPDATE subscription');
  }

  if (error) return handleSupabaseResponse(null, error, 'UPDATE subscription');

  return {
    success: true,
    data: {
      id: data.id,
      fields: {
        'Subscription ID': data.subscription_id,
        'Status': data.status
      }
    }
  };
};

const cancelSubscription = async (restaurantId, subscriptionId) => {
  return updateSubscription(restaurantId, subscriptionId, {
    'Status': 'canceled',
    'Canceled At': new Date().toISOString().split('T')[0]
  });
};

module.exports = {
  getRestaurantInfo,
  updateRestaurantPlan,
  getSubscriptions,
  getSubscriptionByCustomerId,
  getSubscriptionByEmail,
  createSubscription,
  updateSubscription,
  cancelSubscription,
};
