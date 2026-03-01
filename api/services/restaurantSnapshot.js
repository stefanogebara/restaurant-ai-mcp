const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { buildForecast } = require('./staffingService');

const logger = createSecureLogger('restaurant-snapshot');

const DEFAULT_STAFFING_ROLES = [
  { name: 'FOH', covers_per_staff: 15 },
  { name: 'BOH', covers_per_staff: 20 },
  { name: 'Bar', covers_per_staff: 25 },
];

async function getRestaurantSnapshot(restaurantId) {
  const [reservationsRes, waitlistRes, activeRes, configRes] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('id, guest_name, party_size, reservation_time, status, date')
      .eq('restaurant_id', restaurantId)
      .gte('reservation_time', new Date().toISOString())
      .order('reservation_time')
      .limit(20),
    supabaseAdmin
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('status', 'waiting')
      .limit(1),
    supabaseAdmin
      .from('service_records')
      .select('id, guest_name, party_size, table_id, seated_at')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active')
      .limit(50),
    supabaseAdmin
      .from('restaurant_config')
      .select('staffing_config')
      .eq('id', restaurantId)
      .single(),
  ]);

  if (reservationsRes.error) {
    logger.error('getRestaurantSnapshot reservations query failed', { restaurantId, error: reservationsRes.error.message });
  }
  if (waitlistRes.error) {
    logger.error('getRestaurantSnapshot waitlist query failed', { restaurantId, error: waitlistRes.error.message });
  }
  if (activeRes.error) {
    logger.error('getRestaurantSnapshot service_records query failed', { restaurantId, error: activeRes.error.message });
  }

  // Build 3-day staffing forecast
  const roles = configRes.data?.staffing_config?.roles || DEFAULT_STAFFING_ROLES;
  const reservations = reservationsRes.data || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const coversByDate = {};
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    coversByDate[d.toISOString().split('T')[0]] = 0;
  }
  reservations.forEach(r => {
    const dateKey = r.date || (r.reservation_time ? r.reservation_time.split('T')[0] : null);
    if (dateKey && coversByDate[dateKey] !== undefined) {
      coversByDate[dateKey] += r.party_size || 0;
    }
  });
  const staffing_forecast = buildForecast(
    Object.entries(coversByDate).map(([date, covers]) => ({ date, covers })),
    roles
  );

  return {
    snapshot_time: new Date().toISOString(),
    upcoming_reservations: reservations,
    waitlist_count: waitlistRes.count || 0,
    active_parties: activeRes.data || [],
    staffing_forecast,
    errors: [
      reservationsRes.error && 'reservations',
      waitlistRes.error && 'waitlist',
      activeRes.error && 'service_records',
    ].filter(Boolean),
  };
}

module.exports = { getRestaurantSnapshot };
