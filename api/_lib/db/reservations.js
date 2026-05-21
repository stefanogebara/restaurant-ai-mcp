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
  let query = supabase.from('reservations').select('id, reservation_id, customer_name, customer_phone, customer_email, party_size, date, time, special_requests, status, table_ids, checked_in_at, notes, ml_risk_score, ml_risk_level, ml_confidence, ml_model_version, ml_prediction_timestamp, created_at')
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

  // DD.1 — push limit + sort down to DB. The previous version pulled the
  // entire history (could be 50k rows for a busy restaurant) then sliced
  // in JS. `limit` is clamped to 500 to avoid runaway memory; pass a
  // smaller value via filter for cheaper list calls.
  const limit = Math.min(500, Math.max(1, Number(filter.limit) || 200));
  const orderBy = filter.order_by === 'created_at' ? 'created_at' : 'date';
  const ascending = filter.ascending !== false; // default true

  const { data, error } = await query.order(orderBy, { ascending }).limit(limit);

  if (error) return handleSupabaseResponse(null, error, 'GET reservations');

  return {
    success: true,
    data: {
      records: data.map(r => ({
        id: r.id,
        reservation_id: r.reservation_id,
        customer_name: r.customer_name,
        customer_phone: r.customer_phone,
        customer_email: r.customer_email,
        party_size: r.party_size,
        date: r.date,
        time: r.time,
        special_requests: r.special_requests,
        status: r.status,
        table_ids: r.table_ids,
        checked_in_at: r.checked_in_at,
        notes: r.notes,
        created_at: r.created_at,
        ml_risk_score: r.ml_risk_score,
        ml_risk_level: r.ml_risk_level,
        ml_confidence: r.ml_confidence,
        ml_model_version: r.ml_model_version,
        ml_prediction_timestamp: r.ml_prediction_timestamp
      }))
    }
  };
};

const getReservationById = async (restaurantId, reservationId) => {
  const { data, error } = await supabase
    .from('reservations')
    .select('id, reservation_id, customer_name, customer_phone, customer_email, party_size, date, time, special_requests, status, table_ids, checked_in_at')
    .eq('restaurant_id', restaurantId)
    .eq('reservation_id', reservationId)
    .single();

  if (error) return handleSupabaseResponse(null, error, 'GET reservation by ID');
  if (!data) return { success: false, error: true, message: 'Reservation not found' };

  return {
    success: true,
    data: {
      id: data.id,
      reservation_id: data.reservation_id,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      customer_email: data.customer_email,
      party_size: data.party_size,
      date: data.date,
      time: data.time,
      special_requests: data.special_requests,
      status: data.status,
      table_ids: data.table_ids,
      checked_in_at: data.checked_in_at
    }
  };
};

const createReservation = async (restaurantId, fields) => {
  const { data, error } = await supabase
    .from('reservations')
    .insert({
      restaurant_id: restaurantId,
      reservation_id: fields.reservation_id,
      customer_name: fields.customer_name,
      customer_phone: fields.customer_phone,
      customer_email: fields.customer_email,
      party_size: fields.party_size,
      date: fields.date,
      time: fields.time,
      special_requests: fields.special_requests,
      status: fields.status || 'pending',
      table_ids: fields.table_ids || [],
      notes: fields.notes
    })
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'CREATE reservation');

  return {
    success: true,
    data: {
      id: data.id,
      reservation_id: data.reservation_id,
      customer_name: data.customer_name,
      status: data.status
    }
  };
};

const updateReservation = async (restaurantId, recordId, fields) => {
  const updates = {};

  // Core reservation fields
  if (fields.date !== undefined) updates.date = fields.date;
  if (fields.time !== undefined) updates.time = fields.time;
  if (fields.party_size !== undefined) updates.party_size = fields.party_size;
  if (fields.special_requests !== undefined) updates.special_requests = fields.special_requests;
  if (fields.updated_at !== undefined) updates.updated_at = fields.updated_at;

  // Status and tracking fields
  if (fields.status !== undefined) updates.status = fields.status;
  if (fields.checked_in_at !== undefined) updates.checked_in_at = fields.checked_in_at;
  if (fields.table_ids !== undefined) updates.table_ids = fields.table_ids;
  if (fields.notes !== undefined) updates.notes = fields.notes;
  if (fields.customer_history !== undefined) updates.customer_history = fields.customer_history;

  // ML prediction fields
  if (fields.ml_risk_score !== undefined) updates.ml_risk_score = fields.ml_risk_score;
  if (fields.ml_risk_level !== undefined) updates.ml_risk_level = fields.ml_risk_level;
  if (fields.ml_confidence !== undefined) updates.ml_confidence = fields.ml_confidence;
  if (fields.ml_model_version !== undefined) updates.ml_model_version = fields.ml_model_version;
  if (fields.ml_prediction_timestamp !== undefined) updates.ml_prediction_timestamp = fields.ml_prediction_timestamp;

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
      reservation_id: data.reservation_id,
      status: data.status
    }
  };
};

// ============ RESERVATION HELPERS ============

const findReservation = async (restaurantId, { reservation_id, customer_phone, customer_name }) => {
  let query = supabase.from('reservations').select('id, reservation_id, customer_name, customer_phone, customer_email, party_size, date, time, special_requests, status')
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
      date: bestMatch.date,
      time: bestMatch.time,
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
    status: 'cancelled',
    table_ids: []  // Free up the tables for other reservations
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
    status: 'no-show',
    notes: 'Automatically marked as no-show - 20+ minutes late without check-in'
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
    .select('id, reservation_id, customer_name, customer_phone, customer_email, party_size, date, time, special_requests, status, checked_in_at, ml_risk_score, ml_risk_level, ml_confidence, ml_model_version, deposit_amount, deposit_payment_intent_id')
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
