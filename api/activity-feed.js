/**
 * Activity Feed API
 *
 * Returns recent activity events by querying existing tables.
 * GET /api/activity-feed?limit=20
 */

const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('activity-feed');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  try {
    const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) return res.status(401).json({ error: 'Authentication required' });

    const restaurantId = user.restaurant_id;
    const limit = Math.min(parseInt(req.query?.limit) || 20, 50);

    // Query recent events from multiple tables in parallel
    const [reservations, services, waitlist] = await Promise.all([
      fetchRecentReservations(restaurantId, limit),
      fetchRecentServices(restaurantId, limit),
      fetchRecentWaitlist(restaurantId, limit),
    ]);

    // Merge and sort by timestamp descending
    const events = [...reservations, ...services, ...waitlist]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return res.json({ success: true, data: events });
  } catch (err) {
    logger.error('activity-feed error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
};

async function fetchRecentReservations(restaurantId, limit) {
  const { data, error } = await supabaseAdmin
    .from('reservations')
    .select('reservation_id, customer_name, party_size, date, time, status, created_at, updated_at')
    .eq('restaurant_id', restaurantId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn('Failed to fetch reservations for feed', { error: error.message });
    return [];
  }

  return (data || []).flatMap((r) => {
    const events = [];
    const wasUpdated = r.updated_at && r.created_at && r.updated_at !== r.created_at;

    if (r.status === 'cancelled') {
      events.push({
        id: `res-cancel-${r.reservation_id}`,
        type: 'reservation.cancel',
        icon: 'x-circle',
        color: 'red',
        message: `${r.customer_name} — reservation cancelled`,
        detail: `Party of ${r.party_size} · ${r.date} ${r.time}`,
        timestamp: r.updated_at || r.created_at,
      });
    } else if (r.status === 'checked_in') {
      events.push({
        id: `res-checkin-${r.reservation_id}`,
        type: 'reservation.check_in',
        icon: 'check-circle',
        color: 'green',
        message: `${r.customer_name} checked in`,
        detail: `Party of ${r.party_size}`,
        timestamp: r.updated_at || r.created_at,
      });
    } else if (r.status === 'no_show') {
      events.push({
        id: `res-noshow-${r.reservation_id}`,
        type: 'reservation.no_show',
        icon: 'alert-triangle',
        color: 'amber',
        message: `${r.customer_name} — no show`,
        detail: `Party of ${r.party_size} · ${r.date} ${r.time}`,
        timestamp: r.updated_at || r.created_at,
      });
    } else if (wasUpdated && r.status === 'confirmed') {
      events.push({
        id: `res-update-${r.reservation_id}`,
        type: 'reservation.update',
        icon: 'edit',
        color: 'blue',
        message: `${r.customer_name} — reservation updated`,
        detail: `Party of ${r.party_size} · ${r.date} ${r.time}`,
        timestamp: r.updated_at,
      });
    }

    // Always include the creation event
    events.push({
      id: `res-create-${r.reservation_id}`,
      type: 'reservation.create',
      icon: 'calendar',
      color: 'emerald',
      message: `${r.customer_name} booked`,
      detail: `Party of ${r.party_size} · ${r.date} ${r.time}`,
      timestamp: r.created_at,
    });

    return events;
  });
}

async function fetchRecentServices(restaurantId, limit) {
  const { data, error } = await supabaseAdmin
    .from('service_records')
    .select('service_id, customer_name, party_size, status, total_bill, created_at, updated_at')
    .eq('restaurant_id', restaurantId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn('Failed to fetch services for feed', { error: error.message });
    return [];
  }

  return (data || []).flatMap((s) => {
    const events = [];

    if (s.status === 'completed') {
      const billText = s.total_bill ? ` · Bill: ${s.total_bill}` : '';
      events.push({
        id: `svc-complete-${s.service_id}`,
        type: 'service.complete',
        icon: 'check',
        color: 'emerald',
        message: `${s.customer_name || 'Walk-in'} — service completed`,
        detail: `Party of ${s.party_size}${billText}`,
        timestamp: s.updated_at || s.created_at,
      });
    }

    events.push({
      id: `svc-seat-${s.service_id}`,
      type: 'service.seat',
      icon: 'users',
      color: 'blue',
      message: `${s.customer_name || 'Walk-in'} seated`,
      detail: `Party of ${s.party_size}`,
      timestamp: s.created_at,
    });

    return events;
  });
}

async function fetchRecentWaitlist(restaurantId, limit) {
  const { data, error } = await supabaseAdmin
    .from('waitlist')
    .select('id, customer_name, party_size, status, created_at, updated_at')
    .eq('restaurant_id', restaurantId)
    .order('updated_at', { ascending: false })
    .limit(Math.min(limit, 10));

  if (error) {
    logger.warn('Failed to fetch waitlist for feed', { error: error.message });
    return [];
  }

  return (data || []).flatMap((w) => {
    const events = [];

    if (w.status === 'seated') {
      events.push({
        id: `wait-seat-${w.id}`,
        type: 'waitlist.seat',
        icon: 'arrow-right',
        color: 'green',
        message: `${w.customer_name} seated from waitlist`,
        detail: `Party of ${w.party_size}`,
        timestamp: w.updated_at || w.created_at,
      });
    } else if (w.status === 'removed' || w.status === 'cancelled') {
      events.push({
        id: `wait-remove-${w.id}`,
        type: 'waitlist.remove',
        icon: 'x',
        color: 'gray',
        message: `${w.customer_name} removed from waitlist`,
        detail: `Party of ${w.party_size}`,
        timestamp: w.updated_at || w.created_at,
      });
    }

    events.push({
      id: `wait-add-${w.id}`,
      type: 'waitlist.add',
      icon: 'clock',
      color: 'amber',
      message: `${w.customer_name} added to waitlist`,
      detail: `Party of ${w.party_size}`,
      timestamp: w.created_at,
    });

    return events;
  });
}
