const {
  getAllTables,
  getActiveServiceRecords,
  getUpcomingReservations,
  findReservation,
  createServiceRecord,
  updateServiceRecord,
  updateTable,
  generateServiceId,
  findBestTableCombination
} = require('./_lib/airtable');

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
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: dashboard, check-in, check-walk-in, seat-party, complete-service, or mark-table-clean'
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
  const occupiedSeats = activeParties.reduce((sum, party) => sum + party.party_size, 0);
  const availableSeats = totalCapacity - occupiedSeats;

  return res.status(200).json({
    summary: {
      total_capacity: totalCapacity,
      available_seats: availableSeats,
      occupied_seats: occupiedSeats,
      occupancy_percentage: Math.round((occupiedSeats / totalCapacity) * 100),
      active_parties: activeParties.length,
      upcoming_reservations: upcomingReservationsResult.reservations.length
    },
    tables: tables.map(t => ({
      id: t.id,
      table_number: t.table_number,
      capacity: t.capacity,
      location: t.location,
      status: t.status,
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

  const availableTables = tablesResult.tables.filter(t => t.status === 'Available');
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

  let availableTables = tablesResult.tables.filter(t => t.status === 'Available');

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

  if (!customer_name || !customer_phone || !party_size || !table_ids || table_ids.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields'
    });
  }

  const serviceId = generateServiceId();
  const seatedAt = new Date().toISOString();
  const estimatedDeparture = new Date(Date.now() + 90 * 60 * 1000).toISOString();

  const serviceFields = {
    'Service ID': serviceId,
    'Reservation ID': reservation_id || '',
    'Customer Name': customer_name,
    'Customer Phone': customer_phone,
    'Party Size': parseInt(party_size),
    'Table IDs': table_ids.join(', '),
    'Seated At': seatedAt,
    'Estimated Departure': estimatedDeparture,
    'Special Requests': special_requests || '',
    'Status': 'Active'
  };

  const serviceResult = await createServiceRecord(serviceFields);
  if (!serviceResult.success) {
    console.error('Failed to create service record:', {
      serviceFields,
      error: serviceResult.message || serviceResult.error
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to create service record',
      details: serviceResult.message || 'Unknown error'
    });
  }

  // Get all tables to map table numbers to Airtable record IDs
  const tablesResult = await getAllTables();
  if (!tablesResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to load tables for update'
    });
  }

  // Map table numbers to Airtable record IDs
  const tableRecordIds = table_ids.map(tableNum => {
    // Convert to number for comparison since table_number could be string or number
    const table = tablesResult.tables.find(t => Number(t.table_number) === Number(tableNum));
    if (!table) {
      console.error(`Table not found for number: ${tableNum}`, { available_tables: tablesResult.tables.map(t => t.table_number) });
    }
    return table ? table.id : null;
  }).filter(id => id !== null);

  const updatePromises = tableRecordIds.map(recordId =>
    updateTable(recordId, {
      'Status': 'Occupied',
      'Current Service ID': serviceId
    })
  );

  await Promise.all(updatePromises);

  return res.status(200).json({
    success: true,
    service_record_id: serviceId,
    tables_assigned: table_ids,
    estimated_departure: estimatedDeparture,
    message: `Party of ${party_size} seated successfully`
  });
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
    'Departed At': departedAt,
    'Status': 'Completed'
  });

  if (!updateResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to complete service'
    });
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
      'Status': 'Being Cleaned',
      'Current Service ID': ''
    })
  );

  await Promise.all(updatePromises);

  return res.status(200).json({
    success: true,
    message: 'Service completed successfully',
    tables_to_clean: tableIds
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
    'Status': 'Available'
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
