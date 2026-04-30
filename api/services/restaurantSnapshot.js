const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { buildForecast } = require('./staffingService');
const { getFeedbackStats } = require('./feedbackService');

const logger = createSecureLogger('restaurant-snapshot');

const DEFAULT_STAFFING_ROLES = [
  { name: 'FOH', covers_per_staff: 15 },
  { name: 'BOH', covers_per_staff: 20 },
  { name: 'Bar', covers_per_staff: 25 },
];

async function getRestaurantSnapshot(restaurantId) {
  // Today as YYYY-MM-DD for the date filter (reservations.date is a date column,
  // reservations.time is a separate time column — no combined reservation_time exists).
  const todayStr = new Date().toISOString().split('T')[0];

  const [reservationsRes, waitlistRes, activeRes, configRes, depositRes, capacityRes] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('id, customer_name, party_size, time, status, date, customer_phone')
      .eq('restaurant_id', restaurantId)
      .gte('date', todayStr)
      .order('date')
      .order('time')
      .limit(20),
    supabaseAdmin
      .from('waitlist')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('status', 'waiting')
      .limit(1),
    supabaseAdmin
      .from('service_records')
      .select('id, customer_name, party_size, table_ids, seated_at')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active')
      .limit(50),
    // M18: maybeSingle so a missing config row returns data:null cleanly
    // instead of throwing PGRST116 ("0 rows when exactly 1 expected").
    supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('staffing_config')
      .eq('id', restaurantId)
      .maybeSingle(),
    supabaseAdmin
      .from('reservations')
      .select('deposit_amount')
      .eq('restaurant_id', restaurantId)
      .not('deposit_amount', 'is', null)
      .in('status', ['confirmed', 'pending'])
      .gte('date', new Date().toISOString().split('T')[0]),
    // M10: total seating capacity — Manager AI can now answer "are we full
    // tonight?" by comparing tonight's covers to this number.
    supabaseAdmin
      .from('tables')
      .select('capacity')
      .eq('restaurant_id', restaurantId)
      .eq('is_active', true),
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
  if (configRes.error) {
    // M18: log explicitly — silent failures here masked staffing-config drift.
    logger.warn('getRestaurantSnapshot restaurant_config query failed', { restaurantId, error: configRes.error.message });
  }
  if (capacityRes.error) {
    logger.warn('getRestaurantSnapshot tables capacity query failed', { restaurantId, error: capacityRes.error.message });
  }

  // Drop today's reservations whose start time has already passed — Manager AI
  // should treat 12pm bookings as "history" once it's 10pm, not "upcoming".
  // Compare HH:MM strings directly (lexicographic order matches chronological).
  const now = new Date();
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const rawReservations = (reservationsRes.data || []).filter(r => {
    if (r.date !== todayStr) return true; // future days always included
    if (!r.time) return true;             // missing time → keep, can't compare
    return String(r.time).slice(0, 5) >= nowHHMM;
  });
  const phones = [...new Set(rawReservations.map(r => r.customer_phone).filter(Boolean))];

  let phoneToLTV = {};
  if (phones.length > 0) {
    const { data: ltvRows } = await supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .select('customer_phone, customer_tier, total_visits, avg_revenue_per_visit, dietary_preferences, special_occasions')
      .eq('restaurant_id', restaurantId)
      .in('customer_phone', phones);

    for (const row of ltvRows || []) {
      phoneToLTV[row.customer_phone] = row;
    }
  }

  const enrichedReservations = rawReservations.map(r => {
    const ltv = r.customer_phone ? phoneToLTV[r.customer_phone] : null;
    return {
      ...r,
      is_regular: !!ltv,
      customer_tier: ltv?.customer_tier || null,
      visit_count: ltv?.total_visits || null,
      avg_spend: ltv?.avg_revenue_per_visit || null,
      dietary_preferences: ltv?.dietary_preferences || null,
      special_occasions: ltv?.special_occasions || null,
    };
  });

  // Build 3-day staffing forecast
  const roles = configRes.data?.staffing_config?.roles || DEFAULT_STAFFING_ROLES;
  const reservations = rawReservations;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const coversByDate = {};
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    coversByDate[d.toISOString().split('T')[0]] = 0;
  }
  reservations.forEach(r => {
    const dateKey = r.date;
    if (dateKey && coversByDate[dateKey] !== undefined) {
      coversByDate[dateKey] += r.party_size || 0;
    }
  });
  const staffing_forecast = buildForecast(
    Object.entries(coversByDate).map(([date, covers]) => ({ date, covers })),
    roles
  );

  // Deposit summary for manager AI
  const depositsTonight = depositRes.data || [];
  const deposit_summary = {
    count: depositsTonight.length,
    total_amount: depositsTonight.reduce((sum, r) => sum + (parseFloat(r.deposit_amount) || 0), 0),
  };

  // Fetch recent feedback stats (non-blocking)
  let feedback_summary = null;
  try {
    feedback_summary = await getFeedbackStats(restaurantId, 7);
  } catch (e) {
    logger.error('Failed to fetch feedback stats for snapshot', { error: e.message });
  }

  // M10: total seating capacity (sum of active table capacities)
  const total_capacity = (capacityRes.data || []).reduce(
    (sum, t) => sum + (Number(t.capacity) || 0),
    0
  );

  // Tonight's projected covers (sum of confirmed/pending reservations for today)
  const todayCovers = enrichedReservations
    .filter(r => r.date === todayStr && (r.status === 'confirmed' || r.status === 'pending'))
    .reduce((sum, r) => sum + (Number(r.party_size) || 0), 0);

  const capacity_summary = {
    total_capacity,
    tonight_covers: todayCovers,
    occupancy_pct: total_capacity > 0 ? Math.round((todayCovers / total_capacity) * 100) : null,
  };

  return {
    snapshot_time: new Date().toISOString(),
    upcoming_reservations: enrichedReservations,
    waitlist_count: waitlistRes.count || 0,
    active_parties: activeRes.data || [],
    staffing_forecast,
    deposit_summary,
    feedback_summary,
    capacity_summary,
    errors: [
      reservationsRes.error && 'reservations',
      waitlistRes.error && 'waitlist',
      activeRes.error && 'service_records',
    ].filter(Boolean),
  };
}

/**
 * Fetch VIP and regular guests booked for today.
 * Used by morning briefings to build the [VIP GUESTS TODAY] block.
 * @param {string} restaurantId
 * @returns {Promise<Array<{ customer_phone, customer_name, customer_tier, total_visits }>>}
 */
async function getVIPsForToday(restaurantId) {
  const today = new Date().toISOString().split('T')[0];

  const { data: reservations } = await supabaseAdmin
    .from('reservations')
    .select('customer_phone, customer_name')
    .eq('restaurant_id', restaurantId)
    .eq('date', today)
    .not('customer_phone', 'is', null)
    .in('status', ['confirmed', 'pending']);

  const phones = [...new Set(
    (reservations || []).map(r => r.customer_phone).filter(Boolean)
  )];

  if (phones.length === 0) return [];

  const { data: ltvRecords } = await supabaseAdmin
    .schema('restaurant')
    .from('customer_ltv')
    .select('customer_phone, customer_name, customer_tier, total_visits')
    .eq('restaurant_id', restaurantId)
    .in('customer_phone', phones);

  return (ltvRecords || []).filter(
    r => r.customer_tier === 'vip' || r.customer_tier === 'regular'
  );
}

module.exports = { getRestaurantSnapshot, getVIPsForToday };
