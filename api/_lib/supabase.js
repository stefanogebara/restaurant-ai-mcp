/**
 * Supabase Database Service Layer
 * PostgreSQL-based replacement for Airtable
 * Provides same API interface as airtable.js for easy migration
 */

const { createClient } = require('@supabase/supabase-js');
const { generateSecureReservationId, generateSecureServiceId } = require('./secure-id');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============ HELPER FUNCTIONS ============

const handleSupabaseResponse = (data, error, operation = 'query') => {
  if (error) {
    console.error(`[Supabase ${operation}] Error:`, error);
    return {
      success: false,
      error: true,
      message: error.message || 'Database operation failed'
    };
  }

  console.log(`[Supabase ${operation}] Success`);
  return { success: true, data };
};

// ============ RESERVATIONS ============

const getReservations = async (filter = {}) => {
  let query = supabase.from('reservations').select('*');

  // Apply filters if provided
  if (filter.status) {
    query = query.eq('status', filter.status);
  }
  if (filter.date) {
    query = query.eq('date', filter.date);
  }
  if (filter.customer_phone) {
    query = query.eq('customer_phone', filter.customer_phone);
  }

  const { data, error } = await query.order('date', { ascending: true });

  if (error) return handleSupabaseResponse(null, error, 'GET reservations');

  return {
    success: true,
    data: {
      records: data.map(r => ({
        id: r.id,
        fields: {
          'Reservation ID': r.reservation_id,
          'Customer Name': r.customer_name,
          'Customer Phone': r.customer_phone,
          'Customer Email': r.customer_email,
          'Party Size': r.party_size,
          'Date': r.date,
          'Time': r.time,
          'Special Requests': r.special_requests,
          'Status': r.status,
          'Table IDs': r.table_ids,
          'Checked In At': r.checked_in_at,
          'Notes': r.notes,
          'ML Risk Score': r.ml_risk_score,
          'ML Risk Level': r.ml_risk_level,
          'ML Confidence': r.ml_confidence,
          'ML Model Version': r.ml_model_version,
          'ML Prediction Timestamp': r.ml_prediction_timestamp
        }
      }))
    }
  };
};

const getReservationById = async (reservationId) => {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('reservation_id', reservationId)
    .single();

  if (error) return handleSupabaseResponse(null, error, 'GET reservation by ID');
  if (!data) return { success: false, error: true, message: 'Reservation not found' };

  return {
    success: true,
    data: {
      id: data.id,
      fields: {
        'Reservation ID': data.reservation_id,
        'Customer Name': data.customer_name,
        'Customer Phone': data.customer_phone,
        'Customer Email': data.customer_email,
        'Party Size': data.party_size,
        'Date': data.date,
        'Time': data.time,
        'Special Requests': data.special_requests,
        'Status': data.status,
        'Table IDs': data.table_ids,
        'Checked In At': data.checked_in_at
      }
    }
  };
};

const createReservation = async (fields) => {
  const { data, error } = await supabase
    .from('reservations')
    .insert({
      reservation_id: fields['Reservation ID'],
      customer_name: fields['Customer Name'],
      customer_phone: fields['Customer Phone'],
      customer_email: fields['Customer Email'],
      party_size: fields['Party Size'],
      date: fields['Date'],
      time: fields['Time'],
      special_requests: fields['Special Requests'],
      status: fields['Status'] || 'pending',
      table_ids: fields['Table IDs'] || [],
      notes: fields['Notes']
    })
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'CREATE reservation');

  return {
    success: true,
    data: {
      id: data.id,
      fields: {
        'Reservation ID': data.reservation_id,
        'Customer Name': data.customer_name,
        'Status': data.status
      }
    }
  };
};

const updateReservation = async (recordId, fields) => {
  const updates = {};

  // Core reservation fields
  if (fields['Date']) updates.date = fields['Date'];
  if (fields['Time']) updates.time = fields['Time'];
  if (fields['Party Size']) updates.party_size = fields['Party Size'];
  if (fields['Special Requests'] !== undefined) updates.special_requests = fields['Special Requests'];
  if (fields['Updated At']) updates.updated_at = fields['Updated At'];

  // Status and tracking fields
  if (fields['Status']) updates.status = fields['Status'];
  if (fields['Checked In At']) updates.checked_in_at = fields['Checked In At'];
  if (fields['Table IDs']) updates.table_ids = fields['Table IDs'];
  if (fields['Notes']) updates.notes = fields['Notes'];
  if (fields['Customer History']) updates.customer_history = fields['Customer History'];

  // ML prediction fields
  if (fields['ML Risk Score']) updates.ml_risk_score = fields['ML Risk Score'];
  if (fields['ML Risk Level']) updates.ml_risk_level = fields['ML Risk Level'];
  if (fields['ML Confidence']) updates.ml_confidence = fields['ML Confidence'];
  if (fields['ML Model Version']) updates.ml_model_version = fields['ML Model Version'];
  if (fields['ML Prediction Timestamp']) updates.ml_prediction_timestamp = fields['ML Prediction Timestamp'];

  // Determine if recordId is a UUID or reservation_id
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recordId);
  const filterColumn = isUUID ? 'id' : 'reservation_id';

  const { data, error } = await supabase
    .from('reservations')
    .update(updates)
    .eq(filterColumn, recordId)
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'UPDATE reservation');

  return {
    success: true,
    data: {
      id: data.id,
      fields: {
        'Reservation ID': data.reservation_id,
        'Status': data.status
      }
    }
  };
};

// ============ TABLES ============

const getTables = async (filter = {}) => {
  let query = supabase.from('tables').select('*').eq('is_active', true);

  if (filter.status) {
    query = query.eq('status', filter.status);
  }

  const { data, error } = await query.order('table_number', { ascending: true });

  if (error) return handleSupabaseResponse(null, error, 'GET tables');

  return {
    success: true,
    data: {
      records: data.map(t => ({
        id: t.id,
        fields: {
          'Table Number': t.table_number,
          'Capacity': t.capacity,
          'Location': t.location,
          'Status': t.status,
          'Current Service ID': t.current_service_id,
          'Is Active': t.is_active
        }
      }))
    }
  };
};

const getAvailableTables = async () => {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('status', 'available')
    .eq('is_active', true);

  if (error) return handleSupabaseResponse(null, error, 'GET available tables');

  return {
    success: true,
    data: {
      records: data.map(t => ({
        id: t.id,
        fields: {
          'Table Number': t.table_number,
          'Capacity': t.capacity,
          'Location': t.location,
          'Status': t.status
        }
      }))
    }
  };
};

const getTableByNumber = async (tableNumber) => {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('table_number', tableNumber)
    .single();

  if (error) return handleSupabaseResponse(null, error, 'GET table by number');
  if (!data) return { success: false, error: true, message: `Table ${tableNumber} not found` };

  return {
    success: true,
    data: {
      id: data.id,
      fields: {
        'Table Number': data.table_number,
        'Capacity': data.capacity,
        'Location': data.location,
        'Status': data.status,
        'Current Service ID': data.current_service_id
      }
    }
  };
};

const updateTable = async (recordId, fields) => {
  const updates = {};

  if (fields['Status']) updates.status = fields['Status'];
  if (fields['Current Service ID'] !== undefined) updates.current_service_id = fields['Current Service ID'];

  console.log(`[updateTable] Updating table ${recordId} with:`, updates);

  const { data, error } = await supabase
    .from('tables')
    .update(updates)
    .eq('id', recordId)
    .select()
    .single();

  if (error) {
    console.error(`[updateTable] Error updating table ${recordId}:`, error);
    return handleSupabaseResponse(null, error, 'UPDATE table');
  }

  if (!data) {
    console.error(`[updateTable] No data returned for table ${recordId}`);
    return {
      success: false,
      error: true,
      message: `No table found with id ${recordId}`
    };
  }

  return {
    success: true,
    data: {
      id: data.id,
      fields: {
        'Table Number': data.table_number,
        'Status': data.status
      }
    }
  };
};

const updateTableStatus = async (recordId, status) => {
  return updateTable(recordId, { 'Status': status });
};

/**
 * Create a new table
 * @param {Object} fields - Table fields
 * @returns {Object} Created table
 */
const createTable = async (fields) => {
  const { data, error } = await supabase
    .from('tables')
    .insert({
      table_number: fields.table_number,
      capacity: fields.capacity,
      location: fields.location || 'Main',
      status: 'available',
      is_active: true,
      is_fixed: fields.is_fixed || false,
      min_capacity: fields.min_capacity || 1,
      max_capacity: fields.max_capacity || null,
      adjacent_tables: fields.adjacent_tables || [],
      combination_group: fields.combination_group || null
    })
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'CREATE table');

  return {
    success: true,
    table: {
      id: data.id,
      table_number: data.table_number,
      capacity: data.capacity,
      location: data.location,
      status: data.status,
      is_fixed: data.is_fixed,
      min_capacity: data.min_capacity,
      max_capacity: data.max_capacity,
      adjacent_tables: data.adjacent_tables,
      combination_group: data.combination_group
    }
  };
};

/**
 * Update table with all configuration fields
 * @param {string} tableId - Table UUID
 * @param {Object} fields - Fields to update
 * @returns {Object} Updated table
 */
const updateTableConfig = async (tableId, fields) => {
  const updates = {};

  // Basic fields
  if (fields.table_number !== undefined) updates.table_number = fields.table_number;
  if (fields.capacity !== undefined) updates.capacity = fields.capacity;
  if (fields.location !== undefined) updates.location = fields.location;
  if (fields.status !== undefined) updates.status = fields.status;

  // Combination settings
  if (fields.is_fixed !== undefined) updates.is_fixed = fields.is_fixed;
  if (fields.min_capacity !== undefined) updates.min_capacity = fields.min_capacity;
  if (fields.max_capacity !== undefined) updates.max_capacity = fields.max_capacity;
  if (fields.adjacent_tables !== undefined) updates.adjacent_tables = fields.adjacent_tables;
  if (fields.combination_group !== undefined) updates.combination_group = fields.combination_group;

  console.log(`[updateTableConfig] Updating table ${tableId} with:`, updates);

  const { data, error } = await supabase
    .from('tables')
    .update(updates)
    .eq('id', tableId)
    .select()
    .single();

  if (error) {
    console.error(`[updateTableConfig] Error:`, error);
    return handleSupabaseResponse(null, error, 'UPDATE table config');
  }

  return {
    success: true,
    table: {
      id: data.id,
      table_number: data.table_number,
      capacity: data.capacity,
      location: data.location,
      status: data.status,
      is_fixed: data.is_fixed,
      min_capacity: data.min_capacity,
      max_capacity: data.max_capacity,
      adjacent_tables: data.adjacent_tables,
      combination_group: data.combination_group
    }
  };
};

/**
 * Soft delete a table (set is_active = false)
 * @param {string} tableId - Table UUID
 * @returns {Object} Result
 */
const deleteTable = async (tableId) => {
  const { data, error } = await supabase
    .from('tables')
    .update({ is_active: false })
    .eq('id', tableId)
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'DELETE table');

  return {
    success: true,
    message: `Table ${data.table_number} deactivated`,
    table_number: data.table_number
  };
};

/**
 * Get a single table by ID with full details
 * @param {string} tableId - Table UUID
 * @returns {Object} Table details
 */
const getTableById = async (tableId) => {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('id', tableId)
    .single();

  if (error) return handleSupabaseResponse(null, error, 'GET table by ID');
  if (!data) return { success: false, error: true, message: 'Table not found' };

  return {
    success: true,
    table: {
      id: data.id,
      table_number: data.table_number,
      capacity: data.capacity,
      location: data.location,
      status: data.status,
      is_active: data.is_active,
      is_fixed: data.is_fixed,
      min_capacity: data.min_capacity,
      max_capacity: data.max_capacity,
      adjacent_tables: data.adjacent_tables,
      combination_group: data.combination_group,
      current_service_id: data.current_service_id
    }
  };
};

/**
 * Get all tables including inactive ones (for admin)
 * @returns {Object} All tables
 */
const getAllTablesAdmin = async () => {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .order('table_number', { ascending: true });

  if (error) return handleSupabaseResponse(null, error, 'GET all tables admin');

  const tables = data.map(t => ({
    id: t.id,
    table_number: t.table_number,
    capacity: t.capacity,
    location: t.location || 'Main',
    status: t.status || 'available',
    is_active: t.is_active,
    is_fixed: t.is_fixed || false,
    min_capacity: t.min_capacity || 1,
    max_capacity: t.max_capacity || null,
    adjacent_tables: t.adjacent_tables || [],
    combination_group: t.combination_group || null,
    current_service_id: t.current_service_id || null
  }));

  return {
    success: true,
    tables
  };
};

// ============ SERVICE RECORDS ============

const getServiceRecords = async (filter = {}) => {
  let query = supabase.from('service_records').select('*');

  if (filter.status) {
    query = query.eq('status', filter.status);
  }

  const { data, error } = await query.order('seated_at', { ascending: false });

  if (error) return handleSupabaseResponse(null, error, 'GET service records');

  return {
    success: true,
    data: {
      records: data.map(s => ({
        id: s.id,
        fields: {
          'Service ID': s.service_id,
          'Reservation ID': s.reservation_id,
          'Customer Name': s.customer_name,
          'Customer Phone': s.customer_phone,
          'Party Size': s.party_size,
          'Table IDs': s.table_ids,
          'Seated At': s.seated_at,
          'Estimated Departure': s.estimated_departure,
          'Actual Departure': s.actual_departure,
          'Special Requests': s.special_requests,
          'Status': s.status
        }
      }))
    }
  };
};

const getActiveServiceRecords = async () => {
  const { data, error } = await supabase
    .from('service_records')
    .select('*')
    .eq('status', 'active');

  if (error) return handleSupabaseResponse(null, error, 'GET active service records');

  const service_records = data.map(r => ({
    service_id: r.service_id,
    reservation_id: r.reservation_id || '',
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    party_size: r.party_size,
    table_ids: r.table_ids || [],
    seated_at: r.seated_at,
    estimated_departure: r.estimated_departure,
    special_requests: r.special_requests || '',
    status: r.status,
    record_id: r.id
  }));

  return {
    success: true,
    service_records
  };
};

const createServiceRecord = async (fields) => {
  const { data, error } = await supabase
    .from('service_records')
    .insert({
      service_id: fields['Service ID'],
      reservation_id: fields['Reservation ID'] || null,
      customer_name: fields['Customer Name'],
      customer_phone: fields['Customer Phone'],
      party_size: fields['Party Size'],
      table_ids: fields['Table IDs'],
      seated_at: fields['Seated At'] || new Date().toISOString(),
      estimated_departure: fields['Estimated Departure'],
      special_requests: fields['Special Requests'],
      status: 'active'
    })
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'CREATE service record');

  return {
    success: true,
    data: {
      id: data.id,
      fields: {
        'Service ID': data.service_id,
        'Customer Name': data.customer_name,
        'Status': data.status
      }
    }
  };
};

const updateServiceRecord = async (serviceId, fields) => {
  const updates = {};

  if (fields['Status']) updates.status = fields['Status'];
  if (fields['Actual Departure']) updates.actual_departure = fields['Actual Departure'];

  console.log(`[updateServiceRecord] Updating service ${serviceId} with:`, updates);

  const { data, error } = await supabase
    .from('service_records')
    .update(updates)
    .eq('service_id', serviceId)
    .select()
    .single();

  if (error) {
    console.error(`[updateServiceRecord] Error updating service ${serviceId}:`, error);
    return handleSupabaseResponse(null, error, 'UPDATE service record');
  }

  console.log(`[updateServiceRecord] Success for ${serviceId}:`, data);

  return {
    success: true,
    service_record: {
      service_id: data.service_id,
      table_ids: data.table_ids || [],
      status: data.status
    }
  };
};

const completeServiceRecord = async (serviceId) => {
  return updateServiceRecord(serviceId, {
    'Status': 'completed',
    'Actual Departure': new Date().toISOString()
  });
};

const deleteServiceRecord = async (serviceId) => {
  const { data, error } = await supabase
    .from('service_records')
    .delete()
    .eq('service_id', serviceId)
    .select();

  if (error) return handleSupabaseResponse(null, error, 'DELETE service record');

  return {
    success: true,
    message: `Service record ${serviceId} deleted`,
    deleted_count: data ? data.length : 0
  };
};

// ============ RESTAURANT INFO ============

const getRestaurantInfo = async () => {
  const { data, error } = await supabase
    .from('restaurant_info')
    .select('*')
    .limit(1)
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

const updateRestaurantPlan = async (plan, customerEmail = null) => {
  // Get current restaurant info
  const { data: current, error: fetchError } = await supabase
    .from('restaurant_info')
    .select('id, metric_profile')
    .limit(1)
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
    .from('restaurant_info')
    .update({ metric_profile: updatedProfile })
    .eq('id', current.id)
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

// ============ SUBSCRIPTIONS ============

const getSubscriptions = async (filter = {}) => {
  let query = supabase.from('subscriptions').select('*');

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

const getSubscriptionByCustomerId = async (customerId) => {
  const result = await getSubscriptions({ customer_id: customerId });

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

const getSubscriptionByEmail = async (email) => {
  // First, try to get from subscriptions table
  const { data: subscriptions, error: subError } = await supabase
    .from('subscriptions')
    .select('*')
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

  // Fallback: Check restaurant_info.metric_profile.plan (set during onboarding)
  const { data: restaurantInfo, error: infoError } = await supabase
    .from('restaurant_info')
    .select('id, metric_profile')
    .limit(1)
    .single();

  if (!infoError && restaurantInfo && restaurantInfo.metric_profile?.plan) {
    const plan = restaurantInfo.metric_profile.plan;
    return {
      success: true,
      subscription: {
        subscription_id: 'onboarding-plan',
        customer_id: null,
        customer_email: restaurantInfo.metric_profile.customer_email || email,
        plan_name: plan,
        price_id: null,
        status: 'active',  // Assume active if set in onboarding
        current_period_start: restaurantInfo.metric_profile.onboarding_completed_at,
        current_period_end: null,  // No end date for onboarding plans
        trial_end: null,
        canceled_at: null,
        created_at: restaurantInfo.metric_profile.onboarding_completed_at,
        record_id: restaurantInfo.id
      }
    };
  }

  return {
    success: false,
    error: true,
    message: 'Subscription not found'
  };
};

const createSubscription = async (fields) => {
  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
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

const updateSubscription = async (subscriptionId, fields) => {
  const updates = {};

  if (fields['Status']) updates.status = fields['Status'];
  if (fields['Canceled At']) updates.canceled_at = fields['Canceled At'];
  if (fields['Current Period Start']) updates.current_period_start = fields['Current Period Start'];
  if (fields['Current Period End']) updates.current_period_end = fields['Current Period End'];

  const { data, error } = await supabase
    .from('subscriptions')
    .update(updates)
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

const cancelSubscription = async (subscriptionId) => {
  return updateSubscription(subscriptionId, {
    'Status': 'canceled',
    'Canceled At': new Date().toISOString().split('T')[0]
  });
};

// ============ UTILITIES ============

// Use cryptographically secure ID generators from secure-id.js
// These replace the insecure Math.random() versions to prevent ID enumeration attacks
const generateReservationId = generateSecureReservationId;
const generateServiceId = generateSecureServiceId;

// ============ RESERVATION HELPERS ============

const findReservation = async ({ reservation_id, customer_phone, customer_name }) => {
  let query = supabase.from('reservations').select('*');

  if (reservation_id) {
    query = query.eq('reservation_id', reservation_id);
  } else if (customer_phone) {
    query = query.eq('customer_phone', customer_phone);
  } else if (customer_name) {
    query = query.ilike('customer_name', `%${customer_name}%`);
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) {
    return {
      success: false,
      error: true,
      message: 'Reservation not found'
    };
  }

  return {
    success: true,
    reservation: {
      reservation_id: data.reservation_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      customer_email: data.customer_email || '',
      party_size: data.party_size,
      reservation_time: `${data.date} ${data.time}`,
      special_requests: data.special_requests || '',
      status: data.status,
      record_id: data.id
    }
  };
};

const cancelReservation = async (reservationId) => {
  const result = await findReservation({ reservation_id: reservationId });

  if (!result.success) {
    return result;
  }

  const updateResult = await updateReservation(result.reservation.record_id, {
    'Status': 'cancelled'
  });

  if (!updateResult.success) {
    return updateResult;
  }

  return {
    success: true,
    message: `Reservation ${reservationId} has been cancelled`,
    reservation: result.reservation
  };
};

const markReservationAsNoShow = async (recordId) => {
  const updateResult = await updateReservation(recordId, {
    'Status': 'no-show',
    'Notes': 'Automatically marked as no-show - 20+ minutes late without check-in'
  });

  if (!updateResult.success) {
    return updateResult;
  }

  return {
    success: true,
    message: 'Reservation marked as no-show',
    record_id: recordId
  };
};

const getUpcomingReservations = async () => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .or(`date.gt.${today},and(date.eq.${today},time.gte.${now.toTimeString().slice(0, 5)})`)
    .in('status', ['confirmed', 'waitlist'])
    .order('date', { ascending: true })
    .order('time', { ascending: true });

  if (error) return handleSupabaseResponse(null, error, 'GET upcoming reservations');

  const reservations = data.map(r => ({
    reservation_id: r.reservation_id,
    customer_name: r.customer_name,
    customer_phone: r.customer_phone,
    customer_email: r.customer_email || '',
    party_size: r.party_size,
    date: r.date,
    time: r.time,
    reservation_time: `${r.date} ${r.time}`,
    special_requests: r.special_requests || '',
    checked_in: !!r.checked_in_at,
    checked_in_at: r.checked_in_at || null,
    status: r.status,
    record_id: r.id,
    // ML Prediction fields (modern format)
    ml_risk_score: r.ml_risk_score,
    ml_risk_level: r.ml_risk_level,
    ml_confidence: r.ml_confidence,
    ml_model_version: r.ml_model_version,
    // Legacy field names (deprecated, kept for backwards compatibility)
    no_show_risk_score: r.ml_risk_score,
    no_show_risk_level: r.ml_risk_level,
    prediction_confidence: r.ml_confidence
  }));

  return {
    success: true,
    reservations
  };
};

// ============ TABLE HELPERS ============

const getAllTables = async () => {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('is_active', true)
    .order('table_number', { ascending: true });

  if (error) return handleSupabaseResponse(null, error, 'GET all tables');

  const tables = data.map(t => ({
    id: t.id,
    table_number: t.table_number,
    capacity: t.capacity,
    location: t.location || 'Main',
    status: t.status || 'available',
    current_service_id: t.current_service_id || null,
    // Flexible table support
    is_fixed: t.is_fixed || false,
    min_capacity: t.min_capacity || 1,
    max_capacity: t.max_capacity || null,
    adjacent_tables: t.adjacent_tables || [],
    combination_group: t.combination_group || null
  }));

  return {
    success: true,
    tables
  };
};

/**
 * Calculate total available covers (seats) for a given time slot
 * This includes both single tables AND potential combinations of flexible tables
 * Used to answer "Do you have space for X people?" without exposing table details
 */
const calculateAvailableCovers = async () => {
  const tablesResult = await getAllTables();
  if (!tablesResult.success) return { success: false, available_covers: 0 };

  const availableTables = tablesResult.tables.filter(t => t.status === 'available');

  // Calculate total direct capacity from available tables
  const directCapacity = availableTables.reduce((sum, t) => sum + t.capacity, 0);

  // Calculate potential additional capacity from table combinations
  // Group flexible tables by location for potential combinations
  const flexibleByLocation = {};
  availableTables.filter(t => !t.is_fixed).forEach(t => {
    const location = t.location || 'Main';
    if (!flexibleByLocation[location]) {
      flexibleByLocation[location] = [];
    }
    flexibleByLocation[location].push(t);
  });

  // For each location, calculate max party size that can be accommodated
  // by combining flexible tables
  const maxPartySizeByLocation = {};
  for (const [location, tables] of Object.entries(flexibleByLocation)) {
    // Sum of all flexible table capacities in this location = max party size
    maxPartySizeByLocation[location] = tables.reduce((sum, t) => sum + t.capacity, 0);
  }

  // Find the largest single party we could accommodate
  const fixedTables = availableTables.filter(t => t.is_fixed);
  const largestFixedCapacity = fixedTables.length > 0
    ? Math.max(...fixedTables.map(t => t.capacity))
    : 0;
  const largestFlexibleCapacity = Object.values(maxPartySizeByLocation).length > 0
    ? Math.max(...Object.values(maxPartySizeByLocation))
    : 0;
  const maxSinglePartySize = Math.max(largestFixedCapacity, largestFlexibleCapacity);

  return {
    success: true,
    available_covers: directCapacity,
    available_tables: availableTables.length,
    max_single_party_size: maxSinglePartySize,
    flexible_tables_by_location: maxPartySizeByLocation,
    can_accommodate: (partySize) => {
      // Check fixed tables first
      if (fixedTables.some(t => t.capacity >= partySize)) return true;
      // Check flexible table combinations
      return Object.values(maxPartySizeByLocation).some(cap => cap >= partySize);
    }
  };
};

/**
 * Check if restaurant can accommodate a party of given size
 * Returns true/false without exposing internal table details
 */
const canAccommodateParty = async (partySize) => {
  const tablesResult = await getAllTables();
  if (!tablesResult.success) return { success: false, can_accommodate: false };

  const availableTables = tablesResult.tables.filter(t => t.status === 'available');

  // Check single tables first
  if (availableTables.some(t => t.capacity >= partySize)) {
    return { success: true, can_accommodate: true };
  }

  // Check flexible table combinations by location
  const flexibleByLocation = {};
  availableTables.filter(t => !t.is_fixed).forEach(t => {
    const location = t.location || 'Main';
    if (!flexibleByLocation[location]) {
      flexibleByLocation[location] = [];
    }
    flexibleByLocation[location].push(t);
  });

  for (const [, tables] of Object.entries(flexibleByLocation)) {
    const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
    if (totalCapacity >= partySize) {
      return { success: true, can_accommodate: true };
    }
  }

  return { success: true, can_accommodate: false };
};

/**
 * Check if a table is flexible (can be combined with others)
 * Fixed tables (round tables, booths) cannot be combined
 */
const isFlexibleTable = (table) => {
  // is_fixed = true means it CANNOT be combined (round table, booth)
  // Default to flexible (can combine) if not specified
  return table.is_fixed !== true;
};

/**
 * Check if two tables can be combined based on adjacency rules
 * MVP: Same location = can combine (implicit adjacency)
 * Advanced: Explicit adjacent_tables array or combination_group
 */
const canCombineTables = (table1, table2) => {
  // Both tables must be flexible (not fixed)
  if (!isFlexibleTable(table1) || !isFlexibleTable(table2)) {
    return false;
  }

  // Check explicit adjacency first (if defined)
  const adjacent1 = table1.adjacent_tables || [];
  const adjacent2 = table2.adjacent_tables || [];

  if (adjacent1.length > 0 || adjacent2.length > 0) {
    // If adjacency is explicitly defined, use it
    return adjacent1.includes(table2.id) || adjacent2.includes(table1.id);
  }

  // Check combination group (if defined)
  const group1 = table1.combination_group;
  const group2 = table2.combination_group;

  if (group1 && group2) {
    return group1 === group2;
  }

  // MVP fallback: Same location means can combine
  return table1.location === table2.location;
};

const findBestTableCombination = (availableTables, partySize) => {
  const recommendations = [];

  // Try single table first (any table can be used individually)
  for (const table of availableTables) {
    if (table.capacity >= partySize) {
      const waste = table.capacity - partySize;
      let matchQuality = 'perfect';
      if (waste === 0) matchQuality = 'perfect';
      else if (waste <= 1) matchQuality = 'good';
      else if (waste <= 2) matchQuality = 'acceptable';
      else matchQuality = 'waste';

      recommendations.push({
        tables: [table.table_number],
        table_ids: [table.id],  // UUIDs for API operations
        total_capacity: table.capacity,
        match_quality: matchQuality,
        score: waste === 0 ? 100 : Math.max(0, 100 - waste * 10),
        reason: waste === 0
          ? `Perfect fit for ${partySize}`
          : `Table seats ${table.capacity}, wastes ${waste} seat${waste > 1 ? 's' : ''}`
      });
    }
  }

  // Try combinations of 2 tables (only flexible tables that can combine)
  const flexibleTables = availableTables.filter(isFlexibleTable);

  for (let i = 0; i < flexibleTables.length; i++) {
    for (let j = i + 1; j < flexibleTables.length; j++) {
      const table1 = flexibleTables[i];
      const table2 = flexibleTables[j];

      // Check if these tables can actually be combined
      if (!canCombineTables(table1, table2)) {
        continue;
      }

      const totalCapacity = table1.capacity + table2.capacity;
      if (totalCapacity >= partySize && totalCapacity <= partySize + 4) {
        const waste = totalCapacity - partySize;
        let matchQuality = 'acceptable';
        if (waste <= 1) matchQuality = 'good';
        if (waste === 0) matchQuality = 'perfect';

        // Same location combinations score higher
        const sameLocation = table1.location === table2.location;
        const baseScore = sameLocation ? 95 : 85;

        recommendations.push({
          tables: [table1.table_number, table2.table_number],
          table_ids: [table1.id, table2.id],  // UUIDs for API operations
          total_capacity: totalCapacity,
          match_quality: matchQuality,
          score: waste === 0 ? baseScore : Math.max(0, baseScore - waste * 10),
          reason: `Combination seats ${totalCapacity}, wastes ${waste} seat${waste > 1 ? 's' : ''}`,
          is_combination: true,
          location: sameLocation ? table1.location : 'Mixed'
        });
      }
    }
  }

  // Sort by score
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations;
};

module.exports = {
  // Raw Supabase client for advanced queries
  query: supabase,

  // Reservations
  getReservations,
  getReservationById,
  createReservation,
  updateReservation,
  findReservation,
  cancelReservation,
  markReservationAsNoShow,
  getUpcomingReservations,

  // Tables
  getTables,
  getAllTables,
  getAllTablesAdmin,
  getAvailableTables,
  getTableByNumber,
  getTableById,
  createTable,
  updateTable,
  updateTableConfig,
  updateTableStatus,
  deleteTable,
  findBestTableCombination,
  // Flexible table helpers
  isFlexibleTable,
  canCombineTables,
  calculateAvailableCovers,
  canAccommodateParty,

  // Service Records
  getServiceRecords,
  getActiveServiceRecords,
  createServiceRecord,
  updateServiceRecord,
  completeServiceRecord,
  deleteServiceRecord,

  // Restaurant Info
  getRestaurantInfo,
  updateRestaurantPlan,

  // Subscriptions
  getSubscriptions,
  getSubscriptionByCustomerId,
  getSubscriptionByEmail,
  createSubscription,
  updateSubscription,
  cancelSubscription,

  // Utilities
  generateReservationId,
  generateServiceId
};
