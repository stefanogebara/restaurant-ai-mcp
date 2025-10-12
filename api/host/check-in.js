const {
  getReservationById,
  updateReservation,
  getAvailableTables
} = require('../_lib/airtable');
const { assignTables, getAllTableOptions } = require('../_lib/table-assignment');

/**
 * Check-in Reservation Endpoint
 *
 * When a customer arrives for their reservation:
 * 1. Verify the reservation exists and is valid
 * 2. Mark them as checked in
 * 3. Get available tables
 * 4. Suggest best table assignments
 *
 * POST /api/host/check-in
 * Body: {
 *   reservation_id: "RES-20250112-1234"
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
    const { reservation_id } = req.body;

    // Validate input
    if (!reservation_id) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Missing required field: reservation_id'
      });
    }

    // 1. Look up reservation
    const reservationResult = await getReservationById(reservation_id);

    if (!reservationResult.success) {
      return res.status(404).json({
        success: false,
        error: true,
        message: `Reservation ${reservation_id} not found`
      });
    }

    const reservation = reservationResult.data;
    const fields = reservation.fields;

    // 2. Validate reservation status
    if (fields.Status === 'Cancelled') {
      return res.status(400).json({
        success: false,
        error: true,
        message: `This reservation was cancelled`
      });
    }

    if (fields.Status === 'No-Show') {
      return res.status(400).json({
        success: false,
        error: true,
        message: `This reservation was marked as a no-show`
      });
    }

    if (fields.Status === 'Seated' || fields.Status === 'Completed') {
      return res.status(400).json({
        success: false,
        error: true,
        message: `This reservation has already been checked in`
      });
    }

    // 3. Mark as checked in
    const checkInTime = new Date().toISOString();
    const updateResult = await updateReservation(reservation.id, {
      'Checked In At': checkInTime,
      'Updated At': new Date().toISOString().split('T')[0]
    });

    if (!updateResult.success) {
      return res.status(500).json({
        success: false,
        error: true,
        message: 'Failed to update reservation check-in status'
      });
    }

    // 4. Get available tables
    const tablesResult = await getAvailableTables();

    if (!tablesResult.success) {
      return res.status(500).json({
        success: false,
        error: true,
        message: 'Failed to retrieve available tables'
      });
    }

    const availableTables = tablesResult.data.records || [];

    if (availableTables.length === 0) {
      return res.status(200).json({
        success: true,
        message: `Checked in ${fields['Customer Name']}, but no tables currently available`,
        reservation: {
          id: reservation_id,
          customer_name: fields['Customer Name'],
          party_size: fields['Party Size'],
          checked_in_at: checkInTime,
          special_requests: fields['Special Requests'] || ''
        },
        tables: [],
        recommendation: null,
        all_options: []
      });
    }

    // 5. Get table assignment recommendations
    const partySize = fields['Party Size'];
    const preferredLocation = fields['Preferred Location'] || null;

    // Get best single recommendation
    const recommendation = assignTables(partySize, availableTables, preferredLocation);

    // Get all options ranked by quality
    const allOptions = getAllTableOptions(partySize, availableTables, preferredLocation);

    // 6. Return check-in confirmation with table suggestions
    return res.status(200).json({
      success: true,
      message: `Successfully checked in ${fields['Customer Name']}`,
      reservation: {
        id: reservation_id,
        record_id: reservation.id,
        customer_name: fields['Customer Name'],
        party_size: fields['Party Size'],
        checked_in_at: checkInTime,
        special_requests: fields['Special Requests'] || '',
        preferred_location: preferredLocation
      },
      recommendation: recommendation.success ? {
        match_quality: recommendation.match,
        reason: recommendation.reason,
        tables: recommendation.tables.map(t => ({
          table_number: t.fields['Table Number'],
          capacity: t.fields.Capacity,
          location: t.fields.Location,
          table_type: t.fields['Table Type'],
          record_id: t.id
        })),
        total_capacity: recommendation.total_capacity,
        location: recommendation.location
      } : null,
      all_options: allOptions.slice(0, 5).map(opt => ({
        match: opt.match,
        score: opt.score,
        tables: opt.tableNumbers,
        total_capacity: opt.totalCapacity,
        waste_seats: opt.wasteSeats,
        location: opt.location,
        table_records: opt.tables.map(t => ({
          table_number: t.fields['Table Number'],
          capacity: t.fields.Capacity,
          location: t.fields.Location,
          record_id: t.id
        }))
      })),
      next_step: 'Use /api/host/seat-party to assign tables and seat the party'
    });

  } catch (error) {
    console.error('Check-in error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to process check-in. Please try again.'
    });
  }
};
