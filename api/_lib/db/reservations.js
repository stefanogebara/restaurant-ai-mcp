/**
 * Reservation CRUD and helpers
 * Extracted from supabase.js
 */

const { supabase, handleSupabaseResponse } = require('./clients');
const { generateSecureReservationId } = require('../secure-id');
const { getLocalDate, getLocalTime } = require('../timezone');
const { sanitizeSearchQuery } = require('../validation');

// ============ RESERVATIONS ============

const getReservations = async (restaurantId, filter = {}) => {
  let query = supabase.from('reservations').select('*')
    .eq('restaurant_id', restaurantId);

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

const getReservationById = async (restaurantId, reservationId) => {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurantId)
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

const createReservation = async (restaurantId, fields) => {
  const { data, error } = await supabase
    .from('reservations')
    .insert({
      restaurant_id: restaurantId,
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

const updateReservation = async (restaurantId, recordId, fields) => {
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
    .eq('restaurant_id', restaurantId)
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

// ============ RESERVATION HELPERS ============

const findReservation = async (restaurantId, { reservation_id, customer_phone, customer_name }) => {
  let query = supabase.from('reservations').select('*')
    .eq('restaurant_id', restaurantId);

  if (reservation_id) {
    query = query.eq('reservation_id', reservation_id);
  } else if (customer_phone) {
    query = query.eq('customer_phone', customer_phone);
  } else if (customer_name) {
    query = query.ilike('customer_name', `%${sanitizeSearchQuery(customer_name)}%`);
  }

  // Get recent reservations, ordered by date descending
  const { data, error } = await query
    .order('date', { ascending: false })
    .limit(10);

  // Pick the best match: confirmed > pending > others, most recent first
  const statusPriority = { confirmed: 0, pending: 1, 'no-show': 2, cancelled: 3 };
  const sorted = (data || []).sort((a, b) => {
    const aPri = statusPriority[a.status] ?? 9;
    const bPri = statusPriority[b.status] ?? 9;
    if (aPri !== bPri) return aPri - bPri;
    return new Date(b.date) - new Date(a.date);
  });
  const bestMatch = sorted[0];

  if (error || !bestMatch) {

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
      reservation_id: bestMatch.reservation_id,
      customer_name: bestMatch.customer_name,
      customer_phone: bestMatch.customer_phone,
      customer_email: bestMatch.customer_email || '',
      party_size: bestMatch.party_size,
      reservation_time: `${bestMatch.date} ${bestMatch.time}`,
      special_requests: bestMatch.special_requests || '',
      status: bestMatch.status,
      record_id: bestMatch.id
    }
  };
};

const cancelReservation = async (restaurantId, reservationId) => {
  const result = await findReservation(restaurantId, { reservation_id: reservationId });

  if (!result.success) {
    return result;
  }

  const updateResult = await updateReservation(restaurantId, result.reservation.record_id, {
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

const markReservationAsNoShow = async (restaurantId, recordId) => {
  const updateResult = await updateReservation(restaurantId, recordId, {
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

const getUpcomingReservations = async (restaurantId, timezone) => {
  // Use restaurant-local time to determine "today" and "now"
  const today = timezone ? getLocalDate(timezone) : new Date().toISOString().split('T')[0];
  const currentTime = timezone ? getLocalTime(timezone) : new Date().toTimeString().slice(0, 5);

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    // SAFE: today and currentTime are server-generated date strings from getLocalDate/getLocalTime,
    // not user input. No injection risk via .or() interpolation.
    .or(`date.gt.${today},and(date.eq.${today},time.gte.${currentTime})`)
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
    prediction_confidence: r.ml_confidence,
    // Deposit fields
    deposit_amount: r.deposit_amount || null,
    deposit_payment_intent_id: r.deposit_payment_intent_id || null,
  }));

  return {
    success: true,
    reservations
  };
};

// Use cryptographically secure ID generators from secure-id.js
// These replace the insecure Math.random() versions to prevent ID enumeration attacks
const generateReservationId = generateSecureReservationId;

module.exports = {
  getReservations,
  getReservationById,
  createReservation,
  updateReservation,
  findReservation,
  cancelReservation,
  markReservationAsNoShow,
  getUpcomingReservations,
  generateReservationId,
};
