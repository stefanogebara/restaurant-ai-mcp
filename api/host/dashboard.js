const {
  getTables,
  getActiveServiceRecords,
  getReservations
} = require('../_lib/airtable');

/**
 * Host Dashboard Endpoint
 *
 * Real-time overview of restaurant status:
 * - Current table occupancy
 * - Active service records (who's sitting now)
 * - Upcoming reservations (next 2 hours)
 * - Available capacity
 * - Tables being cleaned
 *
 * GET /api/host/dashboard
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: true,
      message: 'Method not allowed. Use GET.'
    });
  }

  try {
    // 1. Get all tables
    const tablesResult = await getTables();

    if (!tablesResult.success) {
      return res.status(500).json({
        success: false,
        error: true,
        message: 'Failed to retrieve tables'
      });
    }

    const allTables = tablesResult.data.records || [];
    const activeTables = allTables.filter(t => t.fields['Is Active']);

    // 2. Get active service records
    const serviceRecordsResult = await getActiveServiceRecords();

    if (!serviceRecordsResult.success) {
      return res.status(500).json({
        success: false,
        error: true,
        message: 'Failed to retrieve active service records'
      });
    }

    const activeServices = serviceRecordsResult.data.records || [];

    // 3. Get upcoming reservations (next 2 hours)
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 120 * 60000);

    const today = now.toISOString().split('T')[0];
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM
    const futureTime = twoHoursFromNow.toTimeString().slice(0, 5);

    const upcomingFilter = `AND(
      {Date} = '${today}',
      {Time} >= '${currentTime}',
      {Time} <= '${futureTime}',
      OR({Status} = 'Confirmed', {Status} = 'Waitlist')
    )`;

    const upcomingReservationsResult = await getReservations(upcomingFilter);

    const upcomingReservations = upcomingReservationsResult.success
      ? (upcomingReservationsResult.data.records || [])
      : [];

    // 4. Calculate capacity statistics
    const totalCapacity = activeTables.reduce((sum, t) => sum + t.fields.Capacity, 0);

    const availableTables = activeTables.filter(t => t.fields.Status === 'Available');
    const occupiedTables = activeTables.filter(t => t.fields.Status === 'Occupied');
    const cleaningTables = activeTables.filter(t => t.fields.Status === 'Being Cleaned');
    const reservedTables = activeTables.filter(t => t.fields.Status === 'Reserved');

    const availableSeats = availableTables.reduce((sum, t) => sum + t.fields.Capacity, 0);
    const occupiedSeats = activeServices.reduce((sum, s) => sum + (s.fields['Party Size'] || 0), 0);

    // 5. Group tables by location
    const locations = {};
    activeTables.forEach(table => {
      const loc = table.fields.Location || 'Unknown';
      if (!locations[loc]) {
        locations[loc] = {
          total_tables: 0,
          total_capacity: 0,
          available: 0,
          occupied: 0,
          cleaning: 0,
          reserved: 0
        };
      }

      locations[loc].total_tables++;
      locations[loc].total_capacity += table.fields.Capacity;

      const status = table.fields.Status;
      if (status === 'Available') locations[loc].available++;
      else if (status === 'Occupied') locations[loc].occupied++;
      else if (status === 'Being Cleaned') locations[loc].cleaning++;
      else if (status === 'Reserved') locations[loc].reserved++;
    });

    // 6. Build active parties list with estimated departure
    const activeParties = activeServices.map(service => {
      const fields = service.fields;
      const seatedAt = new Date(fields['Seated At']);
      const estimatedDeparture = fields['Estimated Departure']
        ? new Date(fields['Estimated Departure'])
        : null;

      // Calculate time elapsed and time remaining
      const elapsedMinutes = Math.round((now - seatedAt) / 60000);
      const remainingMinutes = estimatedDeparture
        ? Math.round((estimatedDeparture - now) / 60000)
        : null;

      return {
        service_id: fields['Service ID'],
        record_id: service.id,
        customer_name: fields['Customer Name'],
        party_size: fields['Party Size'],
        type: fields.Type,
        status: fields.Status,
        seated_at: fields['Seated At'],
        estimated_departure: estimatedDeparture ? estimatedDeparture.toISOString() : null,
        time_elapsed_minutes: elapsedMinutes,
        time_remaining_minutes: remainingMinutes,
        is_overdue: remainingMinutes !== null && remainingMinutes < 0
      };
    });

    // 7. Build upcoming reservations list
    const upcomingList = upcomingReservations.map(res => {
      const fields = res.fields;
      return {
        reservation_id: fields['Reservation ID'],
        record_id: res.id,
        customer_name: fields['Customer Name'],
        party_size: fields['Party Size'],
        time: fields.Time,
        status: fields.Status,
        checked_in: !!fields['Checked In At'],
        special_requests: fields['Special Requests'] || ''
      };
    });

    // 8. Return comprehensive dashboard
    return res.status(200).json({
      success: true,
      timestamp: now.toISOString(),
      summary: {
        total_capacity: totalCapacity,
        available_seats: availableSeats,
        occupied_seats: occupiedSeats,
        occupancy_percentage: totalCapacity > 0
          ? Math.round((occupiedSeats / totalCapacity) * 100)
          : 0,
        active_parties: activeServices.length,
        upcoming_reservations: upcomingReservations.length
      },
      tables_by_status: {
        available: availableTables.length,
        occupied: occupiedTables.length,
        being_cleaned: cleaningTables.length,
        reserved: reservedTables.length,
        total_active: activeTables.length
      },
      locations: locations,
      active_parties: activeParties.sort((a, b) => {
        // Sort by estimated departure (soonest first)
        if (a.estimated_departure && b.estimated_departure) {
          return new Date(a.estimated_departure) - new Date(b.estimated_departure);
        }
        return 0;
      }),
      upcoming_reservations: upcomingList.sort((a, b) => {
        // Sort by time (earliest first)
        return a.time.localeCompare(b.time);
      }),
      tables: activeTables.map(t => ({
        table_number: t.fields['Table Number'],
        capacity: t.fields.Capacity,
        location: t.fields.Location,
        table_type: t.fields['Table Type'],
        status: t.fields.Status,
        record_id: t.id
      }))
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to load dashboard. Please try again.'
    });
  }
};
