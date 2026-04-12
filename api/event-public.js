/**
 * Public Event Details API
 *
 * GET: Fetches a single event + restaurant info for the public booking page.
 * Public endpoint (no auth) — rate limited.
 *
 * Query params: slug (restaurant booking_slug) + event_id
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors } = require('./_lib/cors');

const logger = createSecureLogger('EventPublic');

function eventsDb() {
  return supabaseAdmin.schema('restaurant');
}

module.exports = async (req, res) => {
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const { slug, event_id } = req.query;

  if (!slug) {
    return res.status(400).json({ success: false, error: 'Missing slug' });
  }
  if (!event_id) {
    return res.status(400).json({ success: false, error: 'Missing event_id' });
  }

  try {
    // Fetch restaurant by slug
    const { data: restaurant, error: restError } = await eventsDb()
      .from('restaurant_config')
      .select('id, restaurant_name, booking_slug')
      .eq('booking_slug', slug)
      .single();

    if (restError || !restaurant) {
      return res.status(404).json({ success: false, error: 'Restaurant not found' });
    }

    // Fetch event (scoped to restaurant)
    const { data: event, error: eventError } = await eventsDb()
      .from('events')
      .select('id, restaurant_id, title, description, event_date, event_time, duration_minutes, max_capacity, current_bookings, price, is_active, refund_policy, cover_image_url, menu_description')
      .eq('id', event_id)
      .eq('restaurant_id', restaurant.id)
      .eq('is_active', true)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        event,
        restaurant: {
          restaurant_name: restaurant.restaurant_name,
          booking_slug: restaurant.booking_slug,
        },
      },
    });
  } catch (error) {
    logger.error('Event public fetch error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch event' });
  }
};
