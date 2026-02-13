/**
 * Table Configuration API
 * Allows restaurant employees to manage tables:
 * - Create, update, delete tables
 * - Configure table combinations (fixed vs flexible)
 * - Set adjacency relationships
 */

const {
  getAllTablesAdmin,
  getTableById,
  createTable,
  updateTableConfig,
  deleteTable
} = require('./_lib/supabase');

const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { verifyAuth } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('TableConfig');

module.exports = async (req, res) => {
  setInternalCors(req, res);

  if (handlePreflight(req, res)) {
    return;
  }

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  const { action } = req.query;

  try {
    switch (action) {
      case 'list':
        return await handleListTables(req, res, restaurantId);
      case 'get':
        return await handleGetTable(req, res, restaurantId);
      case 'create':
        return await handleCreateTable(req, res, restaurantId);
      case 'update':
        return await handleUpdateTable(req, res, restaurantId);
      case 'delete':
        return await handleDeleteTable(req, res, restaurantId);
      case 'set-adjacency':
        return await handleSetAdjacency(req, res, restaurantId);
      case 'bulk-update':
        return await handleBulkUpdate(req, res, restaurantId);
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: list, get, create, update, delete, set-adjacency, bulk-update'
        });
    }
  } catch (error) {
    logger.error('Table config error:', error);
    return res.status(500).json({
      success: false,
      error: 'An error occurred processing your request'
    });
  }
};

/**
 * List all tables with full configuration details
 * GET /api/table-config?action=list
 */
async function handleListTables(req, res, restaurantId) {
  const result = await getAllTablesAdmin(restaurantId);

  if (!result.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to load tables'
    });
  }

  // Group tables by location for UI
  const tablesByLocation = {};
  result.tables.forEach(table => {
    const location = table.location || 'Main';
    if (!tablesByLocation[location]) {
      tablesByLocation[location] = [];
    }
    tablesByLocation[location].push(table);
  });

  // Calculate statistics
  const stats = {
    total: result.tables.length,
    active: result.tables.filter(t => t.is_active).length,
    inactive: result.tables.filter(t => !t.is_active).length,
    fixed: result.tables.filter(t => t.is_fixed && t.is_active).length,
    flexible: result.tables.filter(t => !t.is_fixed && t.is_active).length,
    total_capacity: result.tables
      .filter(t => t.is_active)
      .reduce((sum, t) => sum + t.capacity, 0),
    locations: Object.keys(tablesByLocation)
  };

  return res.status(200).json({
    success: true,
    tables: result.tables,
    tables_by_location: tablesByLocation,
    stats
  });
}

/**
 * Get single table details
 * GET /api/table-config?action=get&table_id=<uuid>
 */
async function handleGetTable(req, res, restaurantId) {
  const { table_id } = req.query;

  if (!table_id) {
    return res.status(400).json({
      success: false,
      error: 'table_id is required'
    });
  }

  const result = await getTableById(restaurantId, table_id);

  if (!result.success) {
    return res.status(404).json({
      success: false,
      error: 'Table not found'
    });
  }

  return res.status(200).json({
    success: true,
    table: result.table
  });
}

/**
 * Create a new table
 * POST /api/table-config?action=create
 * Body: { table_number, capacity, location, is_fixed, combination_group }
 */
async function handleCreateTable(req, res, restaurantId) {
  const { table_number, capacity, location, is_fixed, combination_group, min_capacity, max_capacity } = req.body;

  // Validation
  if (!table_number || table_number < 1) {
    return res.status(400).json({
      success: false,
      error: 'Valid table_number is required (must be >= 1)'
    });
  }

  if (!capacity || capacity < 1 || capacity > 20) {
    return res.status(400).json({
      success: false,
      error: 'Valid capacity is required (1-20 seats)'
    });
  }

  const result = await createTable(restaurantId, {
    table_number: parseInt(table_number),
    capacity: parseInt(capacity),
    location: location || 'Main',
    is_fixed: is_fixed || false,
    combination_group: combination_group || null,
    min_capacity: min_capacity ? parseInt(min_capacity) : 1,
    max_capacity: max_capacity ? parseInt(max_capacity) : null
  });

  if (!result.success) {
    return res.status(500).json({
      success: false,
      error: result.message || 'Failed to create table'
    });
  }

  return res.status(201).json({
    success: true,
    message: `Table ${table_number} created successfully`,
    table: result.table
  });
}

/**
 * Update table configuration
 * PUT /api/table-config?action=update
 * Body: { table_id, ...fields }
 */
async function handleUpdateTable(req, res, restaurantId) {
  const { table_id, ...fields } = req.body;

  if (!table_id) {
    return res.status(400).json({
      success: false,
      error: 'table_id is required'
    });
  }

  // Validate numeric fields if provided
  if (fields.capacity !== undefined && (fields.capacity < 1 || fields.capacity > 20)) {
    return res.status(400).json({
      success: false,
      error: 'Capacity must be between 1 and 20'
    });
  }

  if (fields.table_number !== undefined && fields.table_number < 1) {
    return res.status(400).json({
      success: false,
      error: 'Table number must be >= 1'
    });
  }

  const result = await updateTableConfig(restaurantId, table_id, fields);

  if (!result.success) {
    return res.status(500).json({
      success: false,
      error: result.message || 'Failed to update table'
    });
  }

  return res.status(200).json({
    success: true,
    message: `Table ${result.table.table_number} updated successfully`,
    table: result.table
  });
}

/**
 * Delete (deactivate) a table
 * DELETE /api/table-config?action=delete
 * Body: { table_id }
 */
async function handleDeleteTable(req, res, restaurantId) {
  const { table_id } = req.body;

  if (!table_id) {
    return res.status(400).json({
      success: false,
      error: 'table_id is required'
    });
  }

  // First check if table has active service
  const tableResult = await getTableById(restaurantId, table_id);
  if (!tableResult.success) {
    return res.status(404).json({
      success: false,
      error: 'Table not found'
    });
  }

  if (tableResult.table.status === 'occupied') {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete table that is currently occupied'
    });
  }

  const result = await deleteTable(restaurantId, table_id);

  if (!result.success) {
    return res.status(500).json({
      success: false,
      error: result.message || 'Failed to delete table'
    });
  }

  return res.status(200).json({
    success: true,
    message: result.message
  });
}

/**
 * Set adjacency relationships between tables
 * POST /api/table-config?action=set-adjacency
 * Body: { table_id, adjacent_table_ids: [...] }
 *
 * This creates a bidirectional relationship - if A is adjacent to B,
 * B is also adjacent to A.
 */
async function handleSetAdjacency(req, res, restaurantId) {
  const { table_id, adjacent_table_ids } = req.body;

  if (!table_id) {
    return res.status(400).json({
      success: false,
      error: 'table_id is required'
    });
  }

  if (!Array.isArray(adjacent_table_ids)) {
    return res.status(400).json({
      success: false,
      error: 'adjacent_table_ids must be an array'
    });
  }

  // Update the main table
  const result = await updateTableConfig(restaurantId, table_id, {
    adjacent_tables: adjacent_table_ids
  });

  if (!result.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to update adjacency'
    });
  }

  // Update reverse relationships (bidirectional)
  const updatePromises = adjacent_table_ids.map(async (adjTableId) => {
    const adjTable = await getTableById(restaurantId, adjTableId);
    if (adjTable.success) {
      const currentAdjacent = adjTable.table.adjacent_tables || [];
      if (!currentAdjacent.includes(table_id)) {
        await updateTableConfig(restaurantId, adjTableId, {
          adjacent_tables: [...currentAdjacent, table_id]
        });
      }
    }
  });

  await Promise.all(updatePromises);

  return res.status(200).json({
    success: true,
    message: 'Adjacency relationships updated',
    table: result.table
  });
}

/**
 * Bulk update multiple tables at once
 * POST /api/table-config?action=bulk-update
 * Body: { updates: [{ table_id, ...fields }, ...] }
 */
async function handleBulkUpdate(req, res, restaurantId) {
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'updates must be a non-empty array'
    });
  }

  if (updates.length > 50) {
    return res.status(400).json({
      success: false,
      error: 'Maximum 50 tables can be updated at once'
    });
  }

  const results = await Promise.all(
    updates.map(async (update) => {
      const { table_id, ...fields } = update;
      if (!table_id) {
        return { success: false, error: 'Missing table_id' };
      }
      return await updateTableConfig(restaurantId, table_id, fields);
    })
  );

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return res.status(200).json({
    success: failed === 0,
    message: `Updated ${successful} tables${failed > 0 ? `, ${failed} failed` : ''}`,
    results
  });
}
