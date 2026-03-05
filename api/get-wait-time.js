const { getReservations, getRestaurantInfo, supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const logger = createSecureLogger('WaitTime');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  try {
    const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
    if (rateLimited) return;

    // Get restaurantId - try auth first, fall back to query param for public access
    let restaurantId = req.query.restaurant_id;

    const authResult = await verifyAuth(req, { required: false });
    if (authResult.user) {
      req.user = authResult.user;
      restaurantId = req.user.restaurant_id || restaurantId;
    }

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        error: 'Missing restaurant_id parameter or authentication'
      });
    }

    // Get restaurant info
    const restaurantResult = await getRestaurantInfo(restaurantId);
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

    // Derive total capacity from active tables (restaurant_config has no capacity column)
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

    // Get today's reservations
    const today = new Date().toISOString().split('T')[0];
    const reservationsResult = await getReservations(restaurantId, { date: today });

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

    const response = {
      success: true,
      estimated_wait_minutes: waitMinutes,
      message: `Current estimated wait time is ${waitMinutes} minutes`,
      is_peak_hour: isPeakHour,
    };

    // Only expose occupancy percentage to authenticated restaurant owners
    if (req.user) {
      response.occupancy_percentage = Math.round(occupancy * 100);
    }

    return res.status(200).json(response);

  } catch (error) {
    logger.error('Get wait time error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to calculate wait time at this time. Please call us directly.'
    });
  }
};
