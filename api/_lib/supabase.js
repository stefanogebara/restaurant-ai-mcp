/**
 * Supabase Database Service Layer
 * PostgreSQL-based replacement for Airtable
 * Provides same API interface as airtable.js for easy migration
 */

const { createClient } = require('@supabase/supabase-js');

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

  if (fields['Status']) updates.status = fields['Status'];
  if (fields['Checked In At']) updates.checked_in_at = fields['Checked In At'];
  if (fields['Table IDs']) updates.table_ids = fields['Table IDs'];
  if (fields['Notes']) updates.notes = fields['Notes'];
  if (fields['ML Risk Score']) updates.ml_risk_score = fields['ML Risk Score'];
  if (fields['ML Risk Level']) updates.ml_risk_level = fields['ML Risk Level'];
  if (fields['ML Confidence']) updates.ml_confidence = fields['ML Confidence'];
  if (fields['ML Model Version']) updates.ml_model_version = fields['ML Model Version'];
  if (fields['ML Prediction Timestamp']) updates.ml_prediction_timestamp = fields['ML Prediction Timestamp'];

  const { data, error } = await supabase
    .from('reservations')
    .update(updates)
    .eq('id', recordId)
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

  const { data, error } = await supabase
    .from('tables')
    .update(updates)
    .eq('id', recordId)
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'UPDATE table');

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

  const { data, error } = await supabase
    .from('service_records')
    .update(updates)
    .eq('service_id', serviceId)
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'UPDATE service record');

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
  const result = await getSubscriptions({ customer_email: email });

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

const generateReservationId = () => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `RES-${dateStr}-${randomNum}`;
};

const generateServiceId = () => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `SVC-${dateStr}-${randomNum}`;
};

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
    // ML Prediction fields
    no_show_risk_score: r.ml_risk_score,
    no_show_risk_level: r.ml_risk_level,
    prediction_confidence: r.ml_confidence,
    ml_model_version: r.ml_model_version
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
    current_service_id: t.current_service_id || null
  }));

  return {
    success: true,
    tables
  };
};

const findBestTableCombination = (availableTables, partySize) => {
  const recommendations = [];

  // Try single table first
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
        total_capacity: table.capacity,
        match_quality: matchQuality,
        score: waste === 0 ? 100 : Math.max(0, 100 - waste * 10),
        reason: waste === 0
          ? `Perfect fit for ${partySize}`
          : `Table seats ${table.capacity}, wastes ${waste} seat${waste > 1 ? 's' : ''}`
      });
    }
  }

  // Try combinations of 2 tables
  for (let i = 0; i < availableTables.length; i++) {
    for (let j = i + 1; j < availableTables.length; j++) {
      const totalCapacity = availableTables[i].capacity + availableTables[j].capacity;
      if (totalCapacity >= partySize) {
        const waste = totalCapacity - partySize;
        let matchQuality = 'acceptable';
        if (waste <= 1) matchQuality = 'good';
        if (waste === 0) matchQuality = 'perfect';

        recommendations.push({
          tables: [availableTables[i].table_number, availableTables[j].table_number],
          total_capacity: totalCapacity,
          match_quality: matchQuality,
          score: waste === 0 ? 95 : Math.max(0, 95 - waste * 10),
          reason: `Combination seats ${totalCapacity}, wastes ${waste} seat${waste > 1 ? 's' : ''}`
        });
      }
    }
  }

  // Sort by score
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations;
};

module.exports = {
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
  getAvailableTables,
  getTableByNumber,
  updateTable,
  updateTableStatus,
  findBestTableCombination,

  // Service Records
  getServiceRecords,
  getActiveServiceRecords,
  createServiceRecord,
  updateServiceRecord,
  completeServiceRecord,

  // Restaurant Info
  getRestaurantInfo,

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
