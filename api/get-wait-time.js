const { getReservations, getRestaurantInfo } = require('./_lib/supabase');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  try {
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

    // Get today's reservations
    const today = new Date().toISOString().split('T')[0];
    const filter = `AND(IS_SAME({Date}, '${today}', 'day'), OR({Status} = 'Confirmed', {Status} = 'Seated'))`;
    const reservationsResult = await getReservations(filter);

    if (!reservationsResult.success) {
      return res.status(500).json(reservationsResult);
    }

    // Calculate current occupancy
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const nowTime = currentHour * 60 + currentMinute;

    let upcomingReservations = 0;
    reservationsResult.data.records.forEach(record => {
      const timeStr = record.fields.Time || '';
      if (!timeStr) return;

      const [hour, minute] = timeStr.split(':').map(Number);
      if (isNaN(hour) || isNaN(minute)) return;

      const resTime = hour * 60 + minute;
      const timeDiff = resTime - nowTime;

      // Count reservations within next 2 hours
      if (timeDiff >= 0 && timeDiff <= 120) {
        upcomingReservations++;
      }
    });

    // Calculate occupancy and wait time
    const occupancy = upcomingReservations / capacity;
    let waitMinutes = 10;

    if (occupancy > 0.8) {
      waitMinutes = 30 + Math.floor(Math.random() * 15);
    } else if (occupancy > 0.6) {
      waitMinutes = 20 + Math.floor(Math.random() * 10);
    } else if (occupancy > 0.4) {
      waitMinutes = 15 + Math.floor(Math.random() * 5);
    }

    // Add extra time during peak hours (6 PM - 8 PM)
    const isPeakHour = (currentHour >= 18 && currentHour <= 20);
    if (isPeakHour) {
      waitMinutes += 10;
    }

    return res.status(200).json({
      success: true,
      estimated_wait_minutes: waitMinutes,
      message: `Current estimated wait time is ${waitMinutes} minutes`,
      is_peak_hour: isPeakHour,
      occupancy_percentage: Math.round(occupancy * 100)
    });

  } catch (error) {
    console.error('Get wait time error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to calculate wait time at this time. Please call us directly.'
    });
  }
};
