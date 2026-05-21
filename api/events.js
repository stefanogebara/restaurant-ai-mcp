/**
 * Events / Paid Experiences API
 *
 * Serverless function for event management:
 * - list: GET all events for the restaurant
 * - create: POST a new event
 * - update: POST to update event details
 * - deactivate: POST to deactivate an event
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { verifyAuth } = require('./_lib/auth');
const { checkSubscription, requireFeature } = require('./_lib/subscription-middleware');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors } = require('./_lib/cors');

const logger = createSecureLogger('Events');

function eventsDb() {
  return supabaseAdmin.schema('restaurant');
}

/**
 * List events for the restaurant
 */
async function handleList(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;

    // DD.1 — accept `limit` (capped at 200) + optional `upcoming_only` so
    // a restaurant with years of historical events doesn't pay for a full
    // table scan on every dashboard tab open.
    const requestedLimit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const upcomingOnly = req.query.upcoming_only === 'true';
    const todayISO = new Date().toISOString().split('T')[0];

    let query = eventsDb()
      .from('events')
      .select('id, restaurant_id, title, description, event_date, event_time, duration_minutes, max_capacity, current_bookings, price, refund_policy, cover_image_url, menu_description, is_active, created_at, updated_at')
      .eq('restaurant_id', restaurantId)
      .order('event_date', { ascending: true })
      .limit(requestedLimit);

    if (upcomingOnly) {
      query = query.gte('event_date', todayISO);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: { events: data || [] },
    });
  } catch (error) {
    logger.error('Error listing events:', error);
    return res.status(500).json({ success: false, error: 'Failed to list events' });
  }
}

/**
 * Create a new event
 */
async function handleCreate(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const {
      title,
      description,
      event_date,
      event_time,
      duration_minutes,
      max_capacity,
      price,
      refund_policy,
      cover_image_url,
      menu_description,
    } = req.body || {};

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    if (title.trim().length > 120) {
      return res.status(400).json({ success: false, error: 'title must not exceed 120 characters' });
    }
    if (description && description.length > 1000) {
      return res.status(400).json({ success: false, error: 'description must not exceed 1000 characters' });
    }
    if (!event_date) {
      return res.status(400).json({ success: false, error: 'event_date is required' });
    }
    if (!event_time) {
      return res.status(400).json({ success: false, error: 'event_time is required' });
    }

    const parsedDuration = parseInt(duration_minutes, 10);
    if (!duration_minutes || isNaN(parsedDuration) || parsedDuration < 15 || parsedDuration > 720) {
      return res.status(400).json({ success: false, error: 'duration_minutes must be between 15 and 720' });
    }

    const parsedCapacity = parseInt(max_capacity, 10);
    if (!max_capacity || isNaN(parsedCapacity) || parsedCapacity < 1) {
      return res.status(400).json({ success: false, error: 'max_capacity must be at least 1' });
    }

    const parsedPrice = parseFloat(price);
    if (price === undefined || price === null || isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ success: false, error: 'price must be 0 or greater' });
    }

    // Validate refund_policy if provided
    const validPolicies = ['full', 'partial', 'none'];
    if (refund_policy && !validPolicies.includes(refund_policy)) {
      return res.status(400).json({ success: false, error: 'refund_policy must be: full, partial, or none' });
    }

    const insertData = {
      restaurant_id: restaurantId,
      title: title.trim(),
      description: description ? description.trim() : null,
      event_date,
      event_time,
      duration_minutes: parsedDuration,
      max_capacity: parsedCapacity,
      current_bookings: 0,
      price: parsedPrice,
      refund_policy: refund_policy || 'full',
      cover_image_url: cover_image_url || null,
      menu_description: menu_description ? menu_description.trim() : null,
    };

    const { data, error } = await eventsDb()
      .from('events')
      .insert(insertData)
      .select('id, restaurant_id, title, description, event_date, event_time, duration_minutes, max_capacity, current_bookings, price, refund_policy, cover_image_url, menu_description, is_active, created_at, updated_at')
      .single();

    if (error) throw error;

    logger.info('Event created', { eventId: data.id, title: data.title });

    return res.status(201).json({ success: true, data });
  } catch (error) {
    logger.error('Error creating event:', error);
    return res.status(500).json({ success: false, error: 'Failed to create event' });
  }
}

/**
 * Update an existing event
 */
async function handleUpdate(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const { event_id, ...fields } = req.body || {};

    if (!event_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: event_id' });
    }

    const allowed = ['title', 'description', 'event_date', 'event_time', 'duration_minutes', 'max_capacity', 'price', 'refund_policy', 'cover_image_url', 'menu_description'];
    const updateData = {};

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updateData[key] = fields[key];
      }
    }

    if (updateData.title !== undefined) {
      if (!updateData.title || !updateData.title.trim()) {
        return res.status(400).json({ success: false, error: 'title cannot be empty' });
      }
      updateData.title = updateData.title.trim();
    }
    if (updateData.description !== undefined) {
      updateData.description = updateData.description ? updateData.description.trim() : null;
    }
    if (updateData.duration_minutes !== undefined) {
      const d = parseInt(updateData.duration_minutes, 10);
      if (isNaN(d) || d < 15 || d > 720) {
        return res.status(400).json({ success: false, error: 'duration_minutes must be between 15 and 720' });
      }
      updateData.duration_minutes = d;
    }
    if (updateData.max_capacity !== undefined) {
      const c = parseInt(updateData.max_capacity, 10);
      if (isNaN(c) || c < 1) {
        return res.status(400).json({ success: false, error: 'max_capacity must be at least 1' });
      }
      updateData.max_capacity = c;
    }
    if (updateData.price !== undefined) {
      const p = parseFloat(updateData.price);
      if (isNaN(p) || p < 0) {
        return res.status(400).json({ success: false, error: 'price must be 0 or greater' });
      }
      updateData.price = p;
    }
    if (updateData.refund_policy !== undefined) {
      const validPolicies = ['full', 'partial', 'none'];
      if (!validPolicies.includes(updateData.refund_policy)) {
        return res.status(400).json({ success: false, error: 'refund_policy must be: full, partial, or none' });
      }
    }
    if (updateData.menu_description !== undefined) {
      updateData.menu_description = updateData.menu_description ? updateData.menu_description.trim() : null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await eventsDb()
      .from('events')
      .update(updateData)
      .eq('id', event_id)
      .eq('restaurant_id', restaurantId)
      .select('id, restaurant_id, title, description, event_date, event_time, duration_minutes, max_capacity, current_bookings, price, refund_policy, cover_image_url, menu_description, is_active, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Event not found' });
      }
      throw error;
    }

    logger.info('Event updated', { eventId: event_id });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error updating event:', error);
    return res.status(500).json({ success: false, error: 'Failed to update event' });
  }
}

/**
 * List bookings for a specific event
 */
async function handleBookings(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const { event_id } = req.query;

    if (!event_id) {
      return res.status(400).json({ success: false, error: 'Missing required parameter: event_id' });
    }

    // Verify event belongs to this restaurant
    const { data: event, error: eventError } = await eventsDb()
      .from('events')
      .select('id')
      .eq('id', event_id)
      .eq('restaurant_id', restaurantId)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    const { data: bookings, error } = await eventsDb()
      .from('event_bookings')
      .select('id, event_id, restaurant_id, customer_name, customer_email, customer_phone, guests, total_amount, payment_status, booking_status, stripe_payment_intent_id, refund_amount, created_at, updated_at')
      .eq('event_id', event_id)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Calculate revenue summary
    const paidBookings = (bookings || []).filter(b => b.payment_status === 'paid');
    const totalRevenue = paidBookings.reduce((sum, b) => sum + Number(b.total_amount), 0);
    const totalRefunded = (bookings || []).reduce((sum, b) => sum + Number(b.refund_amount || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        bookings: bookings || [],
        summary: {
          total_bookings: (bookings || []).length,
          paid_bookings: paidBookings.length,
          total_revenue: totalRevenue,
          total_refunded: totalRefunded,
          net_revenue: totalRevenue - totalRefunded,
        },
      },
    });
  } catch (error) {
    logger.error('Error listing event bookings:', error);
    return res.status(500).json({ success: false, error: 'Failed to list bookings' });
  }
}

/**
 * Deactivate an event
 */
async function handleDeactivate(req, res) {
  try {
    const restaurantId = req.user.restaurant_id;
    const { event_id } = req.body || {};

    if (!event_id) {
      return res.status(400).json({ success: false, error: 'Missing required field: event_id' });
    }

    const { data, error } = await eventsDb()
      .from('events')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', event_id)
      .eq('restaurant_id', restaurantId)
      .select('id, restaurant_id, title, description, event_date, event_time, duration_minutes, max_capacity, current_bookings, price, refund_policy, cover_image_url, menu_description, is_active, created_at, updated_at')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ success: false, error: 'Event not found' });
      }
      throw error;
    }

    logger.info('Event deactivated', { eventId: event_id });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    logger.error('Error deactivating event:', error);
    return res.status(500).json({ success: false, error: 'Failed to deactivate event' });
  }
}

/**
 * Main serverless function handler
 */
module.exports = async (req, res) => {
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      error: authResult.error,
      message: 'Authentication required to access events',
    });
  }
  req.user = authResult.user;

  let subscriptionChecked = false;
  await checkSubscription(req, res, () => { subscriptionChecked = true; });
  if (!subscriptionChecked) return;

  let featureAllowed = false;
  requireFeature('advanced_analytics')(req, res, () => { featureAllowed = true; });
  if (!featureAllowed) return;

  const { action } = req.query;

  if (!action) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter: action',
      available_actions: ['list', 'create', 'update', 'deactivate', 'bookings'],
    });
  }

  try {
    switch (action) {
      case 'list':
        return await handleList(req, res);

      case 'create':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for create' });
        return await handleCreate(req, res);

      case 'update':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for update' });
        return await handleUpdate(req, res);

      case 'deactivate':
        if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST required for deactivate' });
        return await handleDeactivate(req, res);

      case 'bookings':
        return await handleBookings(req, res);

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}`,
          available_actions: ['list', 'create', 'update', 'deactivate', 'bookings'],
        });
    }
  } catch (error) {
    logger.error('Events API Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};
