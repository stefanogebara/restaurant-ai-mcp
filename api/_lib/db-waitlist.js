/**
 * Waitlist Database Operations
 *
 * All waitlist CRUD functions.
 * Multi-tenant: every query is scoped by restaurant_id.
 */

const { supabase, handleSupabaseResponse, withRetry } = require('./db-clients');

// ============ WAITLIST FUNCTIONS ============

/**
 * Get waitlist entries for a restaurant
 * @param {string} restaurantId - Restaurant UUID
 * @param {object} options - { status, active, limit }
 */
const getWaitlistEntries = async (restaurantId, options = {}) => {
  let data, error;
  try {
    ({ data, error } = await withRetry(() => {
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
      return query;
    }));
  } catch (err) {
    return handleSupabaseResponse(null, err, 'GET waitlist entries');
  }

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

  let data, error;
  try {
    ({ data, error } = await withRetry(() =>
      supabase
        .from('waitlist')
        .insert({
          restaurant_id: restaurantId,
          waitlist_id: waitlistId,
          customer_name: entry.customer_name,
          customer_phone: entry.customer_phone,
          party_size: entry.party_size,
          notes: entry.notes || null,
          estimated_wait_minutes: entry.estimated_wait_minutes || null,
          status: 'waiting'
        })
        .select()
        .single()
    ));
  } catch (err) {
    return handleSupabaseResponse(null, err, 'ADD to waitlist');
  }

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

  allowedFields.updated_at = new Date().toISOString();

  let data, error;
  try {
    ({ data, error } = await withRetry(() =>
      supabase
        .from('waitlist')
        .update(allowedFields)
        .eq('id', entryId)
        .eq('restaurant_id', restaurantId)
        .select()
        .single()
    ));
  } catch (err) {
    return handleSupabaseResponse(null, err, 'UPDATE waitlist entry');
  }

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
  let data, error;
  try {
    ({ data, error } = await withRetry(() =>
      supabase
        .from('waitlist')
        .delete()
        .eq('id', entryId)
        .eq('restaurant_id', restaurantId)
        .select()
    ));
  } catch (err) {
    return handleSupabaseResponse(null, err, 'DELETE waitlist entry');
  }

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
  let count, error;
  try {
    ({ count, error } = await withRetry(() =>
      supabase
        .from('waitlist')
        .select('*', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId)
        .in('status', ['waiting', 'notified'])
    ));
  } catch (err) {
    return handleSupabaseResponse(null, err, 'COUNT waitlist entries');
  }

  if (error) return handleSupabaseResponse(null, error, 'COUNT waitlist entries');

  return {
    success: true,
    count: count || 0
  };
};

module.exports = {
  getWaitlistEntries,
  addToWaitlist,
  updateWaitlistEntry,
  removeFromWaitlist,
  getWaitlistCount,
};
