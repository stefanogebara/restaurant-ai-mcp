/**
 * Event Checkout API
 *
 * POST: Creates a Stripe PaymentIntent for a ticketed event booking.
 * Public endpoint (no auth) — rate limited.
 *
 * Validates: event active, not past, capacity available.
 * Creates event_bookings row with payment_status:'pending'.
 * Returns client_secret for Stripe Elements.
 */

const Stripe = require('stripe');
const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors } = require('./_lib/cors');

const logger = createSecureLogger('EventCheckout');

let stripe;
function getStripe() {
  if (!stripe) stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

function eventsDb() {
  return supabaseAdmin.schema('restaurant');
}

/**
 * Validate email format (basic check)
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async (req, res) => {
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const {
    event_id,
    customer_name,
    customer_phone,
    customer_email,
    party_size,
    special_requests,
  } = req.body || {};

  // --- Input validation ---
  if (!event_id) {
    return res.status(400).json({ success: false, error: 'Missing event_id' });
  }
  if (!customer_name || !customer_name.trim()) {
    return res.status(400).json({ success: false, error: 'Missing customer_name' });
  }
  if (customer_name.trim().length > 200) {
    return res.status(400).json({ success: false, error: 'customer_name too long' });
  }
  if (!customer_email || !isValidEmail(customer_email)) {
    return res.status(400).json({ success: false, error: 'Invalid customer_email' });
  }

  const parsedPartySize = parseInt(party_size, 10);
  if (isNaN(parsedPartySize) || parsedPartySize < 1) {
    return res.status(400).json({ success: false, error: 'party_size must be at least 1' });
  }
  if (parsedPartySize > 50) {
    return res.status(400).json({ success: false, error: 'party_size cannot exceed 50' });
  }

  try {
    // --- Fetch event ---
    const { data: event, error: eventError } = await eventsDb()
      .from('events')
      .select('id, restaurant_id, title, event_date, event_time, max_capacity, current_bookings, price, is_active')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // --- Validate event state ---
    if (!event.is_active) {
      return res.status(400).json({ success: false, error: 'Event is not active' });
    }

    const eventDateTime = new Date(`${event.event_date}T${event.event_time}`);
    if (eventDateTime < new Date()) {
      return res.status(400).json({ success: false, error: 'Event has already passed' });
    }

    const spotsLeft = event.max_capacity - event.current_bookings;
    if (parsedPartySize > spotsLeft) {
      return res.status(400).json({
        success: false,
        error: `Not enough spots. ${spotsLeft} remaining.`,
      });
    }

    // --- Calculate total ---
    const totalAmount = event.price * parsedPartySize;
    const amountInCents = Math.round(totalAmount * 100);

    if (amountInCents < 50) {
      return res.status(400).json({ success: false, error: 'Total amount too small (minimum R$ 0.50)' });
    }

    // --- Fetch restaurant name ---
    const { data: restaurant } = await eventsDb()
      .from('restaurant_config')
      .select('restaurant_name')
      .eq('id', event.restaurant_id)
      .single();

    const restaurantName = restaurant?.restaurant_name || 'Restaurant';

    // --- Create Stripe PaymentIntent ---
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountInCents,
      currency: 'brl',
      capture_method: 'automatic',
      automatic_payment_methods: { enabled: true },
      description: `${event.title} at ${restaurantName} - ${parsedPartySize} guest(s)`,
      receipt_email: customer_email,
      metadata: {
        restaurant_id: event.restaurant_id,
        event_id: event.id,
        party_size: String(parsedPartySize),
        type: 'event_booking',
        customer_name: customer_name.trim(),
      },
    });

    // --- Create event_bookings row ---
    const { data: booking, error: bookingError } = await eventsDb()
      .from('event_bookings')
      .insert({
        restaurant_id: event.restaurant_id,
        event_id: event.id,
        customer_name: customer_name.trim(),
        customer_phone: customer_phone ? customer_phone.trim() : null,
        customer_email: customer_email.trim().toLowerCase(),
        party_size: parsedPartySize,
        total_amount: totalAmount,
        stripe_payment_intent_id: paymentIntent.id,
        payment_status: 'pending',
        booking_status: 'confirmed',
        special_requests: special_requests ? special_requests.trim().substring(0, 500) : null,
      })
      .select('id')
      .single();

    if (bookingError) {
      logger.error('Failed to create event booking row:', bookingError);
      // Cancel the payment intent since we could not persist the booking
      await getStripe().paymentIntents.cancel(paymentIntent.id).catch(() => {});
      return res.status(500).json({ success: false, error: 'Failed to create booking' });
    }

    logger.info('Event checkout created', {
      bookingId: booking.id,
      eventId: event.id,
      partySize: parsedPartySize,
      totalAmount,
    });

    return res.status(200).json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      booking_id: booking.id,
      total_amount: totalAmount,
    });
  } catch (error) {
    logger.error('Event checkout error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to create event checkout' });
  }
};
