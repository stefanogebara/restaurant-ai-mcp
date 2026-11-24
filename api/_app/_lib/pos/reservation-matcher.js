/**
 * Reservation ↔ POS transaction matcher.
 *
 * When a Square payment event arrives we know:
 *   - which restaurant it belongs to (looked up from merchant_id)
 *   - when it was paid (event.created_at)
 *   - the total amount
 *   - sometimes the customer phone (Square stores phones for some
 *     payment types, but it's optional)
 *
 * What we want: the reservation_id this payment relates to, so the
 * service record + revenue row carry the link back to the booking.
 *
 * Strategy (cheap → expensive):
 *
 *   1. Exact phone match in a ±2h window
 *      Highest signal — if Square has a phone and we have a confirmed
 *      booking for that phone today, use it.
 *
 *   2. Same restaurant, status='seated', payment time within service window
 *      (seated_at ≤ payment ≤ actual_departure + 30min)
 *      Strong but ambiguous if the restaurant is busy. Returns the row
 *      whose seated_at is closest to the payment time.
 *
 *   3. Same restaurant, status='confirmed' with a date matching the
 *      payment day and a time within ±90min of the payment time.
 *      Last-resort heuristic for restaurants that don't move bookings to
 *      'seated' (e.g. they only mark 'completed').
 *
 *   4. No match → return null. Caller still writes the revenue row but
 *      with reservation_id=null. Manager can reconcile later.
 *
 * Returns a `reservation_id` (the human-formatted RES-* code) or null.
 */

const { supabaseAdmin } = require('../supabase');
const { createSecureLogger } = require('../secure-logger');

const logger = createSecureLogger('pos-reservation-matcher');

const PHONE_WINDOW_HOURS = 2;
const SERVICE_TAIL_MIN = 30;       // extra minutes after actual_departure
const SCHEDULED_WINDOW_MIN = 90;   // ±90min around the booking time

/**
 * @param {object} params
 * @param {string} params.restaurantId
 * @param {string?} params.customerPhone  E.164, may be null
 * @param {Date|string} params.paymentTime
 * @returns {Promise<{reservation_id: string|null, strategy: string}>}
 */
async function matchPaymentToReservation({ restaurantId, customerPhone, paymentTime }) {
  const t = paymentTime instanceof Date ? paymentTime : new Date(paymentTime);
  if (!restaurantId || isNaN(t.getTime())) {
    return { reservation_id: null, strategy: 'no-input' };
  }

  // --- Strategy 1: phone exact + ±2h ---------------------------------------
  if (customerPhone) {
    const phoneFloor = new Date(t.getTime() - PHONE_WINDOW_HOURS * 3600_000).toISOString();
    const phoneCeil  = new Date(t.getTime() + PHONE_WINDOW_HOURS * 3600_000).toISOString();
    const { data: byPhone } = await supabaseAdmin
      .from('reservations')
      .select('reservation_id, created_at')
      .eq('restaurant_id', restaurantId)
      .eq('customer_phone', customerPhone)
      .in('status', ['confirmed', 'seated', 'completed'])
      .gte('created_at', phoneFloor)
      .lte('created_at', phoneCeil)
      .order('created_at', { ascending: false })
      .limit(1);
    if (byPhone && byPhone.length > 0) {
      logger.info('matcher: phone match', { restaurantId, customerPhone, paymentTime: t.toISOString() });
      return { reservation_id: byPhone[0].reservation_id, strategy: 'phone' };
    }
  }

  // --- Strategy 2: active service window -----------------------------------
  // Look up service_records joined with reservations. A row is in scope if
  // seated_at ≤ payment_time ≤ (actual_departure || seated_at + 4h) + 30min.
  // Implemented as two queries (Supabase JS doesn't expose pure JOINs cheaply).
  const today = new Date(t);
  today.setUTCHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const yesterday = new Date(today.getTime() - 86_400_000).toISOString().split('T')[0];

  const { data: active } = await supabaseAdmin
    .from('service_records')
    .select('reservation_id, seated_at, actual_departure, restaurant_id')
    .eq('restaurant_id', restaurantId)
    .in('status', ['seated', 'completed'])
    .gte('seated_at', new Date(t.getTime() - 6 * 3600_000).toISOString())
    .lte('seated_at', new Date(t.getTime() + 1 * 3600_000).toISOString())
    .order('seated_at', { ascending: false })
    .limit(20);
  if (active && active.length > 0) {
    let best = null;
    let bestDelta = Infinity;
    for (const row of active) {
      const seated = new Date(row.seated_at).getTime();
      const ended = row.actual_departure
        ? new Date(row.actual_departure).getTime() + SERVICE_TAIL_MIN * 60_000
        : seated + 4 * 3600_000;
      if (t.getTime() >= seated && t.getTime() <= ended) {
        const delta = Math.abs(t.getTime() - seated);
        if (delta < bestDelta) { best = row; bestDelta = delta; }
      }
    }
    if (best?.reservation_id) {
      logger.info('matcher: service-window match', { restaurantId, reservationId: best.reservation_id });
      return { reservation_id: best.reservation_id, strategy: 'service-window' };
    }
  }

  // --- Strategy 3: scheduled booking ±90 min ------------------------------
  // Look at confirmed/seated reservations for today (or yesterday, to handle
  // late-night UTC crossings) and pick the one whose stored (date, time)
  // sits closest to the payment time.
  const { data: scheduled } = await supabaseAdmin
    .from('reservations')
    .select('reservation_id, date, time, status')
    .eq('restaurant_id', restaurantId)
    .in('date', [todayStr, yesterday])
    .in('status', ['confirmed', 'seated', 'completed'])
    .limit(50);
  if (scheduled && scheduled.length > 0) {
    let best = null;
    let bestDelta = Infinity;
    for (const r of scheduled) {
      // Build the reservation's local timestamp ("YYYY-MM-DDTHH:MM:00Z" — UTC
      // approximation; tenant-tz nuance is acceptable here, the goal is a
      // closest-match score, not an exact instant).
      const reservationInstant = new Date(`${r.date}T${(r.time || '00:00').slice(0, 5)}:00Z`).getTime();
      const delta = Math.abs(t.getTime() - reservationInstant);
      if (delta <= SCHEDULED_WINDOW_MIN * 60_000 && delta < bestDelta) {
        best = r;
        bestDelta = delta;
      }
    }
    if (best?.reservation_id) {
      logger.info('matcher: scheduled match', { restaurantId, reservationId: best.reservation_id });
      return { reservation_id: best.reservation_id, strategy: 'scheduled' };
    }
  }

  logger.info('matcher: no match', { restaurantId, customerPhone, paymentTime: t.toISOString() });
  return { reservation_id: null, strategy: 'no-match' };
}

module.exports = { matchPaymentToReservation };
