const { getReservations, getRestaurantInfo, supabaseAdmin } = require('./_lib/supabase');
const { checkTimeSlotAvailability, getSuggestedTimes } = require('./_lib/availability-calculator');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const logger = createSecureLogger('CheckAvailability');

module.exports = async (req, res) => {
  // Enable CORS
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Apply rate limiting (60 requests per minute)
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return; // 429 response already sent

  try {
    const params = req.method === 'POST' ? req.body : req.query;
    const { date, time, party_size, restaurant_id: restaurantId } = params;

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter: restaurant_id'
      });
    }

    if (!date || !time || !party_size) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: date, time, and party_size are required'
      });
    }

    // Validate restaurant_id format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(restaurantId)) {
      return res.status(400).json({ success: false, error: 'Invalid restaurant ID format' });
    }

    // Get restaurant info
    const restaurantResult = await getRestaurantInfo(restaurantId);
    if (!restaurantResult.success) {
      logger.error('Failed to get restaurant info:', restaurantResult);
      return res.status(500).json({ success: false, error: 'Failed to load restaurant configuration' });
    }

    const restaurant = restaurantResult.data.records[0];
    if (!restaurant) {
      return res.status(500).json({
        success: false,
        error: 'Restaurant configuration not found'
      });
    }

    const timezone = restaurant.fields.Timezone || 'UTC';

    // Derive total capacity from active tables
    let capacity = 60;
    if (supabaseAdmin) {
      const { data: tables } = await supabaseAdmin
        .from('tables')
        .select('capacity')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true);
      if (tables && tables.length > 0) {
        capacity = tables.reduce((sum, t) => sum + (t.capacity || 0), 0) || 60;
      }
    }

    // Extract open/close times from business_hours for the requested date
    let openTime = '17:00';
    let closeTime = '22:00';
    const businessHours = restaurant.fields['Business Hours'];
    if (businessHours && typeof businessHours === 'object') {
      const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', timeZone: timezone }).toLowerCase();
      const dayHours = businessHours[dayOfWeek];
      if (dayHours && dayHours.is_open) {
        openTime = dayHours.open_time || openTime;
        closeTime = dayHours.close_time || closeTime;
      }
    }

    // Get existing reservations for that date (confirmed or seated only)
    const reservationsResult = await getReservations(restaurantId, { date });

    if (!reservationsResult.success) {
      logger.error('Failed to get reservations:', reservationsResult);
      return res.status(500).json({ success: false, error: 'Failed to load reservations' });
    }

    const existingReservations = (reservationsResult.data.records || []).filter(r => {
      const status = r.fields.Status;
      return status === 'confirmed' || status === 'seated' || status === 'Confirmed' || status === 'Seated';
    });
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
        timezone,
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
    logger.error('Check availability error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to check availability at this time. Please call us directly.'
    });
  }
};
