const { getReservations, updateReservation } = require('./_lib/airtable');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { reservation_id } = req.method === 'POST' ? req.body : req.query;

    if (!reservation_id) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Reservation ID is required'
      });
    }

    // Find the reservation
    const result = await getReservations();

    if (!result.success) {
      return res.status(500).json(result);
    }

    const reservation = result.data.records.find(
      record => record.fields['Reservation ID'] === reservation_id
    );

    if (!reservation) {
      return res.status(404).json({
        success: false,
        found: false,
        message: `Reservation not found with ID: ${reservation_id}`
      });
    }

    // Update to cancelled status
    const updateResult = await updateReservation(reservation.id, {
      'Status': 'Cancelled',
      'Updated At': new Date().toISOString().split('T')[0],
      'Notes': (reservation.fields.Notes || '') + ' - Cancelled via AI Phone System'
    });

    if (!updateResult.success) {
      return res.status(500).json(updateResult);
    }

    return res.status(200).json({
      success: true,
      message: `Reservation ${reservation_id} has been cancelled successfully`,
      reservation_id
    });

  } catch (error) {
    console.error('Cancel reservation error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to cancel reservation at this time. Please call us directly.'
    });
  }
};
