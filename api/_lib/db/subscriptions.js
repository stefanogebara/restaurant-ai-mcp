/**
 * Subscription queries
 * Extracted from supabase.js
 */

const { supabase, handleSupabaseResponse } = require('./clients');

// ============ SUBSCRIPTIONS ============

const getSubscriptions = async (restaurantId, filter = {}) => {
  let query = supabase.from('subscriptions').select('id, subscription_id, customer_id, customer_email, plan_name, price_id, status, current_period_start, current_period_end, trial_end, canceled_at, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false });

  if (filter.customer_id) {
    query = query.eq('customer_id', filter.customer_id);
  }
  if (filter.customer_email) {
    query = query.eq('customer_email', filter.customer_email);
  }

  const { data, error } = await query;

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
  const { data: subscriptions, error: subError } = await supabase
    .from('subscriptions')
    .select('id, subscription_id, customer_id, customer_email, plan_name, price_id, status, current_period_start, current_period_end, trial_end, canceled_at, created_at')
    .eq('restaurant_id', restaurantId)
    .eq('customer_email', email)
    .limit(1);

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
  const { data: restaurantConfig, error: infoError } = await supabase
    .schema('restaurant')
    .from('restaurant_config')
    .select('id, metric_profile')
    .eq('id', restaurantId)
    .single();

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

/**
 * Create or update a Stripe subscription record for a restaurant.
 * Uses upsert with onConflict: 'subscription_id' to prevent duplicate records
 * if Stripe retries the same webhook event.
 * @param {string} restaurantId
 * @param {object} fields - Subscription fields (Stripe field names)
 * @param {object} opts - Reserved for future use (e.g. Supabase idempotency headers).
 *                        Idempotency is currently enforced at DB level via UNIQUE(subscription_id).
 */
const createSubscription = async (restaurantId, fields, opts = {}) => {
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(
      {
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
      },
      { onConflict: 'subscription_id' }
    )
    .select()
    .single();

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

  const { data, error } = await supabase
    .from('subscriptions')
    .update(updates)
    .eq('restaurant_id', restaurantId)
    .eq('subscription_id', subscriptionId)
    .select()
    .single();

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
  getSubscriptions,
  getSubscriptionByCustomerId,
  getSubscriptionByEmail,
  createSubscription,
  updateSubscription,
  cancelSubscription,
};
