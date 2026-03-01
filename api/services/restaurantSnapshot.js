const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('restaurant-snapshot');

async function getRestaurantSnapshot(restaurantId) {
  const [reservationsRes, waitlistRes, activeRes] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('id, guest_name, party_size, reservation_time, status')
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

  return {
    snapshot_time: new Date().toISOString(),
    upcoming_reservations: reservationsRes.data || [],
    waitlist_count: waitlistRes.count || 0,
    active_parties: activeRes.data || [],
    errors: [
      reservationsRes.error && 'reservations',
      waitlistRes.error && 'waitlist',
      activeRes.error && 'service_records',
    ].filter(Boolean),
  };
}

module.exports = { getRestaurantSnapshot };
