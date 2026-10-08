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
 * @param {object} options - { status, active, source, search, limit, offset, newestFirst }
 */
const getWaitlistEntries = async (restaurantId, options = {}) => {
  // select all columns — entries are returned directly to the client and all fields are needed
  let query = supabase
    .from('waitlist')
    .select('id, waitlist_id, restaurant_id, customer_name, customer_phone, customer_whatsapp, party_size, notes, estimated_wait_minutes, status, source, added_at, notified_at, updated_at', { count: 'exact' })
    .eq('restaurant_id', restaurantId);

  if (options.active === true) {
    query = query.in('status', ['waiting', 'notified']);
  } else if (options.status) {
    const statuses = options.status.split(',').map(s => s.trim());
    query = query.in('status', statuses);
  }

  if (options.source === 'whatsapp') {
    query = query.in('source', ['whatsapp', 'whatsapp_ai']);
  } else if (options.source === 'walk_in') {
    query = query.or('source.is.null,source.eq.walk_in');
  }

  if (options.search) {
    // PostgREST's raw `or` grammar must not receive punctuation from input.
    // Keep phone digits, + and - and Unicode letters for guest names.
    const term = options.search.replace(/[^\p{L}\p{N}\s+\-]/gu, '').trim();
    if (term) query = query.or(`customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%`);
  }

  // A notified party needs action even when a restaurant has many older
  // waiting rows. The active page keeps each status group FIFO.
  if (options.active || options.status === 'waiting,notified') {
    query = query.order('status', { ascending: true });
  }
  query = query.order('added_at', { ascending: !options.newestFirst }).order('id', { ascending: !options.newestFirst });
  const limit = options.limit || 50;
  const offset = options.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error || !Array.isArray(data) || !Number.isFinite(count)) {
    return handleSupabaseResponse(null, error || new Error('Missing waitlist page or count'), 'GET waitlist entries');
  }

  return {
    success: true,
    entries: data,
    total: count
  };
};

/** Exact counts for the three status tabs, independent of page and filters. */
const getWaitlistStatusCounts = async (restaurantId) => {
  const groups = {
    active: ['waiting', 'notified'],
    seated: ['seated'],
    removed: ['cancelled', 'no_show'],
  };
  const results = await Promise.all(Object.entries(groups).map(async ([group, statuses]) => {
    const { count, error } = await supabase
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .in('status', statuses);
    return { group, count, error };
  }));
  const failure = results.find(result => result.error || !Number.isFinite(result.count));
  if (failure) return handleSupabaseResponse(null, failure.error || new Error('Missing waitlist count'), 'COUNT waitlist statuses');
  return { success: true, counts: Object.fromEntries(results.map(({ group, count }) => [group, count])) };
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

  // A missing count is not an empty queue. Keep the dashboard's unknown state
  // instead of manufacturing a reassuring zero from a malformed response.
  if (!Number.isFinite(count)) {
    logger.error('COUNT waitlist entries returned no count');
    return { success: false, count: null };
  }

  return {
    success: true,
    count
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
      .select('id, waitlist_id, restaurant_id, customer_name, customer_phone, customer_whatsapp, party_size, notes, estimated_wait_minutes, status, source, added_at, notified_at, updated_at')
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
  getWaitlistStatusCounts,
  addToWaitlist,
  updateWaitlistEntry,
  removeFromWaitlist,
  getWaitlistCount,
  getWaitlistByPhone,
  getWaitlistPosition,
  getAverageWaitTime,
};
