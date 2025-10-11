const { getReservations, getRestaurantInfo } = require('./_lib/airtable');

module.exports = async (req, res) => {
  // Enable CORS for ElevenLabs
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { date, time, party_size } = req.method === 'POST' ? req.body : req.query;

    if (!date || !time || !party_size) {
      return res.status(400).json({
        success: false,
        error: true,
        message: 'Missing required parameters: date, time, and party_size are required'
      });
    }

    // Get restaurant info
    const restaurantResult = await getRestaurantInfo();
    if (!restaurantResult.success) {
      return res.status(500).json(restaurantResult);
    }

    const restaurant = restaurantResult.data.records[0];
    if (!restaurant) {
      return res.status(500).json({
        success: false,
        error: true,
        message: 'Restaurant configuration not found'
      });
    }

    const capacity = restaurant.fields.Capacity || 60;

    // Get existing reservations for that date
    const filter = `AND(IS_SAME({Date}, '${date}', 'day'), OR({Status} = 'Confirmed', {Status} = 'Seated'))`;
    const reservationsResult = await getReservations(filter);

    if (!reservationsResult.success) {
      return res.status(500).json(reservationsResult);
    }

    // Calculate current bookings
    let totalBooked = 0;
    reservationsResult.data.records.forEach(reservation => {
      totalBooked += reservation.fields['Party Size'] || 0;
    });

    const availableCapacity = capacity - totalBooked;
    const partySize = parseInt(party_size);
    const available = availableCapacity >= partySize;

    return res.status(200).json({
      success: true,
      available,
      available_capacity: availableCapacity,
      message: available
        ? `Yes, we have availability for ${partySize} guests on ${date} at ${time}`
        : `Sorry, we only have capacity for ${availableCapacity} more guests on ${date}. Your party of ${partySize} exceeds our available space.`
    });

  } catch (error) {
    console.error('Check availability error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to check availability at this time. Please call us directly.'
    });
  }
};
