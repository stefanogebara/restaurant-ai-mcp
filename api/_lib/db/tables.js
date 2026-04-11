/**
 * Table queries, configuration, and combination logic
 * Extracted from supabase.js
 */

const { supabase, handleSupabaseResponse, logger } = require('./clients');

/** Normalize DB status to PascalCase for frontend compatibility */
function normalizeStatus(dbStatus) {
  const map = {
    'available': 'Available',
    'occupied': 'Occupied',
    'being cleaned': 'Being Cleaned',
    'being_cleaned': 'Being Cleaned',
    'reserved': 'Reserved',
  };
  if (!dbStatus) return 'Available';
  return map[dbStatus.toLowerCase()] || dbStatus;
}

// ============ TABLES ============

const getTables = async (restaurantId, filter = {}) => {
  let query = supabase.from('tables').select('id, table_number, capacity, location, status, current_service_id, is_active, shape, is_fixed_seating, is_joinable, joinable_with, position_x, position_y, width, height, rotation')
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
          'Status': normalizeStatus(t.status),
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
    .select('id, table_number, capacity, location, status, shape, is_fixed_seating, is_joinable, joinable_with')
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
          'Status': normalizeStatus(t.status),
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
    .select('id, table_number, capacity, location, status, current_service_id, shape, is_fixed_seating, is_joinable, joinable_with, position_x, position_y, width, height, rotation')
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

  if (fields.status) updates.status = fields.status;
  if (fields.current_service_id !== undefined) updates.current_service_id = fields.current_service_id;

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
      table_number: data.table_number,
      status: data.status
    }
  };
};

const updateTableStatus = async (restaurantId, recordId, status) => {
  return updateTable(restaurantId, recordId, { status });
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
    .select('id, table_number, capacity, location, status, is_active, current_service_id, shape, is_fixed_seating, is_joinable, joinable_with, position_x, position_y, width, height, rotation, is_fixed, min_capacity, max_capacity, adjacent_tables, combination_group')
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
    .select('id, table_number, capacity, location, status, is_active, current_service_id, shape, is_fixed_seating, is_joinable, joinable_with, position_x, position_y, width, height, rotation, is_fixed, min_capacity, max_capacity, adjacent_tables, combination_group')
    .eq('restaurant_id', restaurantId)
    .order('table_number', { ascending: true });

  if (error) return handleSupabaseResponse(null, error, 'GET all tables admin');

  const tables = data.map(t => ({
    id: t.id,
    table_number: t.table_number,
    capacity: t.capacity,
    location: t.location || 'Main',
    status: normalizeStatus(t.status),
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

// ============ TABLE HELPERS ============

const getAllTables = async (restaurantId) => {
  const { data, error } = await supabase
    .from('tables')
    .select('id, table_number, capacity, location, status, current_service_id, shape, is_fixed_seating, is_joinable, joinable_with, position_x, position_y, width, height, rotation, is_fixed, min_capacity, max_capacity, adjacent_tables, combination_group')
    .eq('restaurant_id', restaurantId)
    .eq('is_active', true)
    .order('table_number', { ascending: true });

  if (error) return handleSupabaseResponse(null, error, 'GET all tables');

  const tables = data.map(t => ({
    id: t.id,
    table_number: t.table_number,
    capacity: t.capacity,
    location: t.location || 'Main',
    status: normalizeStatus(t.status),
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

  // Use ALL active tables for capacity checks — runtime status (occupied/reserved)
  // reflects current service, not future availability. Time conflicts are checked
  // separately via existing reservations at the requested date/time.
  const availableTables = tablesResult.tables;

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

  // Use ALL active tables for capacity checks — runtime status (occupied/reserved)
  // reflects current service, not future availability. Time conflicts are checked
  // separately via existing reservations at the requested date/time.
  const availableTables = tablesResult.tables;

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

  // Calculate the actual maximum we can seat (for informative error message)
  let maxCapacity = 0;

  // Max single table
  for (const t of availableTables) {
    if (t.capacity > maxCapacity) maxCapacity = t.capacity;
  }

  // Max 2-table combo
  for (let i = 0; i < flexibleTables.length; i++) {
    for (let j = i + 1; j < flexibleTables.length; j++) {
      if (canCombineTables(flexibleTables[i], flexibleTables[j])) {
        const cap = flexibleTables[i].capacity + flexibleTables[j].capacity;
        if (cap > maxCapacity) maxCapacity = cap;
      }
    }
  }

  // Max 3-table combo
  for (let i = 0; i < flexibleTables.length; i++) {
    for (let j = i + 1; j < flexibleTables.length; j++) {
      for (let k = j + 1; k < flexibleTables.length; k++) {
        if (canCombineTables(flexibleTables[i], flexibleTables[j]) && canCombineTables(flexibleTables[j], flexibleTables[k])) {
          const cap = flexibleTables[i].capacity + flexibleTables[j].capacity + flexibleTables[k].capacity;
          if (cap > maxCapacity) maxCapacity = cap;
        }
      }
    }
  }

  return {
    success: true,
    can_accommodate: false,
    max_capacity: maxCapacity,
    reason: `No single table or valid combination can seat ${partySize} guests. Maximum capacity is ${maxCapacity} guests.`
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

module.exports = {
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
  updateTablePositions,
  linkTables,
  unlinkTables,
  isFlexibleTable,
  canCombineTables,
  calculateAvailableCovers,
  canAccommodateParty,
};
