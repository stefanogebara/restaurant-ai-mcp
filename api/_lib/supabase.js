/**
 * Supabase Database Service Layer
 * PostgreSQL-based replacement for Airtable
 * Provides same API interface as airtable.js for easy migration
 *
 * MULTI-TENANCY: All operational queries are scoped by restaurant_id.
 * Every function that touches reservations, tables, waitlist,
 * service_records, or subscriptions requires a restaurantId parameter.
 *
 * CLIENT SPLIT:
 *   supabaseAdmin  – SERVICE_ROLE_KEY, bypasses RLS. Used for webhooks,
 *                    cron jobs, health checks, and cross-tenant admin ops.
 *   supabaseClient – ANON_KEY, respects RLS. Available for future use
 *                    when passing user JWTs for per-request RLS enforcement.
 *   createAuthClient(token) – Factory that returns an anon-key client
 *                    with the user's JWT set, enabling RLS enforcement.
 *
 * Current operational functions use supabaseAdmin because they already
 * enforce restaurant_id at the application layer. As the platform matures,
 * these can migrate to per-request auth clients for defense-in-depth.
 */

const { createClient } = require('@supabase/supabase-js');
const { generateSecureReservationId, generateSecureServiceId } = require('./secure-id');
const { getLocalDate, getLocalTime } = require('./timezone');
const { createSecureLogger } = require('./secure-logger');
const { withRetry: _withRetry } = require('./db-clients');
const { sanitizeSearchQuery } = require('./validation');
const logger = createSecureLogger('Supabase');

// ============ SUPABASE CLIENTS ============

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  logger.error('[Supabase] CRITICAL: Missing SUPABASE_URL');
}
if (!serviceRoleKey) {
  logger.error('[Supabase] WARNING: Missing SUPABASE_SERVICE_ROLE_KEY. Admin operations will fail.');
}
if (!anonKey) {
  logger.error('[Supabase] WARNING: Missing SUPABASE_ANON_KEY. RLS-aware client unavailable.');
}

// Admin client – bypasses RLS (for webhooks, crons, health checks, cross-tenant ops)
const supabaseAdmin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

// Public client – respects RLS (for future per-request auth usage)
const supabaseClient = anonKey
  ? createClient(supabaseUrl, anonKey)
  : null;

/**
 * Create a per-request Supabase client with a user's JWT token.
 * This client respects RLS policies, providing defense-in-depth
 * beyond the application-layer restaurant_id scoping.
 * @param {string} token - User's JWT/access token
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function createAuthClient(token) {
  if (!anonKey || !supabaseUrl) {
    throw new Error('Cannot create auth client: missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }
  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

// Primary client used by all operational functions.
// Falls back to anon key if service_role is unavailable.
const supabase = supabaseAdmin || supabaseClient;

// ============ HELPER FUNCTIONS ============

const handleSupabaseResponse = (data, error, operation = 'query') => {
  if (error) {
    logger.error(`[Supabase ${operation}] Error:`, error);
    return {
      success: false,
      error: true,
      message: error.message || 'Database operation failed'
    };
  }

  logger.info(`[Supabase ${operation}] Success`);
  return { success: true, data };
};

// ============ RETRY UTILITY ============
// withRetry is defined in db-clients.js (canonical location) and re-exported
// here for backward compatibility with any code that imports from supabase.js.
const withRetry = _withRetry;

// ============ RESERVATIONS ============

const getReservations = async (restaurantId, filter = {}) => {
  let query = supabase.from('reservations').select('*')
    .eq('restaurant_id', restaurantId);

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

// ============ TABLES ============

const getTables = async (restaurantId, filter = {}) => {
  let query = supabase.from('tables').select('*')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true);

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
          'Is Active': t.is_active,
          // Shape configuration
          'Shape': t.shape || 'square',
          'Is Fixed Seating': t.is_fixed_seating || false,
          // Joinable table configuration
          'Is Joinable': t.is_joinable !== false, // Default to true
          'Joinable With': t.joinable_with || [],
          // Floor plan positioning
          'Position X': t.position_x || 0,
          'Position Y': t.position_y || 0,
          'Width': t.width || 1,
          'Height': t.height || 1,
          'Rotation': t.rotation || 0
        }
      }))
    }
  };
};

const getAvailableTables = async (restaurantId) => {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
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
          'Status': t.status,
          // Shape configuration
          'Shape': t.shape || 'square',
          'Is Fixed Seating': t.is_fixed_seating || false,
          // Joinable table configuration
          'Is Joinable': t.is_joinable !== false,
          'Joinable With': t.joinable_with || []
        }
      }))
    }
  };
};

const getTableByNumber = async (restaurantId, tableNumber) => {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
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
        'Current Service ID': data.current_service_id,
        // Shape configuration
        'Shape': data.shape || 'square',
        'Is Fixed Seating': data.is_fixed_seating || false,
        // Joinable table configuration
        'Is Joinable': data.is_joinable !== false,
        'Joinable With': data.joinable_with || [],
        // Floor plan positioning
        'Position X': data.position_x || 0,
        'Position Y': data.position_y || 0,
        'Width': data.width || 1,
        'Height': data.height || 1,
        'Rotation': data.rotation || 0
      }
    }
  };
};

const updateTable = async (restaurantId, recordId, fields) => {
  const updates = {};

  if (fields['Status']) updates.status = fields['Status'];
  if (fields['Current Service ID'] !== undefined) updates.current_service_id = fields['Current Service ID'];

  logger.info(`[updateTable] Updating table ${recordId} with:`, updates);

  const { data, error } = await supabase
    .from('tables')
    .update(updates)
    .eq('restaurant_id', restaurantId)
    .eq('id', recordId)
    .select()
    .single();

  if (error) {
    logger.error(`[updateTable] Error updating table ${recordId}:`, error);
    return handleSupabaseResponse(null, error, 'UPDATE table');
  }

  if (!data) {
    logger.error(`[updateTable] No data returned for table ${recordId}`);
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

const updateTableStatus = async (restaurantId, recordId, status) => {
  return updateTable(restaurantId, recordId, { 'Status': status });
};

/**
 * Create a new table
 * @param {string} restaurantId - Restaurant UUID
 * @param {Object} fields - Table fields
 * @returns {Object} Created table
 */
const createTable = async (restaurantId, fields) => {
  const { data, error } = await supabase
    .from('tables')
    .insert({
      restaurant_id: restaurantId,
      table_number: fields.table_number,
      capacity: fields.capacity,
      location: fields.location || 'Main',
      status: 'available',
      is_active: true,
      // Shape configuration
      shape: fields.shape || 'square',
      is_fixed_seating: fields.is_fixed_seating || false,
      // Joinable table configuration
      is_joinable: fields.is_joinable !== undefined ? fields.is_joinable : true,
      joinable_with: fields.joinable_with || [],
      // Floor plan positioning
      position_x: fields.position_x || 0,
      position_y: fields.position_y || 0,
      width: fields.width || 1,
      height: fields.height || 1,
      rotation: fields.rotation || 0,
      // Legacy fields (for backwards compatibility)
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
      // Shape configuration
      shape: data.shape,
      is_fixed_seating: data.is_fixed_seating,
      // Joinable table configuration
      is_joinable: data.is_joinable,
      joinable_with: data.joinable_with,
      // Floor plan positioning
      position_x: data.position_x,
      position_y: data.position_y,
      width: data.width,
      height: data.height,
      rotation: data.rotation,
      // Legacy fields
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
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} tableId - Table UUID
 * @param {Object} fields - Fields to update
 * @returns {Object} Updated table
 */
const updateTableConfig = async (restaurantId, tableId, fields) => {
  const updates = {};

  // Basic fields
  if (fields.table_number !== undefined) updates.table_number = fields.table_number;
  if (fields.capacity !== undefined) updates.capacity = fields.capacity;
  if (fields.location !== undefined) updates.location = fields.location;
  if (fields.status !== undefined) updates.status = fields.status;

  // Shape configuration
  if (fields.shape !== undefined) updates.shape = fields.shape;
  if (fields.is_fixed_seating !== undefined) updates.is_fixed_seating = fields.is_fixed_seating;

  // Joinable table configuration
  if (fields.is_joinable !== undefined) updates.is_joinable = fields.is_joinable;
  if (fields.joinable_with !== undefined) updates.joinable_with = fields.joinable_with;

  // Floor plan positioning
  if (fields.position_x !== undefined) updates.position_x = fields.position_x;
  if (fields.position_y !== undefined) updates.position_y = fields.position_y;
  if (fields.width !== undefined) updates.width = fields.width;
  if (fields.height !== undefined) updates.height = fields.height;
  if (fields.rotation !== undefined) updates.rotation = fields.rotation;

  // Legacy combination settings
  if (fields.is_fixed !== undefined) updates.is_fixed = fields.is_fixed;
  if (fields.min_capacity !== undefined) updates.min_capacity = fields.min_capacity;
  if (fields.max_capacity !== undefined) updates.max_capacity = fields.max_capacity;
  if (fields.adjacent_tables !== undefined) updates.adjacent_tables = fields.adjacent_tables;
  if (fields.combination_group !== undefined) updates.combination_group = fields.combination_group;

  logger.info(`[updateTableConfig] Updating table ${tableId} with:`, updates);

  const { data, error } = await supabase
    .from('tables')
    .update(updates)
    .eq('restaurant_id', restaurantId)
    .eq('id', tableId)
    .select()
    .single();

  if (error) {
    logger.error(`[updateTableConfig] Error:`, error);
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
      // Shape configuration
      shape: data.shape,
      is_fixed_seating: data.is_fixed_seating,
      // Joinable table configuration
      is_joinable: data.is_joinable,
      joinable_with: data.joinable_with,
      // Floor plan positioning
      position_x: data.position_x,
      position_y: data.position_y,
      width: data.width,
      height: data.height,
      rotation: data.rotation,
      // Legacy fields
      is_fixed: data.is_fixed,
      min_capacity: data.min_capacity,
      max_capacity: data.max_capacity,
      adjacent_tables: data.adjacent_tables,
      combination_group: data.combination_group
    }
  };
};

/**
 * Update multiple table positions in bulk (for floor plan editor)
 * @param {string} restaurantId - Restaurant UUID
 * @param {Array} tablePositions - Array of {id, position_x, position_y, width, height, rotation}
 * @returns {Object} Result
 */
const updateTablePositions = async (restaurantId, tablePositions) => {
  const results = [];
  const errors = [];

  for (const pos of tablePositions) {
    const { data, error } = await supabase
      .from('tables')
      .update({
        position_x: pos.position_x,
        position_y: pos.position_y,
        width: pos.width !== undefined ? pos.width : 1,
        height: pos.height !== undefined ? pos.height : 1,
        rotation: pos.rotation !== undefined ? pos.rotation : 0
      })
      .eq('restaurant_id', restaurantId)
      .eq('id', pos.id)
      .select()
      .single();

    if (error) {
      errors.push({ id: pos.id, error: error.message });
    } else {
      results.push({
        id: data.id,
        table_number: data.table_number,
        position_x: data.position_x,
        position_y: data.position_y,
        width: data.width,
        height: data.height,
        rotation: data.rotation
      });
    }
  }

  if (errors.length > 0) {
    logger.error('[updateTablePositions] Some updates failed:', errors);
  }

  return {
    success: errors.length === 0,
    updated: results,
    errors: errors.length > 0 ? errors : undefined
  };
};

/**
 * Link two tables together (bidirectional)
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} tableId1 - First table UUID
 * @param {string} tableId2 - Second table UUID
 * @returns {Object} Result
 */
const linkTables = async (restaurantId, tableId1, tableId2) => {
  // Get both tables
  const [result1, result2] = await Promise.all([
    getTableById(restaurantId, tableId1),
    getTableById(restaurantId, tableId2)
  ]);

  if (!result1.success || !result2.success) {
    return { success: false, error: true, message: 'One or both tables not found' };
  }

  const table1 = result1.table;
  const table2 = result2.table;

  // Update joinable_with arrays (bidirectional)
  const newJoinable1 = [...new Set([...(table1.joinable_with || []), tableId2])];
  const newJoinable2 = [...new Set([...(table2.joinable_with || []), tableId1])];

  // Update both tables
  const [update1, update2] = await Promise.all([
    supabase.from('tables').update({ joinable_with: newJoinable1 }).eq('restaurant_id', restaurantId).eq('id', tableId1),
    supabase.from('tables').update({ joinable_with: newJoinable2 }).eq('restaurant_id', restaurantId).eq('id', tableId2)
  ]);

  if (update1.error || update2.error) {
    return handleSupabaseResponse(null, update1.error || update2.error, 'LINK tables');
  }

  return {
    success: true,
    message: `Tables ${table1.table_number} and ${table2.table_number} linked`,
    linked: [tableId1, tableId2]
  };
};

/**
 * Unlink two tables (bidirectional)
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} tableId1 - First table UUID
 * @param {string} tableId2 - Second table UUID
 * @returns {Object} Result
 */
const unlinkTables = async (restaurantId, tableId1, tableId2) => {
  // Get both tables
  const [result1, result2] = await Promise.all([
    getTableById(restaurantId, tableId1),
    getTableById(restaurantId, tableId2)
  ]);

  if (!result1.success || !result2.success) {
    return { success: false, error: true, message: 'One or both tables not found' };
  }

  const table1 = result1.table;
  const table2 = result2.table;

  // Remove from joinable_with arrays (bidirectional)
  const newJoinable1 = (table1.joinable_with || []).filter(id => id !== tableId2);
  const newJoinable2 = (table2.joinable_with || []).filter(id => id !== tableId1);

  // Update both tables
  const [update1, update2] = await Promise.all([
    supabase.from('tables').update({ joinable_with: newJoinable1 }).eq('restaurant_id', restaurantId).eq('id', tableId1),
    supabase.from('tables').update({ joinable_with: newJoinable2 }).eq('restaurant_id', restaurantId).eq('id', tableId2)
  ]);

  if (update1.error || update2.error) {
    return handleSupabaseResponse(null, update1.error || update2.error, 'UNLINK tables');
  }

  return {
    success: true,
    message: `Tables ${table1.table_number} and ${table2.table_number} unlinked`,
    unlinked: [tableId1, tableId2]
  };
};

/**
 * Soft delete a table (set is_active = false)
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} tableId - Table UUID
 * @returns {Object} Result
 */
const deleteTable = async (restaurantId, tableId) => {
  const { data, error } = await supabase
    .from('tables')
    .update({ is_active: false })
    .eq('restaurant_id', restaurantId)
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
 * @param {string} restaurantId - Restaurant UUID
 * @param {string} tableId - Table UUID
 * @returns {Object} Table details
 */
const getTableById = async (restaurantId, tableId) => {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
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
      current_service_id: data.current_service_id,
      // Shape configuration
      shape: data.shape || 'square',
      is_fixed_seating: data.is_fixed_seating || false,
      // Joinable table configuration
      is_joinable: data.is_joinable !== false,
      joinable_with: data.joinable_with || [],
      // Floor plan positioning
      position_x: data.position_x || 0,
      position_y: data.position_y || 0,
      width: data.width || 1,
      height: data.height || 1,
      rotation: data.rotation || 0,
      // Legacy fields
      is_fixed: data.is_fixed,
      min_capacity: data.min_capacity,
      max_capacity: data.max_capacity,
      adjacent_tables: data.adjacent_tables,
      combination_group: data.combination_group
    }
  };
};

/**
 * Get all tables including inactive ones (for admin)
 * @param {string} restaurantId - Restaurant UUID
 * @returns {Object} All tables
 */
const getAllTablesAdmin = async (restaurantId) => {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('table_number', { ascending: true });

  if (error) return handleSupabaseResponse(null, error, 'GET all tables admin');

  const tables = data.map(t => ({
    id: t.id,
    table_number: t.table_number,
    capacity: t.capacity,
    location: t.location || 'Main',
    status: t.status || 'available',
    is_active: t.is_active,
    current_service_id: t.current_service_id || null,
    // Shape configuration
    shape: t.shape || 'square',
    is_fixed_seating: t.is_fixed_seating || false,
    // Joinable table configuration
    is_joinable: t.is_joinable !== false,
    joinable_with: t.joinable_with || [],
    // Floor plan positioning
    position_x: t.position_x || 0,
    position_y: t.position_y || 0,
    width: t.width ?? null,
    height: t.height ?? null,
    rotation: t.rotation || 0,
    // Legacy fields
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

// ============ SERVICE RECORDS ============

const getServiceRecords = async (restaurantId, filter = {}) => {
  let query = supabase.from('service_records').select('*')
    .eq('restaurant_id', restaurantId);

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

const getActiveServiceRecords = async (restaurantId) => {
  const { data, error } = await supabase
    .from('service_records')
    .select('*')
    .eq('restaurant_id', restaurantId)
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

const createServiceRecord = async (restaurantId, fields) => {
  const { data, error } = await supabase
    .from('service_records')
    .insert({
      restaurant_id: restaurantId,
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

const updateServiceRecord = async (restaurantId, serviceId, fields) => {
  const updates = {};

  if (fields['Status']) updates.status = fields['Status'];
  if (fields['Actual Departure']) updates.actual_departure = fields['Actual Departure'];
  if (fields.total_bill !== undefined) updates.total_bill = fields.total_bill;

  logger.info(`[updateServiceRecord] Updating service ${serviceId} with:`, updates);

  const { data, error } = await supabase
    .from('service_records')
    .update(updates)
    .eq('restaurant_id', restaurantId)
    .eq('service_id', serviceId)
    .select()
    .single();

  if (error) {
    logger.error(`[updateServiceRecord] Error updating service ${serviceId}:`, error);
    return handleSupabaseResponse(null, error, 'UPDATE service record');
  }

  logger.info(`[updateServiceRecord] Success for ${serviceId}:`, data);

  return {
    success: true,
    service_record: {
      service_id: data.service_id,
      table_ids: data.table_ids || [],
      status: data.status
    }
  };
};

const completeServiceRecord = async (restaurantId, serviceId) => {
  return updateServiceRecord(restaurantId, serviceId, {
    'Status': 'completed',
    'Actual Departure': new Date().toISOString()
  });
};

const deleteServiceRecord = async (restaurantId, serviceId) => {
  const { data, error } = await supabase
    .from('service_records')
    .delete()
    .eq('restaurant_id', restaurantId)
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

const getRestaurantInfo = async (restaurantId) => {
  // Query restaurant_config in the restaurant schema by ID
  const { data, error } = await supabase
    .schema('restaurant')
    .from('restaurant_config')
    .select('*')
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

// ============ SUBSCRIPTIONS ============

const getSubscriptions = async (restaurantId, filter = {}) => {
  let query = supabase.from('subscriptions').select('*')
    .eq('restaurant_id', restaurantId);

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
    .select('*')
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

// ============ UTILITIES ============

// Use cryptographically secure ID generators from secure-id.js
// These replace the insecure Math.random() versions to prevent ID enumeration attacks
const generateReservationId = generateSecureReservationId;
const generateServiceId = generateSecureServiceId;

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

// ============ TABLE HELPERS ============

const getAllTables = async (restaurantId) => {
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .eq('restaurant_id', restaurantId)
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
    // Shape configuration
    shape: t.shape || 'square',
    is_fixed_seating: t.is_fixed_seating || false,
    // Joinable table configuration
    is_joinable: t.is_joinable !== false,
    joinable_with: t.joinable_with || [],
    // Floor plan positioning
    position_x: t.position_x || 0,
    position_y: t.position_y || 0,
    width: t.width ?? null,
    height: t.height ?? null,
    rotation: t.rotation || 0,
    // Legacy flexible table support
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
 * @param {string} restaurantId - Restaurant UUID
 */
const calculateAvailableCovers = async (restaurantId) => {
  const tablesResult = await getAllTables(restaurantId);
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

/**
 * Check if restaurant can accommodate a party of given size
 * Returns true/false without exposing internal table details
 * @param {string} restaurantId - Restaurant UUID
 * @param {number} partySize - Number of guests
 */
const canAccommodateParty = async (restaurantId, partySize) => {
  const tablesResult = await getAllTables(restaurantId);
  if (!tablesResult.success) return { success: false, can_accommodate: false };

  const availableTables = tablesResult.tables.filter(t => t.status === 'available');

  // Check single tables first
  const singleTable = availableTables.find(t => t.capacity >= partySize);
  if (singleTable) {
    return {
      success: true,
      can_accommodate: true,
      method: 'single',
      tables: [singleTable.table_number],
      total_capacity: singleTable.capacity
    };
  }

  // Check 2-table combinations using adjacency rules
  const flexibleTables = availableTables.filter(t => !t.is_fixed);

  for (let i = 0; i < flexibleTables.length; i++) {
    for (let j = i + 1; j < flexibleTables.length; j++) {
      const table1 = flexibleTables[i];
      const table2 = flexibleTables[j];

      // Use canCombineTables to check if they can actually combine
      if (!canCombineTables(table1, table2)) {
        continue;
      }

      const totalCapacity = table1.capacity + table2.capacity;
      if (totalCapacity >= partySize) {
        return {
          success: true,
          can_accommodate: true,
          method: 'combination',
          tables: [table1.table_number, table2.table_number],
          total_capacity: totalCapacity
        };
      }
    }
  }

  // Check 3-table combinations for larger parties
  for (let i = 0; i < flexibleTables.length; i++) {
    for (let j = i + 1; j < flexibleTables.length; j++) {
      for (let k = j + 1; k < flexibleTables.length; k++) {
        const table1 = flexibleTables[i];
        const table2 = flexibleTables[j];
        const table3 = flexibleTables[k];

        // For 3-table chain: 1-2 must connect and 2-3 must connect
        if (!canCombineTables(table1, table2) || !canCombineTables(table2, table3)) {
          continue;
        }

        const totalCapacity = table1.capacity + table2.capacity + table3.capacity;
        if (totalCapacity >= partySize) {
          return {
            success: true,
            can_accommodate: true,
            method: 'combination',
            tables: [table1.table_number, table2.table_number, table3.table_number],
            total_capacity: totalCapacity
          };
        }
      }
    }
  }

  return {
    success: true,
    can_accommodate: false,
    reason: `No single table or valid combination can seat ${partySize} guests`
  };
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

  const { data, error } = await supabase
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

// ─── Team Members ────────────────────────────────────────────────────────────

const VALID_ROLES = ['owner', 'manager', 'host', 'staff'];

const getTeamMembers = async (restaurantId) => {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .select('id, email, role, status, user_id, created_at, invite_expires_at')
    .eq('restaurant_id', restaurantId)
    .in('status', ['active', 'pending'])
    .order('created_at', { ascending: true });

  if (error) return { success: false, error: error.message };
  return { success: true, members: data };
};

const addTeamMember = async (restaurantId, { email, role, invitedBy }) => {
  if (!VALID_ROLES.includes(role) || role === 'owner') {
    throw new Error(`Invalid role: ${role}`);
  }

  const crypto = require('crypto');
  const inviteToken = crypto.randomBytes(32).toString('hex');
  const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .upsert(
      {
        restaurant_id: restaurantId,
        email: email.toLowerCase().trim(),
        role,
        status: 'pending',
        invited_by: invitedBy,
        invite_token: inviteToken,
        invite_expires_at: inviteExpiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'restaurant_id,email', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, member: data };
};

const updateTeamMemberRole = async (restaurantId, memberId, newRole) => {
  if (!VALID_ROLES.includes(newRole) || newRole === 'owner') {
    throw new Error(`Invalid role: ${newRole}`);
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('restaurant_id', restaurantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, member: data };
};

const removeTeamMember = async (restaurantId, memberId) => {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .eq('restaurant_id', restaurantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, member: data };
};

const acceptInvite = async (inviteToken, userId) => {
  const { data: invite, error: findError } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .select('id, restaurant_id, invite_expires_at, status')
    .eq('invite_token', inviteToken)
    .eq('status', 'pending')
    .single();

  if (findError || !invite) return { success: false, error: 'Invalid or expired invitation' };
  if (new Date(invite.invite_expires_at) < new Date()) {
    return { success: false, error: 'Invitation has expired' };
  }

  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_members')
    .update({
      user_id: userId,
      status: 'active',
      invite_token: null,
      invite_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invite.id)
    .select()
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, member: data };
};

module.exports = {
  // Supabase clients
  query: supabase,              // Primary client (admin) – backwards compatible
  supabaseAdmin,                // Explicit admin client (bypasses RLS)
  supabaseClient,               // Anon-key client (respects RLS)
  createAuthClient,             // Factory: per-request client with user JWT

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
  // Floor plan positioning
  updateTablePositions,
  linkTables,
  unlinkTables,
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

  // Waitlist
  getWaitlistEntries,
  addToWaitlist,
  updateWaitlistEntry,
  removeFromWaitlist,
  getWaitlistCount,

  // Utilities
  generateReservationId,
  generateServiceId,
  withRetry,

  // Team Members
  getTeamMembers,
  addTeamMember,
  updateTeamMemberRole,
  removeTeamMember,
  acceptInvite,
};
