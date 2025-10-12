const {
  getReservationById,
  updateReservation,
  getTables,
  updateTableStatus,
  createServiceRecord
} = require('../_lib/airtable');
const { validateAssignment } = require('../_lib/table-assignment');

/**
 * Seat Party Endpoint
 *
 * After check-in, actually seat the party:
 * 1. Validate table selection
 * 2. Update table statuses to "Occupied"
 * 3. Create Service Record
 * 4. Link everything together
 * 5. Update reservation status to "Seated"
 *
 * POST /api/host/seat-party
 * Body: {
 *   reservation_id: "RES-20250112-1234",  // Optional for walk-ins
 *   table_record_ids: ["recABC123", "recDEF456"],
 *   party_size: 4,
 *   customer_name: "John Doe",           // Required if no reservation
 *   customer_phone: "+1234567890",       // Required if no reservation
 *   type: "Reservation" | "Walk-in" | "Waitlist"
 * }
 */
module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: true,
      message: 'Method not allowed. Use POST.'
    });
  }

  try {
    const {
      reservation_id,
      table_record_ids,
      party_size,
      customer_name,
      customer_phone,
      type = 'Reservation'
    } = req.body;

    // Validate input
    if (!table_record_ids || !Array.isArray(table_record_ids) || table_record_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Missing required field: table_record_ids (array of Airtable record IDs)'
      });
    }

    if (!party_size || party_size < 1) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Missing or invalid party_size'
      });
    }

    // For non-reservation types, require customer info
    if (type !== 'Reservation' && (!customer_name || !customer_phone)) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'For walk-ins and waitlist, customer_name and customer_phone are required'
      });
    }

    let reservation = null;
    let customerName = customer_name;
    let customerPhone = customer_phone;

    // If reservation ID provided, look it up
    if (reservation_id) {
      const reservationResult = await getReservationById(reservation_id);

      if (!reservationResult.success) {
        return res.status(404).json({
          success: false,
          error: true,
          message: `Reservation ${reservation_id} not found`
        });
      }

      reservation = reservationResult.data;
      customerName = reservation.fields['Customer Name'];
      customerPhone = reservation.fields['Customer Phone'];

      // Verify reservation was checked in
      if (!reservation.fields['Checked In At']) {
        return res.status(400).json({
          success: false,
          error: true,
          message: 'Reservation must be checked in first. Use /api/host/check-in'
        });
      }

      // Verify not already seated
      if (reservation.fields.Status === 'Seated') {
        return res.status(400).json({
          success: false,
          error: true,
          message: 'This party is already seated'
        });
      }
    }

    // 1. Fetch table details to validate
    const tablePromises = table_record_ids.map(id =>
      getTables(`RECORD_ID() = '${id}'`)
    );

    const tableResults = await Promise.all(tablePromises);

    const tables = tableResults
      .filter(r => r.success && r.data.records && r.data.records.length > 0)
      .map(r => r.data.records[0]);

    if (tables.length !== table_record_ids.length) {
      return res.status(404).json({
        success: false,
        error: true,
        message: 'One or more table IDs not found'
      });
    }

    // 2. Validate table assignment
    const validation = validateAssignment(tables, party_size);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: true,
        message: validation.reason
      });
    }

    // 3. Calculate dining duration
    const expectedDuration = calculateDiningDuration(party_size);
    const seatedAt = new Date();
    const estimatedDeparture = new Date(seatedAt.getTime() + expectedDuration * 60000);

    // 4. Create Service Record
    const serviceRecordFields = {
      'Type': type,
      'Party Size': parseInt(party_size),
      'Customer Name': customerName,
      'Customer Phone': customerPhone,
      'Seated At': seatedAt.toISOString(),
      'Expected Duration': expectedDuration,
      'Status': 'Seated'
    };

    // Link to reservation if exists
    if (reservation) {
      serviceRecordFields['Reservation'] = [reservation.id];
    }

    // Link to tables
    serviceRecordFields['Tables'] = table_record_ids;

    const serviceRecordResult = await createServiceRecord(serviceRecordFields);

    if (!serviceRecordResult.success) {
      return res.status(500).json({
        success: false,
        error: true,
        message: 'Failed to create service record'
      });
    }

    const serviceRecord = serviceRecordResult.data;

    // 5. Update all table statuses to "Occupied"
    const tableUpdatePromises = tables.map(table =>
      updateTableStatus(table.id, 'Occupied')
    );

    await Promise.all(tableUpdatePromises);

    // 6. Update reservation status to "Seated" if reservation exists
    if (reservation) {
      await updateReservation(reservation.id, {
        'Status': 'Seated',
        'Assigned Tables': table_record_ids,
        'Service Record': [serviceRecord.id],
        'Updated At': new Date().toISOString().split('T')[0]
      });
    }

    // 7. Return success with all details
    return res.status(200).json({
      success: true,
      message: `Successfully seated ${customerName}, party of ${party_size}`,
      service_record: {
        id: serviceRecord.id,
        service_id: serviceRecord.fields['Service ID'],
        type: type,
        customer_name: customerName,
        party_size: party_size,
        seated_at: seatedAt.toISOString(),
        expected_duration_minutes: expectedDuration,
        estimated_departure: estimatedDeparture.toISOString(),
        status: 'Seated'
      },
      tables: tables.map(t => ({
        table_number: t.fields['Table Number'],
        capacity: t.fields.Capacity,
        location: t.fields.Location,
        status: 'Occupied'
      })),
      total_capacity: validation.totalCapacity,
      reservation: reservation ? {
        id: reservation_id,
        status: 'Seated'
      } : null,
      next_step: 'When party is ready to leave, use /api/host/complete-service'
    });

  } catch (error) {
    console.error('Seat party error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to seat party. Please try again.'
    });
  }
};

/**
 * Calculate expected dining duration based on party size
 * Industry standards:
 * - 2 people: 90 minutes
 * - 3-4 people: 120 minutes
 * - 5-6 people: 135 minutes
 * - 7+ people: 150 minutes
 */
function calculateDiningDuration(partySize) {
  if (partySize <= 2) return 90;
  if (partySize <= 4) return 120;
  if (partySize <= 6) return 135;
  return 150;
}
