const {
  getAllTables,
  getActiveServiceRecords,
  supabaseAdmin
} = require('./_lib/supabase');

const { verifyAuth } = require('./_lib/auth');
const { checkSubscription } = require('./_lib/subscription-middleware');
const { hasFeature } = require('./services/subscription-limits');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const logger = createSecureLogger('Analytics');

async function getAllReservations(restaurantId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select('date, time, status, party_size, customer_name, reservation_id, created_at')
      .eq('restaurant_id', restaurantId);

    if (error) throw error;

    // Map to Airtable-compatible format so the rest of the code works unchanged
    const records = (data || []).map(r => ({
      fields: {
        Date: r.date,
        Time: r.time,
        Status: r.status,
        'Party Size': r.party_size,
        'Customer Name': r.customer_name,
        'Reservation ID': r.reservation_id,
      },
      createdTime: r.created_at,
    }));
    return { success: true, records };
  } catch (error) {
    logger.error('Error fetching reservations:', error.message);
    return { success: false, error: error.message };
  }
}

async function getAllServiceRecordsData(restaurantId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('service_records')
      .select('status, seated_at, departed_at, table_ids')
      .eq('restaurant_id', restaurantId);

    if (error) throw error;

    // Map to Airtable-compatible format
    const records = (data || []).map(r => ({
      fields: {
        Status: r.status,
        'Seated At': r.seated_at,
        'Departed At': r.departed_at,
        'Table IDs': r.table_ids ? r.table_ids.join(',') : '',
      }
    }));
    return { success: true, records };
  } catch (error) {
    logger.error('Error fetching service records:', error.message);
    return { success: false, error: error.message };
  }
}

function parseDateRange(period, startDate, endDate) {
  const now = new Date();
  const today = new Date(now.toISOString().split('T')[0]);
  if (startDate && endDate) {
    return { from: new Date(startDate), to: new Date(endDate + 'T23:59:59Z') };
  }
  if (period === 'today') {
    return { from: today, to: new Date(today.getTime() + 86399999) };
  }
  if (period === '7d') {
    return { from: new Date(now.getTime() - 7 * 86400000), to: now };
  }
  if (period === '90d') {
    return { from: new Date(now.getTime() - 90 * 86400000), to: now };
  }
  if (period === 'this_month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  }
  if (period === 'last_month') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last  = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from: first, to: last };
  }
  // default 30d
  return { from: new Date(now.getTime() - 30 * 86400000), to: now };
}

async function calculateAnalytics(restaurantId, period = '30d', startDate = null, endDate = null, includeExport = false) {
  const results = await Promise.all([
    getAllReservations(restaurantId),
    getAllServiceRecordsData(restaurantId),
    getAllTables(restaurantId),
    getActiveServiceRecords(restaurantId)
  ]);

  const reservationsResult = results[0];
  const serviceRecordsResult = results[1];
  const tablesResult = results[2];
  const activePartiesResult = results[3];

  if (!reservationsResult.success && !serviceRecordsResult.success && !tablesResult.success) {
    // All queries failed — likely a database issue
    return { success: false, error: 'Failed to fetch analytics data' };
  }

  // Gracefully handle partial failures — use empty arrays for failed queries
  const reservations = reservationsResult.success ? (reservationsResult.records || []) : [];
  const serviceRecords = serviceRecordsResult.success ? (serviceRecordsResult.records || []) : [];
  const tables = tablesResult.success ? (tablesResult.tables || []) : [];
  const activeParties = activePartiesResult.service_records || [];

  const now = new Date();
  const { from, to } = parseDateRange(period, startDate, endDate);

  const recentReservations = reservations.filter(r => {
    const resDate = new Date(r.fields.Date || r.createdTime);
    return resDate >= from && resDate <= to;
  });

  const completedServiceRecords = serviceRecords.filter(r =>
    r.fields.Status === 'Completed' && r.fields['Departed At']
  );

  const totalReservations = recentReservations.length;
  const totalCompletedServices = completedServiceRecords.length;
  const totalCapacity = tables.reduce((sum, table) => sum + table.capacity, 0);
  const currentOccupancy = activeParties.reduce((sum, party) => sum + party.party_size, 0);

  let avgPartySize = 0;
  if (recentReservations.length > 0) {
    const total = recentReservations.reduce((sum, r) => sum + (r.fields['Party Size'] || 0), 0);
    avgPartySize = total / recentReservations.length;
  }

  const serviceDurations = completedServiceRecords
    .filter(r => r.fields['Seated At'] && r.fields['Departed At'])
    .map(r => {
      const seatedAt = new Date(r.fields['Seated At']);
      const departedAt = new Date(r.fields['Departed At']);
      return (departedAt - seatedAt) / 60000;
    });

  const avgServiceTime = serviceDurations.length > 0
    ? serviceDurations.reduce((sum, t) => sum + t, 0) / serviceDurations.length
    : 90;

  const statusCounts = {};
  recentReservations.forEach(r => {
    const status = r.fields.Status || 'pending';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  const dayOfWeekCounts = {};
  recentReservations.forEach(r => {
    const date = new Date(r.fields.Date);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[date.getDay()];
    dayOfWeekCounts[dayName] = (dayOfWeekCounts[dayName] || 0) + 1;
  });

  const timeSlotCounts = {};
  recentReservations.forEach(r => {
    const time = r.fields.Time || '';
    const hour = parseInt(time.split(':')[0]) || 0;
    let slot = 'Other';
    if (hour >= 11 && hour < 14) slot = 'Lunch (11AM-2PM)';
    else if (hour >= 17 && hour < 19) slot = 'Early Dinner (5PM-7PM)';
    else if (hour >= 19 && hour < 22) slot = 'Prime Dinner (7PM-10PM)';
    else if (hour >= 22) slot = 'Late Night (10PM+)';
    timeSlotCounts[slot] = (timeSlotCounts[slot] || 0) + 1;
  });

  const tableUtilization = tables.map(table => {
    const timesUsed = completedServiceRecords.filter(r => {
      const tableIds = r.fields['Table IDs'] || '';
      const tableArray = typeof tableIds === 'string' ? tableIds.split(',') : [];
      return tableArray.includes(table.table_number.toString());
    }).length;

    const rate = totalCompletedServices > 0 ? (timesUsed / totalCompletedServices * 100).toFixed(1) : 0;
    
    return {
      table_number: table.table_number,
      capacity: table.capacity,
      location: table.location,
      times_used: timesUsed,
      utilization_rate: rate
    };
  });

  const msPerDay = 86400000;
  const totalDays = Math.min(Math.ceil((to - from) / msPerDay) + 1, 90);
  const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dailyTrend = [];
  for (let i = 0; i < totalDays; i++) {
    const date = new Date(from.getTime() + i * msPerDay);
    dailyTrend.push({
      date: date.toISOString().split('T')[0],
      dayName: dowNames[date.getDay()],
      reservations: 0,
      completed_services: 0
    });
  }

  recentReservations.forEach(r => {
    const resDate = new Date(r.fields.Date).toISOString().split('T')[0];
    const bucket = dailyTrend.find(d => d.date === resDate);
    if (bucket) bucket.reservations++;
  });

  completedServiceRecords.forEach(r => {
    if (!r.fields['Departed At']) return;
    const depDate = new Date(r.fields['Departed At']).toISOString().split('T')[0];
    const bucket = dailyTrend.find(d => d.date === depDate);
    if (bucket) bucket.completed_services++;
  });

  const result = {
    success: true,
    analytics: {
      overview: {
        total_reservations: totalReservations,
        total_completed_services: totalCompletedServices,
        avg_party_size: parseFloat(avgPartySize.toFixed(1)),
        avg_service_time_minutes: Math.round(avgServiceTime),
        total_capacity: totalCapacity,
        current_occupancy: currentOccupancy,
        current_occupancy_percentage: totalCapacity > 0 ? ((currentOccupancy / totalCapacity) * 100).toFixed(1) : '0.0'
      },
      reservations_by_status: statusCounts,
      reservations_by_day: dayOfWeekCounts,
      reservations_by_time_slot: timeSlotCounts,
      table_utilization: tableUtilization.sort((a, b) => b.times_used - a.times_used),
      daily_trend: dailyTrend
    }
  };

  if (includeExport) {
    result.analytics.raw_reservations = recentReservations.map(r => ({
      date: r.fields.Date,
      time: r.fields.Time,
      customer_name: r.fields['Customer Name'],
      party_size: r.fields['Party Size'],
      status: r.fields.Status,
      reservation_id: r.fields['Reservation ID'],
    }));
  }

  return result;
}

module.exports = async (req, res) => {
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // Apply rate limiting (60 requests per minute)
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return; // 429 response already sent

  // Verify authentication
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      error: authResult.error,
      message: 'Authentication required to access analytics'
    });
  }
  req.user = authResult.user;

  // Early check: user must have a restaurant_id
  const restaurantId = req.user.restaurant_id;
  if (!restaurantId) {
    return res.status(200).json({
      success: true,
      no_restaurant: true,
      analytics: {
        overview: {
          total_reservations: 0, total_completed_services: 0,
          avg_party_size: 0, avg_service_time_minutes: 0,
          total_capacity: 0, current_occupancy: 0, current_occupancy_percentage: '0.0',
        },
        reservations_by_status: {}, reservations_by_day: {},
        reservations_by_time_slot: {}, table_utilization: [], daily_trend: [],
      },
    });
  }

  // Check subscription status
  let subscriptionChecked = false;
  await checkSubscription(req, res, () => { subscriptionChecked = true; });
  if (!subscriptionChecked) return;

  // Check feature access
  const plan = req.subscription?.plan_name?.toLowerCase();
  const featureAllowed = hasFeature(plan, 'advanced_analytics');
  if (!featureAllowed) {
    return res.status(200).json({
      success: true,
      upgrade_required: true,
      analytics: {
        overview: {
          total_reservations: 0, total_completed_services: 0,
          avg_party_size: 0, avg_service_time_minutes: 0,
          total_capacity: 0, current_occupancy: 0, current_occupancy_percentage: '0.0',
        },
        reservations_by_status: {}, reservations_by_day: {},
        reservations_by_time_slot: {}, table_utilization: [], daily_trend: [],
      },
    });
  }

  try {
    const period     = req.query.period || '30d';
    const startDate  = req.query.start_date || null;
    const endDate    = req.query.end_date   || null;
    const incExport  = req.query.include_export === 'true';
    const result = await calculateAnalytics(restaurantId, period, startDate, endDate, incExport);
    return res.status(200).json(result);
  } catch (error) {
    logger.error('Analytics error:', error);
    return res.status(500).json({ success: false, error: 'Failed to calculate analytics' });
  }
};
