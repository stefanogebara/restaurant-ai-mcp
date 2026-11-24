const { supabaseAdmin } = require('./_lib/supabase');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { sanitizeStringXSS } = require('./_lib/validation');
const { checkGuestSlots } = require('./_lib/guest-slots');
const { verifyBookingToken } = require('./_lib/booking-token');
const { abandonPublicDeposit, createPublicDeposit, getDepositDestination, quoteDeposit } = require('./_lib/reservation-deposits');
const { normalizeReservationCreateInput } = require('../../shared/reservation-contract.cjs');

const logger = createSecureLogger('DepositIntent');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const booking = normalizeReservationCreateInput(req.body || {}, { requireRestaurantId: true });
  const { restaurant_id: restaurantId, party_size: partySize, date, time } = booking;
  const abandon = req.body?.action === 'abandon';
  if (!restaurantId) return res.status(400).json({ success: false, error: 'Missing restaurant_id' });
  if (!abandon && !verifyBookingToken(restaurantId, req.body?.booking_token)) {
    return res.status(403).json({ success: false, error: 'Invalid or expired booking token' });
  }

  booking.customer_name = sanitizeStringXSS(booking.customer_name || '', { maxLength: 200 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '') ||
      !partySize || partySize < 1 || partySize > 20 ||
      !booking.customer_name || (booking.customer_phone?.replace(/\D/g, '').length || 0) < 10 ||
      booking.customer_phone.length > 40 || (booking.customer_email?.length || 0) > 320) {
    return res.status(400).json({ success: false, error: 'Invalid booking details' });
  }

  try {
    if (abandon) {
      const quoteId = req.body?.deposit_quote_id;
      const result = typeof quoteId === 'string' ? await abandonPublicDeposit(quoteId, booking) : 'invalid';
      const status = { released: 200, release_pending: 202, attached: 409 }[result] || 404;
      return res.status(status).json({ success: status < 400, state: result });
    }
    const { data: config, error } = await supabaseAdmin.schema('restaurant').from('restaurant_config')
      .select('deposit_config, restaurant_name, country')
      .eq('id', restaurantId).eq('is_active', true).eq('onboarding_completed', true).maybeSingle();
    if (error) throw new Error('Could not read deposit policy');
    if (!config) return res.status(404).json({ success: false, error: 'Restaurant not found' });
    if (config.deposit_config?.enabled !== true) {
      return res.status(409).json({ success: false, code: 'deposit_not_required', error: 'This restaurant no longer requires a deposit.' });
    }

    const deposit = quoteDeposit(config.deposit_config, config.country, partySize);
    if (!deposit) {
      return res.status(409).json({ success: false, error: 'A deposit quote is unavailable. Please contact the restaurant.' });
    }
    const availability = await checkGuestSlots(restaurantId, partySize, [`${date}T${time}`]);
    if (!availability.ok) throw new Error('Could not verify availability for deposit quote');
    if (availability.slots[0].status !== 'ok') {
      return res.status(409).json({ success: false, error: 'That time is no longer available. Choose another time.' });
    }

    const destination = await getDepositDestination(restaurantId, deposit.currency);
    const { id, payment, expiresAt } = await createPublicDeposit(config, booking, deposit, destination);

    // The response should survive analytics failure, but wait for the request
    // so it can finish before the serverless function returns.
    await supabaseAdmin.from('stripe_deposit_routing_events').insert({
      restaurant_id: restaurantId,
      payment_intent_id: payment.id,
      routed_to: destination ? 'connect' : 'platform',
      connect_account_id: destination,
      amount_cents: deposit.amount,
      currency: deposit.currency,
      party_size: partySize,
    }).then(({ error: analyticsError }) => {
      if (analyticsError && analyticsError.code !== '23505') {
        logger.warn('Deposit routing analytics insert failed', { code: analyticsError.code });
      }
    }).catch(() => logger.warn('Deposit routing analytics insert failed'));

    return res.status(200).json({
      success: true,
      quote_id: id,
      payment_intent_id: payment.id,
      client_secret: payment.client_secret,
      deposit_amount: deposit.amount / 100,
      currency: deposit.currency,
      expires_at: expiresAt,
    });
  } catch (error) {
    logger.error('Create deposit intent failed', { code: error.code, error: error.message });
    return res.status(503).json({ success: false, error: 'Could not prepare the deposit. Please try again.' });
  }
};
