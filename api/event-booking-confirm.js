/**
 * Event Booking Confirmation API
 *
 * POST: Called after Stripe payment succeeds.
 * Atomically confirms the booking and increments event capacity.
 * Sends confirmation email via Resend.
 * Public endpoint (no auth) — rate limited.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors } = require('./_lib/cors');

const logger = createSecureLogger('EventBookingConfirm');

function eventsDb() {
  return supabaseAdmin.schema('restaurant');
}

/**
 * Send event booking confirmation email via Resend
 */
async function sendEventBookingEmail(booking, event, restaurantName) {
  try {
    const { Resend } = require('resend');
    if (!process.env.RESEND_API_KEY) {
      logger.warn('RESEND_API_KEY not set, skipping confirmation email');
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const eventDate = new Date(event.event_date + 'T00:00:00');
    const formattedDate = eventDate.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const formattedTime = event.event_time.substring(0, 5);
    const formattedAmount = `R$ ${Number(booking.total_amount).toFixed(2)}`;

    await resend.emails.send({
      from: 'Seatable <bookings@seatable.one>',
      to: booking.customer_email,
      subject: `Reserva Confirmada — ${event.title}`,
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1C1917; margin-bottom: 8px;">Reserva confirmada!</h2>
          <p style="color: #706A65; font-size: 14px;">
            Olá ${booking.customer_name}, sua reserva para o evento está confirmada.
          </p>

          <div style="background: #FAFAF9; border: 1px solid #E5E7EB; border-radius: 12px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 8px; font-weight: 600; color: #1C1917;">${event.title}</p>
            <p style="margin: 0 0 4px; color: #706A65; font-size: 13px;">Restaurante: ${restaurantName}</p>
            <p style="margin: 0 0 4px; color: #706A65; font-size: 13px;">Data: ${formattedDate}</p>
            <p style="margin: 0 0 4px; color: #706A65; font-size: 13px;">Horário: ${formattedTime}</p>
            <p style="margin: 0 0 4px; color: #706A65; font-size: 13px;">Convidados: ${booking.party_size}</p>
            <p style="margin: 0 0 4px; color: #706A65; font-size: 13px;">Total pago: ${formattedAmount}</p>
            ${booking.special_requests ? `<p style="margin: 8px 0 0; color: #706A65; font-size: 13px;">Observações: ${booking.special_requests}</p>` : ''}
          </div>

          <p style="color: #706A65; font-size: 12px; margin-top: 24px;">
            ID da reserva: ${booking.id.substring(0, 8).toUpperCase()}
          </p>
        </div>
      `,
    });

    logger.info('Event booking confirmation email sent', { bookingId: booking.id });
  } catch (error) {
    logger.error('Failed to send event booking email (non-fatal):', error.message);
  }
}

module.exports = async (req, res) => {
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  const { booking_id, payment_intent_id } = req.body || {};

  if (!booking_id) {
    return res.status(400).json({ success: false, error: 'Missing booking_id' });
  }
  if (!payment_intent_id) {
    return res.status(400).json({ success: false, error: 'Missing payment_intent_id' });
  }

  try {
    // --- Fetch booking ---
    const { data: booking, error: bookingError } = await eventsDb()
      .from('event_bookings')
      .select('*')
      .eq('id', booking_id)
      .eq('stripe_payment_intent_id', payment_intent_id)
      .single();

    if (bookingError || !booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    if (booking.payment_status === 'paid') {
      // Already confirmed (idempotent)
      return res.status(200).json({ success: true, data: booking, message: 'Already confirmed' });
    }

    if (booking.payment_status !== 'pending') {
      return res.status(400).json({ success: false, error: `Cannot confirm booking with status: ${booking.payment_status}` });
    }

    // --- Atomically confirm booking + increment capacity ---
    const { data: confirmed } = await supabaseAdmin.rpc('confirm_event_booking', {
      p_booking_id: booking.id,
      p_party_size: booking.party_size,
    });

    if (!confirmed) {
      // Mark booking as failed (capacity exceeded after payment)
      await eventsDb()
        .from('event_bookings')
        .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', booking.id);

      return res.status(409).json({
        success: false,
        error: 'Event is now full. Your payment will be refunded.',
      });
    }

    // --- Fetch event + restaurant for email ---
    const [eventResult, restaurantResult] = await Promise.all([
      eventsDb()
        .from('events')
        .select('title, event_date, event_time')
        .eq('id', booking.event_id)
        .single(),
      eventsDb()
        .from('restaurant_config')
        .select('restaurant_name')
        .eq('id', booking.restaurant_id)
        .single(),
    ]);

    const updatedBooking = {
      ...booking,
      payment_status: 'paid',
    };

    // Fire-and-forget email
    sendEventBookingEmail(
      updatedBooking,
      eventResult.data || { title: 'Event', event_date: '', event_time: '' },
      restaurantResult.data?.restaurant_name || 'Restaurant',
    );

    logger.info('Event booking confirmed', { bookingId: booking.id, eventId: booking.event_id });

    return res.status(200).json({ success: true, data: updatedBooking });
  } catch (error) {
    logger.error('Event booking confirm error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to confirm booking' });
  }
};
