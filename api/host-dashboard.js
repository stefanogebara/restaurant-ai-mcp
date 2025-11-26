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
  findBestTableCombination
} = require('./_lib/supabase');

const { logCustomerShowedUp, logCustomerCancelled } = require('./ml/data-logger');
const { validateServiceRecord, sanitizeInput } = require('./_lib/validation');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

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
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: dashboard, check-in, check-walk-in, seat-party, complete-service, mark-table-clean, update-table-status, or update-reservation'
        });
    }
  } catch (error) {
    console.error('Host dashboard error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'An error occurred processing your request'
    });
  }
};

async function handleDashboard(req, res) {
  const [tablesResult, activePartiesResult, upcomingReservationsResult] = await Promise.all([
    getAllTables(),
    getActiveServiceRecords(),
    getUpcomingReservations()
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

  return res.status(200).json({
    summary: {
      total_capacity: totalCapacity,
      available_seats: availableSeats,
      occupied_seats: occupiedSeats,
      occupancy_percentage: Math.round((occupiedSeats / totalCapacity) * 100),
      active_parties: activeParties.length,
      upcoming_reservations: upcomingReservationsResult.reservations.length,
      estimated_wait_time: estimatedWaitMinutes
    },
    tables: tables.map(t => ({
      id: t.id,
      table_number: t.table_number,
      capacity: t.capacity,
      location: t.location,
      status: t.status ? t.status.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : t.status,
      current_service_id: t.current_service_id
    })),
    active_parties: activeParties,
    upcoming_reservations: upcomingReservationsResult.reservations
  });
}

async function handleCheckIn(req, res) {
  const { reservation_id } = req.body;

  if (!reservation_id) {
    return res.status(400).json({
      success: false,
      error: 'Reservation ID is required'
    });
  }

  const reservationResult = await findReservation({ reservation_id });

  if (!reservationResult.success || !reservationResult.reservation) {
    return res.status(404).json({
      success: false,
      error: 'Reservation not found'
    });
  }

  const reservation = reservationResult.reservation;
  const partySize = reservation.party_size;

  const tablesResult = await getAllTables();
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
  const { party_size, preferred_location } = req.body;

  if (!party_size) {
    return res.status(400).json({
      success: false,
      error: 'Party size is required'
    });
  }

  const tablesResult = await getAllTables();
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
  const estimatedDeparture = new Date(Date.now() + 90 * 60 * 1000).toISOString();

  // Convert table UUIDs to table numbers (Supabase schema uses integer[])
  const allTablesForConversion = await getAllTables();
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
    const serviceResult = await createServiceRecord(serviceFields);
    if (!serviceResult.success) {
      console.error('Failed to create service record:', {
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
      const result = await updateTable(recordId, {
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
    console.error('Transaction failed during seat party:', error);

    // If service record was created, delete it
    if (serviceCreated) {
      console.log(`Rolling back: Deleting service record ${serviceId}`);
      try {
        await deleteServiceRecord(serviceId);
      } catch (rollbackError) {
        console.error('Failed to rollback service record:', rollbackError);
      }
    }

    // If any tables were updated, reset them
    if (tablesUpdated.length > 0) {
      console.log(`Rolling back: Resetting ${tablesUpdated.length} tables`);
      const rollbackPromises = tablesUpdated.map(recordId =>
        updateTable(recordId, {
          'Status': 'available',
          'Current Service ID': ''
        }).catch(err => console.error(`Failed to rollback table ${recordId}:`, err))
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
  const { service_record_id } = req.body;

  if (!service_record_id) {
    return res.status(400).json({
      success: false,
      error: 'Service record ID is required'
    });
  }

  const departedAt = new Date().toISOString();

  const updateResult = await updateServiceRecord(service_record_id, {
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
  const tablesResult = await getAllTables();
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
      console.error(`Table not found for number: ${tableNum}`, { available_tables: tablesResult.tables.map(t => t.table_number) });
    }
    return table ? table.id : null;
  }).filter(id => id !== null);

  const updatePromises = tableRecordIds.map(recordId =>
    updateTable(recordId, {
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
  const { table_id } = req.body;

  if (!table_id) {
    return res.status(400).json({
      success: false,
      error: 'Table ID is required'
    });
  }

  const updateResult = await updateTable(table_id, {
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

  const updateResult = await updateTable(table_id, {
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
  const findResult = await findReservation(reservation_id);

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
  const updateResult = await updateReservation(findResult.reservation.record_id, updates);

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
