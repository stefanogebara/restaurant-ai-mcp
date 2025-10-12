const { getReservations, getRestaurantInfo } = require('./_lib/airtable');
const { checkTimeSlotAvailability, getSuggestedTimes } = require('./_lib/availability-calculator');

module.exports = async (req, res) => {
  // Enable CORS for ElevenLabs
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
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
    const openTime = restaurant.fields['Opening Time'] || '17:00';
    const closeTime = restaurant.fields['Closing Time'] || '22:00';

    // Get existing reservations for that date
    const filter = `AND(IS_SAME({Date}, '${date}', 'day'), OR({Status} = 'Confirmed', {Status} = 'Seated'))`;
    const reservationsResult = await getReservations(filter);

    if (!reservationsResult.success) {
      return res.status(500).json(reservationsResult);
    }

    const existingReservations = reservationsResult.data.records || [];
    const partySize = parseInt(party_size);

    // Check availability using the sophisticated calculator
    const availabilityCheck = checkTimeSlotAvailability(
      time,
      partySize,
      existingReservations,
      capacity
    );

    if (availabilityCheck.available) {
      return res.status(200).json({
        success: true,
        available: true,
        message: `Yes, we have availability for ${partySize} guests on ${date} at ${time}`,
        details: {
          estimated_duration: `${availabilityCheck.estimatedDuration} minutes`,
          occupied_seats: availabilityCheck.occupiedSeats,
          available_seats: availabilityCheck.availableSeats
        }
      });
    } else {
      // Get alternative time suggestions
      const suggestions = getSuggestedTimes(
        time,
        partySize,
        existingReservations,
        capacity,
        openTime,
        closeTime
      );

      return res.status(200).json({
        success: true,
        available: false,
        message: `Sorry, ${time} is fully booked. ${availabilityCheck.reason}. We have ${availabilityCheck.availableSeats} seats available at that time, but your party needs ${partySize} seats.`,
        details: {
          requested_time: time,
          party_size: partySize,
          available_seats_at_time: availabilityCheck.availableSeats,
          occupied_seats: availabilityCheck.occupiedSeats
        },
        alternative_times: suggestions.length > 0 ? suggestions.map(s => ({
          time: s.time,
          available_seats: s.availableSeats,
          message: `${s.time} has ${s.availableSeats} seats available`
        })) : []
      });
    }

  } catch (error) {
    console.error('Check availability error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to check availability at this time. Please call us directly.'
    });
  }
};
