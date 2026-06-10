const {
  getAllTables,
  findReservation,
  createServiceRecord,
  updateServiceRecord,
  deleteServiceRecord,
  updateTable,
  generateServiceId,
  findBestTableCombination,
} = require('../../_lib/supabase');

const { logCustomerShowedUp } = require('../../_ml/data-logger');
const { validateServiceRecord, sanitizeInput } = require('../../_lib/validation');
const { DEFAULT_DINING_DURATION_MINUTES } = require('../../_lib/constants');
const { createSecureLogger } = require('../../_lib/secure-logger');
const { scheduleFeedback } = require('../feedbackService');

const logger = createSecureLogger('HostDashboard');

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
    service_id: serviceId,
    reservation_id: reservation_id || null,
    customer_name: sanitizedName,
    customer_phone: sanitizedPhone,
    party_size: parseInt(party_size),
    table_ids: tableNumbers,  // Table numbers (integers); DB col is integer[]
    seated_at: seatedAt,
    estimated_departure: estimatedDeparture,
    special_requests: sanitizedRequests,
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
        status: 'occupied',
        current_service_id: null  // Don't set service ID - link is in service_records.table_ids
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
          status: 'available',
          current_service_id: null
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
  const { service_record_id, total_bill } = req.body;

  if (!service_record_id) {
    return res.status(400).json({
      success: false,
      error: 'Service record ID is required'
    });
  }

  const departedAt = new Date().toISOString();

  const recordUpdates = {
    actual_departure: departedAt,
    status: 'completed',
  };
  if (total_bill !== undefined && total_bill !== null) {
    const parsed = parseFloat(total_bill);
    if (!isNaN(parsed) && parsed >= 0) {
      recordUpdates.total_bill = parsed;
    }
  }
  const updateResult = await updateServiceRecord(restaurantId, service_record_id, recordUpdates);

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

  // Schedule post-visit feedback. Awaited so Vercel doesn't kill the
  // Lambda before the schedule row lands — without this, every
  // complete-service that ran fast enough to return before scheduleFeedback
  // resolved silently dropped its post-visit survey.
  const guestName = updateResult.service_record.guest_name;
  const guestPhone = updateResult.service_record.customer_phone;
  if (guestPhone) {
    await Promise.race([
      scheduleFeedback(restaurantId, reservationId, guestPhone, guestName).catch(err => {
        logger.error('Failed to schedule feedback', { error: err.message });
      }),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]);
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
      status: 'available',
      current_service_id: null
    })
  );

  await Promise.all(updatePromises);

  return res.status(200).json({
    success: true,
    message: 'Service completed successfully',
    tables_freed: tableIds
  });
}

module.exports = {
  handleCheckIn,
  handleCheckWalkIn,
  handleSeatParty,
  handleCompleteService
};
