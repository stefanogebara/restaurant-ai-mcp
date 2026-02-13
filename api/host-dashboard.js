const {
  getAllTables,
  getActiveServiceRecords,
  getUpcomingReservations,
  findReservation,
  updateReservation,
  createServiceRecord,
  updateServiceRecord,
  deleteServiceRecord,
  updateTable,
  generateServiceId,
  findBestTableCombination,
  canAccommodateParty,
  // Floor plan editor functions
  createTable,
  updateTableConfig,
  deleteTable,
  linkTables,
  unlinkTables,
  getTableById
} = require('./_lib/supabase');

const { logCustomerShowedUp, logCustomerCancelled } = require('./ml/data-logger');
const { validateServiceRecord, sanitizeInput } = require('./_lib/validation');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { verifyAuth } = require('./_lib/auth');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { getDiningDuration, DEFAULT_DINING_DURATION_MINUTES } = require('./_lib/constants');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('HostDashboard');

module.exports = async (req, res) => {
  // Use secure CORS for internal dashboard endpoints
  setInternalCors(req, res);

  if (handlePreflight(req, res)) {
    return;
  }

  // Apply rate limiting (60 requests per minute)
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return; // 429 response already sent

  // Verify authentication - dashboard requires authenticated access
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      error: authResult.error,
      message: 'Authentication required to access dashboard'
    });
  }
  req.user = authResult.user;

  const { action } = req.query;

  try {
    switch (action) {
      case 'dashboard':
        return await handleDashboard(req, res);
      case 'check-in':
        return await handleCheckIn(req, res);
      case 'check-walk-in':
        return await handleCheckWalkIn(req, res);
      case 'seat-party':
        return await handleSeatParty(req, res);
      case 'complete-service':
        return await handleCompleteService(req, res);
      case 'mark-table-clean':
        return await handleMarkTableClean(req, res);
      case 'update-table-status':
        return await handleUpdateTableStatus(req, res);
      case 'update-reservation':
        return await handleUpdateReservation(req, res);
      // Floor Plan Editor endpoints
      case 'update-table-position':
        return await handleUpdateTablePosition(req, res);
      case 'update-table-properties':
        return await handleUpdateTableProperties(req, res);
      case 'link-tables':
        return await handleLinkTables(req, res);
      case 'unlink-tables':
        return await handleUnlinkTables(req, res);
      case 'delete-table':
        return await handleDeleteTable(req, res);
      case 'create-table':
        return await handleCreateTable(req, res);
      case 'auto-assign-shapes':
        return await handleAutoAssignShapes(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: dashboard, check-in, check-walk-in, seat-party, complete-service, mark-table-clean, update-table-status, update-reservation, update-table-position, update-table-properties, link-tables, unlink-tables, delete-table, or create-table'
        });
    }
  } catch (error) {
    logger.error('Host dashboard error', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'An error occurred processing your request'
    });
  }
};

async function handleDashboard(req, res) {
  const restaurantId = req.user.restaurant_id;
  const timezone = req.user.timezone || 'UTC';
  const [tablesResult, activePartiesResult, upcomingReservationsResult] = await Promise.all([
    getAllTables(restaurantId),
    getActiveServiceRecords(restaurantId),
    getUpcomingReservations(restaurantId, timezone)
  ]);

  if (!tablesResult.success || !activePartiesResult.success || !upcomingReservationsResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to load dashboard data'
    });
  }

  const tables = tablesResult.tables;
  const activeParties = activePartiesResult.service_records.map(record => {
    const seatedAt = new Date(record.seated_at);
    const estimatedDeparture = new Date(record.estimated_departure);
    const now = new Date();
    const timeElapsed = Math.floor((now - seatedAt) / 1000 / 60);
    const timeRemaining = Math.floor((estimatedDeparture - now) / 1000 / 60);

    // Convert table_ids from string to array (Airtable stores as comma-separated string)
    const tablesArray = typeof record.table_ids === 'string'
      ? record.table_ids.split(',').map(id => id.trim())
      : (Array.isArray(record.table_ids) ? record.table_ids : []);

    return {
      service_id: record.service_id,
      customer_name: record.customer_name,
      customer_phone: record.customer_phone,
      party_size: record.party_size,
      tables: tablesArray,
      seated_at: record.seated_at,
      estimated_departure: record.estimated_departure,
      time_elapsed_minutes: timeElapsed,
      time_remaining_minutes: timeRemaining,
      is_overdue: timeRemaining < 0
    };
  });

  const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);

  // Calculate occupied seats from BOTH service records AND manually occupied tables
  const seatsFromActiveParties = activeParties.reduce((sum, party) => sum + party.party_size, 0);
  const seatsFromOccupiedTables = tables
    .filter(table => table.status === 'Occupied' && !activeParties.some(p => p.tables.includes(table.table_number.toString())))
    .reduce((sum, table) => sum + table.capacity, 0);
  const occupiedSeats = seatsFromActiveParties + seatsFromOccupiedTables;

  const availableSeats = totalCapacity - occupiedSeats;

  // Calculate estimated wait time based on earliest expected table opening
  let estimatedWaitMinutes = 0;
  if (availableSeats === 0 && activeParties.length > 0) {
    // Find the party that will finish soonest
    const now = new Date();
    const upcomingDepartures = activeParties.map(party => {
      const estimatedDeparture = new Date(party.estimated_departure);
      return estimatedDeparture.getTime() - now.getTime();
    });

    const soonestDeparture = Math.min(...upcomingDepartures);
    estimatedWaitMinutes = Math.max(0, Math.ceil(soonestDeparture / 60000)); // Convert ms to minutes
  }

  // Calculate flexible table metrics
  const availableTables = tables.filter(t => t.status === 'available');
  const flexibleTables = availableTables.filter(t => !t.is_fixed);
  const fixedTables = availableTables.filter(t => t.is_fixed);

  // Group flexible tables by location to calculate max party sizes
  const flexibleByLocation = {};
  flexibleTables.forEach(t => {
    const location = t.location || 'Main';
    if (!flexibleByLocation[location]) flexibleByLocation[location] = [];
    flexibleByLocation[location].push(t);
  });

  // Calculate max party size that can be accommodated by combining tables
  const maxPartySizeByLocation = Object.entries(flexibleByLocation).reduce((acc, [loc, tbls]) => {
    acc[loc] = tbls.reduce((sum, t) => sum + t.capacity, 0);
    return acc;
  }, {});

  const largestFixedCapacity = fixedTables.length > 0 ? Math.max(...fixedTables.map(t => t.capacity)) : 0;
  const largestFlexibleCapacity = Object.values(maxPartySizeByLocation).length > 0
    ? Math.max(...Object.values(maxPartySizeByLocation))
    : 0;
  const maxSinglePartySize = Math.max(largestFixedCapacity, largestFlexibleCapacity);

  // Calculate avg duration from active parties
  let avgDurationMinutes = 0;
  if (activeParties.length > 0) {
    const totalElapsed = activeParties.reduce((sum, p) => sum + (p.time_elapsed_minutes || 0), 0);
    avgDurationMinutes = Math.round(totalElapsed / activeParties.length);
  }

  // Calculate peak hours from upcoming reservations
  let peakHours = null;
  const reservations = upcomingReservationsResult.reservations || [];
  if (reservations.length > 0) {
    const hourCounts = {};
    reservations.forEach(r => {
      if (r.time) {
        const hour = r.time.split(':')[0];
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    });
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    if (peakHour) {
      const h = parseInt(peakHour[0]);
      peakHours = `${h > 12 ? h - 12 : h}${h >= 12 ? 'PM' : 'AM'}`;
    }
  }

  return res.status(200).json({
    summary: {
      total_capacity: totalCapacity,
      available_seats: availableSeats,
      occupied_seats: occupiedSeats,
      occupancy_percentage: Math.round((occupiedSeats / totalCapacity) * 100),
      active_parties: activeParties.length,
      upcoming_reservations: upcomingReservationsResult.reservations.length,
      estimated_wait_time: estimatedWaitMinutes,
      avg_duration_minutes: avgDurationMinutes || null,
      peak_hours: peakHours,
      // Flexible table metrics
      max_single_party_size: maxSinglePartySize,  // Largest party we can accommodate right now
      flexible_tables_available: flexibleTables.length,
      fixed_tables_available: fixedTables.length
    },
    tables: tables.map(t => ({
      id: t.id,
      table_number: t.table_number,
      capacity: t.capacity,
      location: t.location,
      status: t.status ? t.status.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : t.status,
      current_service_id: t.current_service_id,
      // Shape configuration
      shape: t.shape || 'square',
      is_fixed_seating: t.is_fixed_seating || false,
      // Joinable table configuration
      is_joinable: t.is_joinable !== false,
      joinable_with: t.joinable_with || [],
      // Floor plan positioning
      position_x: t.position_x || 0,
      position_y: t.position_y || 0,
      width: t.width || 1,
      height: t.height || 1,
      rotation: t.rotation || 0,
      // Legacy fields
      is_fixed: t.is_fixed || false
    })),
    active_parties: activeParties,
    upcoming_reservations: upcomingReservationsResult.reservations
  });
}

async function handleCheckIn(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { reservation_id } = req.body;

  if (!reservation_id) {
    return res.status(400).json({
      success: false,
      error: 'Reservation ID is required'
    });
  }

  const reservationResult = await findReservation(restaurantId, { reservation_id });

  if (!reservationResult.success || !reservationResult.reservation) {
    return res.status(404).json({
      success: false,
      error: 'Reservation not found'
    });
  }

  const reservation = reservationResult.reservation;
  const partySize = reservation.party_size;

  const tablesResult = await getAllTables(restaurantId);
  if (!tablesResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to load tables'
    });
  }

  const availableTables = tablesResult.tables.filter(t => t.status === 'available');
  const recommendations = findBestTableCombination(availableTables, partySize);

  if (recommendations.length === 0) {
    return res.status(200).json({
      success: false,
      error: 'No suitable tables available',
      reservation: reservation,
      recommendation: null,
      all_options: [],
      next_step: 'Please wait for a table to become available or modify the reservation'
    });
  }

  const bestRecommendation = recommendations[0];

  return res.status(200).json({
    success: true,
    reservation: {
      ...reservation,
      checked_in: true,
      checked_in_at: new Date().toISOString()
    },
    recommendation: bestRecommendation,
    all_options: recommendations.slice(0, 3),
    next_step: 'Please seat the party at the recommended tables'
  });
}

async function handleCheckWalkIn(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { party_size, preferred_location } = req.body;

  if (!party_size) {
    return res.status(400).json({
      success: false,
      error: 'Party size is required'
    });
  }

  const tablesResult = await getAllTables(restaurantId);
  if (!tablesResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to load tables'
    });
  }

  let availableTables = tablesResult.tables.filter(t => t.status === 'available');

  if (preferred_location) {
    const preferredTables = availableTables.filter(t =>
      t.location.toLowerCase().includes(preferred_location.toLowerCase())
    );
    if (preferredTables.length > 0) {
      availableTables = preferredTables;
    }
  }

  const recommendations = findBestTableCombination(availableTables, party_size);

  if (recommendations.length === 0) {
    return res.status(200).json({
      success: false,
      can_accommodate: false,
      estimated_wait_time: '30-45 minutes',
      message: 'No suitable tables currently available'
    });
  }

  return res.status(200).json({
    success: true,
    can_accommodate: true,
    recommendation: recommendations[0],
    all_options: recommendations.slice(0, 3)
  });
}

async function handleSeatParty(req, res) {
  const restaurantId = req.user.restaurant_id;
  const {
    type,
    reservation_id,
    customer_name,
    customer_phone,
    party_size,
    table_ids,
    special_requests
  } = req.body;

  // Comprehensive validation using centralized utility
  const validation = validateServiceRecord({
    customer_name,
    customer_phone,
    party_size,
    table_ids
  });

  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: validation.errors
    });
  }

  // Sanitize inputs to prevent injection attacks
  const sanitizedName = sanitizeInput(customer_name);
  const sanitizedPhone = sanitizeInput(customer_phone);
  const sanitizedRequests = special_requests ? sanitizeInput(special_requests) : '';

  const serviceId = generateServiceId();
  const seatedAt = new Date().toISOString();
  // Use configurable dining duration (default: 90 minutes)
  const diningDurationMs = DEFAULT_DINING_DURATION_MINUTES * 60 * 1000;
  const estimatedDeparture = new Date(Date.now() + diningDurationMs).toISOString();

  // Convert table UUIDs to table numbers (Supabase schema uses integer[])
  const allTablesForConversion = await getAllTables(restaurantId);
  if (!allTablesForConversion.success || !allTablesForConversion.tables) {
    return res.status(500).json({
      success: false,
      error: 'Failed to load tables for UUID conversion'
    });
  }

  // Validate all table UUIDs exist before converting
  for (const uuid of table_ids) {
    const table = allTablesForConversion.tables.find(t => t.id === uuid);
    if (!table) {
      return res.status(400).json({
        success: false,
        error: `Table with UUID ${uuid} not found`
      });
    }
  }

  // Convert UUIDs to table numbers (ensure integers for Supabase integer[] column)
  const tableNumbers = table_ids.map(uuid => {
    const table = allTablesForConversion.tables.find(t => t.id === uuid);
    return parseInt(table.table_number, 10);
  });

  const serviceFields = {
    'Service ID': serviceId,
    'Reservation ID': reservation_id || '',
    'Customer Name': sanitizedName,
    'Customer Phone': sanitizedPhone,
    'Party Size': parseInt(party_size),
    'Table IDs': tableNumbers,  // Pass table numbers (integers), not UUIDs
    'Seated At': seatedAt,
    'Estimated Departure': estimatedDeparture,
    'Special Requests': sanitizedRequests,
    'Status': 'Active'
  };

  // BEGIN TRANSACTION: Create service record and update tables atomically
  let serviceCreated = false;
  let tablesUpdated = [];

  try {
    // Step 1: Create service record
    const serviceResult = await createServiceRecord(restaurantId, serviceFields);
    if (!serviceResult.success) {
      logger.error('Failed to create service record', {
        serviceFields,
        error: serviceResult.message || serviceResult.error
      });
      throw new Error(serviceResult.message || 'Failed to create service record');
    }
    serviceCreated = true;

    // Step 2: Update all tables to occupied status
    // table_ids are already UUIDs (Supabase record IDs), use them directly for updates
    const tableRecordIds = table_ids;

    const updatePromises = tableRecordIds.map(async (recordId) => {
      const result = await updateTable(restaurantId, recordId, {
        'Status': 'occupied',
        'Current Service ID': null  // Don't set service ID - link is in service_records.table_ids
      });
      if (!result.success) {
        throw new Error(`Failed to update table ${recordId}`);
      }
      tablesUpdated.push(recordId);
      return result;
    });

    await Promise.all(updatePromises);

    // SUCCESS: Both operations completed
    return res.status(200).json({
      success: true,
      service_record_id: serviceId,
      tables_assigned: table_ids,
      estimated_departure: estimatedDeparture,
      message: `Party of ${party_size} seated successfully`
    });

  } catch (error) {
    // ROLLBACK: Clean up on failure
    logger.error('Transaction failed during seat party', error);

    // If service record was created, delete it
    if (serviceCreated) {
      logger.info(`Rolling back: Deleting service record ${serviceId}`);
      try {
        await deleteServiceRecord(restaurantId, serviceId);
      } catch (rollbackError) {
        logger.error('Failed to rollback service record', rollbackError);
      }
    }

    // If any tables were updated, reset them
    if (tablesUpdated.length > 0) {
      logger.info(`Rolling back: Resetting ${tablesUpdated.length} tables`);
      const rollbackPromises = tablesUpdated.map(recordId =>
        updateTable(restaurantId, recordId, {
          'Status': 'available',
          'Current Service ID': ''
        }).catch(err => logger.error(`Failed to rollback table ${recordId}`, err))
      );
      await Promise.all(rollbackPromises);
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to seat party',
      details: error.message,
      rollback_performed: true
    });
  }
}

async function handleCompleteService(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { service_record_id } = req.body;

  if (!service_record_id) {
    return res.status(400).json({
      success: false,
      error: 'Service record ID is required'
    });
  }

  const departedAt = new Date().toISOString();

  const updateResult = await updateServiceRecord(restaurantId, service_record_id, {
    'Actual Departure': departedAt,
    'Status': 'completed'
  });

  if (!updateResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to complete service'
    });
  }

  // Log that customer showed up (for ML training data)
  const reservationId = updateResult.service_record.reservation_id;
  const seatedAt = updateResult.service_record.seated_at;
  if (reservationId) {
    await logCustomerShowedUp(reservationId, seatedAt, departedAt);
  }

  const tableIdsRaw = updateResult.service_record.table_ids;

  // Convert table_ids from string to array (Airtable stores as comma-separated string)
  const tableIds = typeof tableIdsRaw === 'string'
    ? tableIdsRaw.split(',').map(id => id.trim())
    : (Array.isArray(tableIdsRaw) ? tableIdsRaw : []);

  // Get all tables to map table numbers to Airtable record IDs
  const tablesResult = await getAllTables(restaurantId);
  if (!tablesResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to load tables for update'
    });
  }

  // Map table numbers to Airtable record IDs
  const tableRecordIds = tableIds.map(tableNum => {
    // Convert to number for comparison since table_number could be string or number
    const table = tablesResult.tables.find(t => Number(t.table_number) === Number(tableNum));
    if (!table) {
      logger.error(`Table not found for number: ${tableNum}`, { available_tables: tablesResult.tables.map(t => t.table_number) });
    }
    return table ? table.id : null;
  }).filter(id => id !== null);

  const updatePromises = tableRecordIds.map(recordId =>
    updateTable(restaurantId, recordId, {
      'Status': 'available',
      'Current Service ID': null
    })
  );

  await Promise.all(updatePromises);

  return res.status(200).json({
    success: true,
    message: 'Service completed successfully',
    tables_freed: tableIds
  });
}

async function handleMarkTableClean(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { table_id } = req.body;

  if (!table_id) {
    return res.status(400).json({
      success: false,
      error: 'Table ID is required'
    });
  }

  const updateResult = await updateTable(restaurantId, table_id, {
    'Status': 'available'
  });

  if (!updateResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to mark table as clean'
    });
  }

  return res.status(200).json({
    success: true,
    message: `Table ${updateResult.data.fields['Table Number']} is now available`
  });
}

async function handleUpdateTableStatus(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { table_id, status } = req.body;

  if (!table_id || !status) {
    return res.status(400).json({
      success: false,
      error: 'Table ID and status are required'
    });
  }

  // Validate status (case-insensitive) and map to database enum values
  const statusMap = {
    'available': 'available',
    'occupied': 'occupied',
    'reserved': 'reserved',
    'being cleaned': 'being_cleaned',  // Frontend uses space, DB uses underscore
    'being_cleaned': 'being_cleaned',
    'out_of_service': 'out_of_service'
  };
  const normalizedStatus = status.toLowerCase();
  const dbStatus = statusMap[normalizedStatus];

  if (!dbStatus) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${Object.keys(statusMap).join(', ')}`
    });
  }

  const updateResult = await updateTable(restaurantId, table_id, {
    'Status': dbStatus
  });

  if (!updateResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to update table status'
    });
  }

  return res.status(200).json({
    success: true,
    message: `Table ${updateResult.data.fields['Table Number']} status updated to ${normalizedStatus}`,
    table: {
      id: table_id,
      table_number: updateResult.data.fields['Table Number'],
      status: normalizedStatus
    }
  });
}

/**
 * Update Reservation Notes (Segovia Enhanced Notes Feature)
 *
 * Updates reservation with enhanced notes fields:
 * - Dietary restrictions (vegetarian alternatives to cochinillo)
 * - Language preference (Spanish, English, Chinese, French)
 * - Seating preference (Terrace, Window, Indoor, Bar)
 * - Special occasion (Birthday, Anniversary, Business, Tourism)
 * - Customer type (Tourist, Local)
 * - Accessibility needs
 * - Internal staff notes
 * - First-time visitor flag
 */
async function handleUpdateReservation(req, res) {
  const restaurantId = req.user.restaurant_id;
  const {
    reservation_id,
    dietary_restrictions,
    language_preference,
    seating_preference,
    special_occasion,
    customer_type,
    accessibility_needs,
    internal_notes,
    first_time_visitor,
  } = req.body;

  if (!reservation_id) {
    return res.status(400).json({
      success: false,
      error: 'reservation_id is required'
    });
  }

  // Find the reservation
  const findResult = await findReservation(restaurantId, reservation_id);

  if (!findResult.success || !findResult.reservation) {
    return res.status(404).json({
      success: false,
      error: 'Reservation not found'
    });
  }

  // Build update object with only provided fields
  const updates = {
    updated_at: new Date().toISOString()
  };

  if (dietary_restrictions !== undefined) updates.dietary_restrictions = dietary_restrictions;
  if (language_preference !== undefined) updates.language_preference = language_preference;
  if (seating_preference !== undefined) updates.seating_preference = seating_preference;
  if (special_occasion !== undefined) updates.special_occasion = special_occasion;
  if (customer_type !== undefined) updates.customer_type = customer_type;
  if (accessibility_needs !== undefined) updates.accessibility_needs = accessibility_needs;
  if (internal_notes !== undefined) updates.internal_notes = internal_notes;
  if (first_time_visitor !== undefined) updates.first_time_visitor = first_time_visitor;

  // Update the reservation
  const updateResult = await updateReservation(restaurantId, findResult.reservation.record_id, updates);

  if (!updateResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to update reservation notes'
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Reservation notes updated successfully',
    reservation: {
      reservation_id,
      ...updates
    }
  });
}

// ============ FLOOR PLAN EDITOR ENDPOINTS ============

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
  const updates = {
    position_x: parseInt(position_x, 10),
    position_y: parseInt(position_y, 10)
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

  if (tableResult.table.status === 'occupied') {
    return res.status(400).json({
      success: false,
      error: 'Cannot delete a table that is currently occupied'
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
