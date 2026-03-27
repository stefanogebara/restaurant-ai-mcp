/**
 * Waitlist operations
 * Extracted from supabase.js
 */

const { supabase, supabaseAdmin, handleSupabaseResponse } = require('./clients');
const { createSecureLogger } = require('../secure-logger');
const logger = createSecureLogger('Waitlist');

// ============ WAITLIST FUNCTIONS ============

/**
 * Get waitlist entries for a restaurant
 * @param {string} restaurantId - Restaurant UUID
 * @param {object} options - { status, active, limit }
 */
const getWaitlistEntries = async (restaurantId, options = {}) => {
  let query = supabase
    .from('waitlist')
    .select('*')
    .eq('restaurant_id', restaurantId);

  if (options.active === true) {
    query = query.in('status', ['waiting', 'notified']);
  } else if (options.status) {
    const statuses = options.status.split(',').map(s => s.trim());
    query = query.in('status', statuses);
  }

  query = query.order('added_at', { ascending: true });
  query = query.limit(options.limit || 100);

  const { data, error } = await query;

  if (error) return handleSupabaseResponse(null, error, 'GET waitlist entries');

  return {
    success: true,
    entries: data
  };
};

/**
 * Add entry to waitlist
 * @param {string} restaurantId - Restaurant UUID
 * @param {object} entry - { customer_name, customer_phone, party_size, notes, estimated_wait_minutes }
 */
const addToWaitlist = async (restaurantId, entry) => {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const waitlistId = `WAIT-${dateStr}-${Date.now()}`;

  const insertObj = {
    restaurant_id: restaurantId,
    waitlist_id: waitlistId,
    customer_name: entry.customer_name,
    customer_phone: entry.customer_phone,
    party_size: entry.party_size,
    notes: entry.notes || null,
    estimated_wait_minutes: entry.estimated_wait_minutes || null,
    status: 'waiting',
    ...(entry.source && { source: entry.source }),
    ...(entry.customer_whatsapp && { customer_whatsapp: entry.customer_whatsapp }),
  };

  const { data, error } = await supabase
    .from('waitlist')
    .insert(insertObj)
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'ADD to waitlist');

  return {
    success: true,
    entry: data
  };
};

/**
 * Update a waitlist entry
 * @param {string} entryId - UUID of the waitlist entry
 * @param {string} restaurantId - For ownership verification
 * @param {object} updates - { status, estimated_wait_minutes, notes }
 */
const updateWaitlistEntry = async (entryId, restaurantId, updates) => {
  const allowedFields = {};
  if (updates.status !== undefined) allowedFields.status = updates.status;
  if (updates.estimated_wait_minutes !== undefined) allowedFields.estimated_wait_minutes = updates.estimated_wait_minutes;
  if (updates.notes !== undefined) allowedFields.notes = updates.notes;
  if (updates.notified_at !== undefined) allowedFields.notified_at = updates.notified_at;

  allowedFields.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('waitlist')
    .update(allowedFields)
    .eq('id', entryId)
    .eq('restaurant_id', restaurantId)
    .select()
    .single();

  if (error) return handleSupabaseResponse(null, error, 'UPDATE waitlist entry');

  return {
    success: true,
    entry: data
  };
};

/**
 * Remove entry from waitlist
 * @param {string} entryId - UUID of the waitlist entry
 * @param {string} restaurantId - For ownership verification
 */
const removeFromWaitlist = async (entryId, restaurantId) => {
  const { data, error } = await supabase
    .from('waitlist')
    .delete()
    .eq('id', entryId)
    .eq('restaurant_id', restaurantId)
    .select();

  if (error) return handleSupabaseResponse(null, error, 'DELETE waitlist entry');

  return {
    success: true,
    message: `Waitlist entry ${entryId} removed`,
    deleted_count: data ? data.length : 0
  };
};

/**
 * Get count of active waitlist entries
 * @param {string} restaurantId - Restaurant UUID
 */
const getWaitlistCount = async (restaurantId) => {
  const { count, error } = await supabase
    .from('waitlist')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .in('status', ['waiting', 'notified']);

  if (error) return handleSupabaseResponse(null, error, 'COUNT waitlist entries');

  return {
    success: true,
    count: count || 0
  };
};

// ============ WHATSAPP WAITLIST FUNCTIONS ============

/**
 * Find active waitlist entry by WhatsApp number
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} phone - WhatsApp number (E.164)
 * @returns {{ success: boolean, entry?: object, error?: string }}
 */
const getWaitlistByPhone = async (restaurantId, phone) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('waitlist')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('customer_whatsapp', phone)
      .eq('status', 'waiting')
      .order('added_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return handleSupabaseResponse(null, error, 'GET waitlist by phone');

    return {
      success: true,
      entry: data || null
    };
  } catch (err) {
    logger.error('[getWaitlistByPhone] Unexpected error:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Get position of an entry in the waitlist queue (1-based)
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} entryId - Waitlist entry UUID (unused, kept for API clarity)
 * @param {string} addedAt - ISO timestamp of the entry's added_at
 * @returns {{ success: boolean, position?: number, error?: string }}
 */
const getWaitlistPosition = async (restaurantId, entryId, addedAt) => {
  try {
    const { count, error } = await supabaseAdmin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('status', 'waiting')
      .lt('added_at', addedAt);

    if (error) return handleSupabaseResponse(null, error, 'GET waitlist position');

    return {
      success: true,
      position: (count || 0) + 1
    };
  } catch (err) {
    logger.error('[getWaitlistPosition] Unexpected error:', err);
    return { success: false, error: err.message };
  }
};

/**
 * Get average wait time in minutes for last 24 hours
 * @param {string} restaurantId - Restaurant UUID
 * @returns {{ success: boolean, averageMinutes?: number, error?: string }}
 */
const getAverageWaitTime = async (restaurantId) => {
  const DEFAULT_WAIT_MINUTES = 20;

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('waitlist')
      .select('added_at, notified_at')
      .eq('restaurant_id', restaurantId)
      .not('notified_at', 'is', null)
      .gt('notified_at', twentyFourHoursAgo);

    if (error) return handleSupabaseResponse(null, error, 'GET average wait time');

    if (!data || data.length === 0) {
      return {
        success: true,
        averageMinutes: DEFAULT_WAIT_MINUTES
      };
    }

    const totalMinutes = data.reduce((sum, row) => {
      const diffMs = new Date(row.notified_at) - new Date(row.added_at);
      return sum + diffMs / (1000 * 60);
    }, 0);

    return {
      success: true,
      averageMinutes: Math.round(totalMinutes / data.length)
    };
  } catch (err) {
    logger.error('[getAverageWaitTime] Unexpected error:', err);
    return { success: false, error: err.message };
  }
};

module.exports = {
  getWaitlistEntries,
  addToWaitlist,
  updateWaitlistEntry,
  removeFromWaitlist,
  getWaitlistCount,
  getWaitlistByPhone,
  getWaitlistPosition,
  getAverageWaitTime,
};
