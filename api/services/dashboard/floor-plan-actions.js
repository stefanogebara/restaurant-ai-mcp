const {
  getAllTables,
  createTable,
  updateTableConfig,
  deleteTable,
  linkTables,
  unlinkTables,
  getTableById,
  query: supabase,
} = require('../../_lib/supabase');

const { createSecureLogger } = require('../../_lib/secure-logger');

const logger = createSecureLogger('HostDashboard');

// Floor-plan grid bounds — kept in sync with client/src/components/floor-plan/floorPlanConstants.ts
// Used for server-side bounds-checking on position updates (defence in depth — the client clamps too).
const GRID_COLS = 24;
const GRID_ROWS = 20;

/**
 * Update table position (for floor plan editor drag-and-drop)
 * Body: { table_id, position_x, position_y, width?, height?, rotation? }
 */
async function handleUpdateTablePosition(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { table_id, position_x, position_y, width, height, rotation } = req.body;

  if (!table_id) {
    return res.status(400).json({
      success: false,
      error: 'table_id is required'
    });
  }

  if (position_x === undefined || position_y === undefined) {
    return res.status(400).json({
      success: false,
      error: 'position_x and position_y are required'
    });
  }

  // Build update object
  const px = parseInt(position_x, 10);
  const py = parseInt(position_y, 10);

  // Server-side bounds check — the canvas is a fixed grid; don't trust the client.
  if (!Number.isFinite(px) || !Number.isFinite(py) || px < 0 || py < 0 || px >= GRID_COLS || py >= GRID_ROWS) {
    return res.status(400).json({
      success: false,
      error: `position_x must be 0..${GRID_COLS - 1}, position_y must be 0..${GRID_ROWS - 1}`
    });
  }

  const updates = {
    position_x: px,
    position_y: py
  };

  // Optional size and rotation fields
  if (width !== undefined) updates.width = parseInt(width, 10);
  if (height !== undefined) updates.height = parseInt(height, 10);
  if (rotation !== undefined) updates.rotation = parseInt(rotation, 10);

  logger.info(`Updating table ${table_id} position`, updates);

  const result = await updateTableConfig(restaurantId, table_id, updates);

  if (!result.success) {
    logger.error('Failed to update table position', { table_id, error: result.message });
    return res.status(400).json({
      success: false,
      error: result.message || 'Failed to update table position'
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Table position updated successfully',
    table: result.table
  });
}

/**
 * Update table properties (shape, capacity, joinable settings)
 * Body: { table_id, shape?, capacity?, is_joinable?, is_fixed_seating? }
 */
async function handleUpdateTableProperties(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { table_id, shape, capacity, is_joinable, is_fixed_seating } = req.body;

  if (!table_id) {
    return res.status(400).json({
      success: false,
      error: 'table_id is required'
    });
  }

  // Build update object with only provided fields
  const updates = {};

  if (shape !== undefined) {
    const validShapes = ['round', 'square', 'rectangle', 'oval', 'booth', 'bar-stool'];
    if (!validShapes.includes(shape)) {
      return res.status(400).json({
        success: false,
        error: `shape must be one of: ${validShapes.join(', ')}`
      });
    }
    updates.shape = shape;
  }

  if (capacity !== undefined) {
    const parsedCapacity = parseInt(capacity, 10);
    if (isNaN(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 20) {
      return res.status(400).json({
        success: false,
        error: 'capacity must be a number between 1 and 20'
      });
    }
    updates.capacity = parsedCapacity;
  }

  if (is_joinable !== undefined) {
    updates.is_joinable = Boolean(is_joinable);
  }

  if (is_fixed_seating !== undefined) {
    updates.is_fixed_seating = Boolean(is_fixed_seating);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      error: 'At least one property to update is required (shape, capacity, is_joinable, is_fixed_seating)'
    });
  }

  logger.info(`Updating table ${table_id} properties`, updates);

  const result = await updateTableConfig(restaurantId, table_id, updates);

  if (!result.success) {
    logger.error('Failed to update table properties', { table_id, error: result.message });
    return res.status(400).json({
      success: false,
      error: result.message || 'Failed to update table properties'
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Table properties updated successfully',
    table: result.table
  });
}

/**
 * Link two tables together (bidirectional)
 * Body: { table_id, linked_table_id }
 */
async function handleLinkTables(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { table_id, linked_table_id } = req.body;

  if (!table_id || !linked_table_id) {
    return res.status(400).json({
      success: false,
      error: 'table_id and linked_table_id are required'
    });
  }

  if (table_id === linked_table_id) {
    return res.status(400).json({
      success: false,
      error: 'Cannot link a table to itself'
    });
  }

  logger.info(`Linking tables ${table_id} and ${linked_table_id}`);

  const result = await linkTables(restaurantId, table_id, linked_table_id);

  if (!result.success) {
    logger.error('Failed to link tables', { table_id, linked_table_id, error: result.message });
    return res.status(400).json({
      success: false,
      error: result.message || 'Failed to link tables'
    });
  }

  return res.status(200).json({
    success: true,
    message: result.message || 'Tables linked successfully',
    linked: result.linked
  });
}

/**
 * Unlink two tables (bidirectional)
 * Body: { table_id, linked_table_id }
 */
async function handleUnlinkTables(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { table_id, linked_table_id } = req.body;

  if (!table_id || !linked_table_id) {
    return res.status(400).json({
      success: false,
      error: 'table_id and linked_table_id are required'
    });
  }

  logger.info(`Unlinking tables ${table_id} and ${linked_table_id}`);

  const result = await unlinkTables(restaurantId, table_id, linked_table_id);

  if (!result.success) {
    logger.error('Failed to unlink tables', { table_id, linked_table_id, error: result.message });
    return res.status(400).json({
      success: false,
      error: result.message || 'Failed to unlink tables'
    });
  }

  return res.status(200).json({
    success: true,
    message: result.message || 'Tables unlinked successfully',
    unlinked: result.unlinked
  });
}

/**
 * Delete a table (soft delete - sets is_active = false)
 * Body: { table_id }
 */
async function handleDeleteTable(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { table_id } = req.body;

  if (!table_id) {
    return res.status(400).json({
      success: false,
      error: 'table_id is required'
    });
  }

  // Check if table exists and is not currently occupied
  const tableResult = await getTableById(restaurantId, table_id);

  if (!tableResult.success) {
    return res.status(404).json({
      success: false,
      error: 'Table not found'
    });
  }

  // Normalise: DB stores 'occupied' lowercase, normalizeStatus() returns 'Occupied'
  // capitalised to the frontend. The check has to be case-insensitive or it
  // silently lets you delete a table mid-service.
  if ((tableResult.table.status || '').toLowerCase() === 'occupied') {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete a table that is currently occupied'
    });
  }

  // Refuse to delete if upcoming reservations still reference this table —
  // otherwise a customer arrives tomorrow with a confirmation pointing at a
  // table that no longer exists in the floor plan.
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: orphanRows, error: orphanErr } = await supabase
    .from('reservations')
    .select('reservation_id, customer_name, date, time')
    .eq('restaurant_id', restaurantId)
    .gte('date', todayStr)
    .in('status', ['confirmed', 'pending'])
    .contains('table_ids', [table_id])
    .limit(5);

  if (orphanErr) {
    // Don't block the delete on a check-query failure — log + continue.
    logger.warn('Orphan-reservation check failed; proceeding with delete', { table_id, error: orphanErr.message });
  } else if (orphanRows && orphanRows.length > 0) {
    return res.status(400).json({
      success: false,
      error: `Cannot delete — ${orphanRows.length} upcoming reservation(s) reference this table`,
      code: 'TABLE_HAS_RESERVATIONS',
      reservations: orphanRows
    });
  }

  logger.info(`Deleting table ${table_id} (table_number: ${tableResult.table.table_number})`);

  const result = await deleteTable(restaurantId, table_id);

  if (!result.success) {
    logger.error('Failed to delete table', { table_id, error: result.message });
    return res.status(400).json({
      success: false,
      error: result.message || 'Failed to delete table'
    });
  }

  return res.status(200).json({
    success: true,
    message: result.message || 'Table deleted successfully',
    table_number: result.table_number
  });
}

/**
 * Create a new table
 * Body: { table_number, capacity, location?, shape?, is_fixed_seating?, is_joinable?, position_x?, position_y? }
 */
async function handleCreateTable(req, res) {
  const restaurantId = req.user.restaurant_id;
  const {
    table_number,
    capacity,
    location,
    shape,
    is_fixed_seating,
    is_joinable,
    position_x,
    position_y,
    width,
    height,
    rotation
  } = req.body;

  // Validate required fields
  if (!table_number) {
    return res.status(400).json({
      success: false,
      error: 'table_number is required'
    });
  }

  if (!capacity) {
    return res.status(400).json({
      success: false,
      error: 'capacity is required'
    });
  }

  const parsedCapacity = parseInt(capacity, 10);
  if (isNaN(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 20) {
    return res.status(400).json({
      success: false,
      error: 'capacity must be a number between 1 and 20'
    });
  }

  // Validate shape if provided
  const validShapes = ['round', 'square', 'rectangle', 'oval', 'booth', 'bar-stool'];
  if (shape && !validShapes.includes(shape)) {
    return res.status(400).json({
      success: false,
      error: `shape must be one of: ${validShapes.join(', ')}`
    });
  }

  // Build table fields
  const tableFields = {
    table_number: String(table_number),
    capacity: parsedCapacity,
    location: location || 'Main',
    shape: shape || 'square',
    is_fixed_seating: is_fixed_seating !== undefined ? Boolean(is_fixed_seating) : false,
    is_joinable: is_joinable !== undefined ? Boolean(is_joinable) : true,
    position_x: position_x !== undefined ? parseInt(position_x, 10) : 0,
    position_y: position_y !== undefined ? parseInt(position_y, 10) : 0,
    width: width !== undefined ? parseInt(width, 10) : 1,
    height: height !== undefined ? parseInt(height, 10) : 1,
    rotation: rotation !== undefined ? parseInt(rotation, 10) : 0
  };

  logger.info('Creating new table', tableFields);

  const result = await createTable(restaurantId, tableFields);

  if (!result.success) {
    logger.error('Failed to create table', { tableFields, error: result.message });
    return res.status(400).json({
      success: false,
      error: result.message || 'Failed to create table'
    });
  }

  return res.status(201).json({
    success: true,
    message: `Table ${tableFields.table_number} created successfully`,
    table: result.table
  });
}

/**
 * Auto-assign shapes to all tables based on their capacity
 * This updates existing tables with appropriate shapes:
 * - 1-2 person: round (intimate tables)
 * - 4 person: alternating round/square
 * - 6 person: rectangle or booth
 * - 8+ person: rectangle
 */
async function handleAutoAssignShapes(req, res) {
  const restaurantId = req.user.restaurant_id;
  logger.info('Auto-assigning shapes to all tables');

  // Get all active tables using the imported function
  const tablesResult = await getAllTables(restaurantId);

  if (!tablesResult.success) {
    logger.error('Failed to fetch tables for shape assignment', tablesResult.error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch tables'
    });
  }

  const tables = tablesResult.tables || [];

  if (tables.length === 0) {
    return res.status(200).json({
      success: true,
      message: 'No tables to update',
      updated: 0
    });
  }

  // Sort by table_number for consistent alternating
  tables.sort((a, b) => parseInt(a.table_number) - parseInt(b.table_number));

  // Track 4-person tables to alternate between round and square
  let fourPersonIndex = 0;
  let sixPersonIndex = 0;

  const updates = tables.map(table => {
    let shape = table.shape || 'square';

    switch (table.capacity) {
      case 1:
        shape = 'bar-stool';
        break;
      case 2:
        shape = 'round';
        break;
      case 4:
        // Alternate between round and square for variety
        shape = fourPersonIndex % 2 === 0 ? 'round' : 'square';
        fourPersonIndex++;
        break;
      case 6:
        // Alternate between rectangle and booth
        shape = sixPersonIndex % 2 === 0 ? 'rectangle' : 'booth';
        sixPersonIndex++;
        break;
      case 8:
      default:
        shape = table.capacity >= 8 ? 'rectangle' : 'square';
        break;
    }

    return { id: table.id, shape, table_number: table.table_number };
  });

  // Update each table using the imported updateTableConfig function
  let updatedCount = 0;
  for (const update of updates) {
    const result = await updateTableConfig(restaurantId, update.id, { shape: update.shape });

    if (result.success) {
      updatedCount++;
      logger.info(`Updated table ${update.table_number} to shape: ${update.shape}`);
    } else {
      logger.warn(`Failed to update shape for table ${update.table_number}`, result.error);
    }
  }

  logger.info(`Auto-assigned shapes to ${updatedCount} tables`);

  return res.status(200).json({
    success: true,
    message: `Updated shapes for ${updatedCount} tables`,
    updated: updatedCount,
    shapes: updates.map(u => ({ id: u.id, shape: u.shape, table_number: u.table_number }))
  });
}

module.exports = {
  handleUpdateTablePosition,
  handleUpdateTableProperties,
  handleLinkTables,
  handleUnlinkTables,
  handleDeleteTable,
  handleCreateTable,
  handleAutoAssignShapes
};
