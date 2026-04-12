const {
  getAllTables,
  getActiveServiceRecords,
  getUpcomingReservations,
  query: supabase
} = require('../../_lib/supabase');

async function handleDashboard(req, res) {
  const restaurantId = req.user.restaurant_id;
  const timezone = req.user.timezone || 'UTC';
  const [tablesResult, activePartiesResult, upcomingReservationsResult, restaurantConfigResult] = await Promise.all([
    getAllTables(restaurantId),
    getActiveServiceRecords(restaurantId),
    getUpcomingReservations(restaurantId, timezone),
    supabase
      .schema('restaurant')
      .from('restaurant_config')
      .select('slug')
      .eq('id', restaurantId)
      .single()
  ]);

  if (!tablesResult.success || !activePartiesResult.success || !upcomingReservationsResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to load dashboard data'
    });
  }

  const restaurantSlug = restaurantConfigResult.data?.slug || null;

  const tables = tablesResult.tables;

  // Build a set of table UUIDs that have upcoming reservations (reserved status for floor plan)
  const reservedTableIds = new Set(
    (upcomingReservationsResult.reservations || [])
      .filter(r => Array.isArray(r.table_ids) && r.table_ids.length > 0)
      .flatMap(r => r.table_ids)
  );

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
    success: true,
    restaurant_id: restaurantId,
    timezone: timezone,
    slug: restaurantSlug,
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
      max_single_party_size: maxSinglePartySize,
      flexible_tables_available: flexibleTables.length,
      fixed_tables_available: fixedTables.length
    },
    tables: tables.map(t => {
      // If the table is assigned to an upcoming reservation and not currently occupied, mark it Reserved
      const effectiveStatus = (!t.status || t.status === 'available' || t.status === 'Available') && reservedTableIds.has(t.id)
        ? 'Reserved'
        : (t.status ? t.status.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : t.status);
      return ({
      id: t.id,
      table_number: t.table_number,
      capacity: t.capacity,
      location: t.location,
      status: effectiveStatus,
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
      width: t.width ?? null,
      height: t.height ?? null,
      rotation: t.rotation || 0,
      // Legacy fields
      is_fixed: t.is_fixed || false
    });
    }),
    active_parties: activeParties,
    upcoming_reservations: upcomingReservationsResult.reservations
  });
}

module.exports = { handleDashboard };
