const { getReservations, updateReservation } = require('./_lib/airtable');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  try {
    const {
      reservation_id,
      new_date,
      new_time,
      new_party_size
    } = req.method === 'POST' ? req.body : req.query;

    if (!reservation_id) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Reservation ID is required'
      });
    }

    if (!new_date && !new_time && !new_party_size) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Please provide at least one field to modify (new_date, new_time, or new_party_size)'
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

    // Prepare update fields
    const updateFields = {
      'Updated At': new Date().toISOString().split('T')[0]
    };

    if (new_date) updateFields['Date'] = new_date;
    if (new_time) updateFields['Time'] = new_time;
    if (new_party_size) updateFields['Party Size'] = parseInt(new_party_size);

    // Update the reservation
    const updateResult = await updateReservation(reservation.id, updateFields);

    if (!updateResult.success) {
      return res.status(500).json(updateResult);
    }

    return res.status(200).json({
      success: true,
      message: 'Reservation updated successfully',
      reservation_id,
      updated_fields: Object.keys(updateFields).filter(key => key !== 'Updated At')
    });

  } catch (error) {
    console.error('Modify reservation error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to modify reservation at this time. Please call us directly.'
    });
  }
};
