const { createHmac, randomUUID } = require('node:crypto');
const Stripe = require('stripe');
const { supabaseAdmin } = require('./supabase');
const { minChargeAmount, MIN_CHARGE_AMOUNT, resolveDepositCurrency } = require('./currency');
const { createSecureLogger } = require('./secure-logger');

const logger = createSecureLogger('ReservationDeposits');
const PUBLIC_PURPOSE = 'reservation_deposit';
const QUOTE_LIFETIME_MS = 20 * 60_000;
const QUOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let stripe;
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!/^[a-z]{2,8}_(test|live)_/.test(key || '')) throw new Error('Stripe mode is unavailable');
  if (!stripe) stripe = new Stripe(key, { timeout: 7_000, maxNetworkRetries: 1 });
  return stripe;
}

function stripeLiveMode() {
  return /^[a-z]{2,8}_live_/.test(process.env.STRIPE_SECRET_KEY || '');
}

function quoteDeposit(policy, country, partySize) {
  if (policy?.enabled !== true) return null;
  const currency = resolveDepositCurrency(country, policy.currency);
  if (!Object.hasOwn(MIN_CHARGE_AMOUNT, currency)) return null;
  const amount = Number(policy.amount) * (policy.type === 'per_person' ? partySize : 1);
  const minor = Math.round(amount * 100);
  if (!['flat', 'per_person'].includes(policy.type) || !Number.isSafeInteger(minor) ||
      minor < Math.round(minChargeAmount(currency) * 100) || minor > 99_999_999) return null;
  return { amount: minor, currency };
}

function fingerprint(quoteId, booking) {
  return createHmac('sha256', process.env.BOOKING_HMAC_SECRET)
    .update(JSON.stringify([
      quoteId,
      booking.customer_name,
      booking.customer_phone.replace(/\D/g, ''),
      booking.customer_email?.toLowerCase() || '',
    ]))
    .digest('hex');
}

async function getDepositDestination(restaurantId, currency) {
  try {
    const { data, error } = await supabaseAdmin.schema('restaurant').from('stripe_connect_accounts')
      .select('stripe_account_id, status, charges_enabled, default_currency')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (error) throw error;
    if (data?.status !== 'active' || data.charges_enabled !== true) return null;
    if (data.default_currency && data.default_currency.toLowerCase() !== currency) {
      logger.warn('Skipping Connect routing due to currency mismatch', {
        restaurant_id: restaurantId, presentment_currency: currency, connect_default_currency: data.default_currency,
      });
      return null;
    }
    return data.stripe_account_id;
  } catch (error) {
    logger.warn('Connect routing lookup failed, using platform', { restaurant_id: restaurantId, code: error.code });
    return null;
  }
}

function destinationParams(destination) {
  return destination ? { on_behalf_of: destination, transfer_data: { destination } } : {};
}

async function createPublicDeposit(config, booking, deposit, destination) {
  const id = randomUUID();
  const guest = fingerprint(id, booking);
  const expiresAt = new Date(Date.now() + QUOTE_LIFETIME_MS).toISOString();
  const payment = await getStripe().paymentIntents.create({
    amount: deposit.amount,
    currency: deposit.currency,
    capture_method: 'manual',
    automatic_payment_methods: { enabled: true },
    description: `Reservation deposit at ${config.restaurant_name}`,
    ...(booking.customer_email ? { receipt_email: booking.customer_email } : {}),
    metadata: {
      type: PUBLIC_PURPOSE,
      restaurant_id: booking.restaurant_id,
      quote_id: id,
      party_size: String(booking.party_size),
      currency: deposit.currency,
      routed_to: destination ? 'connect' : 'platform',
      ...(destination ? { connect_account_id: destination } : {}),
    },
    ...destinationParams(destination),
  });
  const { error } = await supabaseAdmin.from('public_booking_deposits').insert({
    id,
    restaurant_id: booking.restaurant_id,
    booking_date: booking.date,
    booking_time: booking.time,
    party_size: booking.party_size,
    guest_fingerprint: guest,
    policy: config.deposit_config,
    country: config.country,
    intent_id: payment.id,
    amount_minor: deposit.amount,
    currency: deposit.currency,
    destination,
    expires_at: expiresAt,
    cleanup_after: expiresAt,
  });
  if (error) {
    // The client never receives the secret for an intent we could not store.
    await getStripe().paymentIntents.cancel(payment.id).catch(() => {
      logger.warn('Could not cancel an undisclosed deposit authorization', { payment_intent_id: payment.id });
    });
    throw new Error('Could not store the deposit quote');
  }
  return { id, payment, expiresAt };
}

function stripeId(resource) {
  return typeof resource === 'string' ? resource : resource?.id ?? null;
}

function matchesAuthorization(payment, quote, purpose) {
  return payment.id === quote.intent_id &&
    payment.livemode === stripeLiveMode() &&
    payment.metadata?.type === purpose &&
    payment.metadata.restaurant_id === quote.restaurant_id &&
    payment.metadata.quote_id === quote.id &&
    payment.capture_method === 'manual' &&
    payment.amount === quote.amount_minor &&
    payment.currency === quote.currency &&
    stripeId(payment.on_behalf_of) === quote.destination &&
    stripeId(payment.transfer_data?.destination) === quote.destination;
}

function isCapturable(payment, fullAmount) {
  const captureBefore = payment.latest_charge?.payment_method_details?.card?.capture_before;
  return payment.status === 'requires_capture' && payment.amount_capturable === fullAmount &&
    (!captureBefore || captureBefore * 1000 > Date.now());
}

async function readMatchingQuote(quoteId, booking) {
  if (!QUOTE_ID.test(quoteId)) return null;
  const { data: quote, error } = await supabaseAdmin.from('public_booking_deposits')
    .select('id, restaurant_id, booking_date, booking_time, party_size, guest_fingerprint, state, intent_id, amount_minor, currency, destination')
    .eq('id', quoteId).eq('restaurant_id', booking.restaurant_id).maybeSingle();
  if (error) throw new Error('Could not read deposit quote');
  if (!quote || quote.booking_date !== booking.date || quote.booking_time !== `${booking.time}:00` ||
      quote.party_size !== booking.party_size || quote.guest_fingerprint !== fingerprint(quoteId, booking)) return null;
  return quote;
}

async function verifyPublicDeposit(quoteId, booking) {
  const quote = await readMatchingQuote(quoteId, booking);
  if (!quote) return null;
  const verified = { id: quoteId, guest: quote.guest_fingerprint, authorizedIntent: null };
  // The database resolves an exact replay or resumes release without relying
  // on whether Stripe still reports the original authorization as capturable.
  if (quote.state !== 'open') return verified;

  let payment;
  try {
    payment = await getStripe().paymentIntents.retrieve(quote.intent_id, { expand: ['latest_charge'] });
  } catch (error) {
    if (error.code === 'resource_missing') return null;
    throw error;
  }
  if (!matchesAuthorization(payment, quote, PUBLIC_PURPOSE) || !isCapturable(payment, quote.amount_minor)) return null;
  verified.authorizedIntent = payment.id;
  return verified;
}

async function abandonPublicDeposit(quoteId, booking) {
  const quote = await readMatchingQuote(quoteId, booking);
  if (!quote) return 'invalid';
  const { data, error } = await supabaseAdmin.rpc('abandon_public_booking_deposit', {
    p_id: quote.id, p_restaurant_id: quote.restaurant_id,
  });
  if (error) throw new Error('Could not abandon deposit quote');
  if (data.status !== 'release_pending') return data.status;
  return await releaseRejectedDeposit(quote.id, quote.restaurant_id, quote.intent_id) ? 'released' : 'release_pending';
}

async function releaseRejectedDeposit(quoteId, restaurantId, intentId) {
  // The booking transaction has already changed the quote to release_pending
  // and no subsequent request can attach it to a reservation.
  try {
    const stripe = getStripe();
    const payment = await stripe.paymentIntents.retrieve(intentId);
    if (payment.status !== 'canceled') {
      await stripe.paymentIntents.cancel(intentId, {}, { idempotencyKey: `public-booking-release-${quoteId}` });
    }
    const { error } = await supabaseAdmin.from('public_booking_deposits')
      .update({ state: 'released' }).eq('id', quoteId).eq('restaurant_id', restaurantId)
      .eq('intent_id', intentId).eq('state', 'release_pending');
    if (error) throw new Error('Could not persist deposit release');
    return true;
  } catch (error) {
    logger.warn('Deposit release remains pending', { payment_intent_id: intentId, code: error.code });
    return false;
  }
}

async function readReservationDeposit(reservation, reference = 'deposit_payment_intent_id') {
  const payment = await getStripe().paymentIntents.retrieve(reservation[reference], { expand: ['latest_charge'] });
  const metadata = payment.metadata || {};
  if (payment.livemode !== stripeLiveMode() || payment.capture_method !== 'manual' ||
      metadata.restaurant_id !== reservation.restaurant_id ||
      !Number.isFinite(Number(reservation.deposit_amount)) ||
      payment.amount !== Math.round(Number(reservation.deposit_amount) * 100)) return null;

  if (metadata.type === PUBLIC_PURPOSE && metadata.quote_id) {
    const { data: quote, error } = await supabaseAdmin.from('public_booking_deposits')
      .select('id, restaurant_id, intent_id, amount_minor, currency, destination')
      .eq('id', metadata.quote_id).eq('intent_id', payment.id)
      .eq('restaurant_id', reservation.restaurant_id).eq('reservation_id', reservation.id)
      .eq('state', 'attached').maybeSingle();
    if (error) throw new Error('Could not read the attached deposit');
    return quote && matchesAuthorization(payment, quote, PUBLIC_PURPOSE) ? payment : null;
  }
  if (metadata.type === 'reservation_deposit_post_booking') {
    return (metadata.reservation_id === reservation.reservation_id || metadata.reservation_id === reservation.id)
      ? payment : null;
  }
  if (metadata.type !== PUBLIC_PURPOSE) return null;
  // Older public deposits have no quote ID. Accept the tenant's single stored
  // reference to its legacy intent. Ambiguous historical rows need a review.
  const { data: references, error } = await supabaseAdmin.from('reservations').select('id')
    .eq(reference, payment.id).limit(2);
  if (error) throw new Error('Could not check legacy deposit ownership');
  return references.length === 1 && references[0].id === reservation.id ? payment : null;
}

module.exports = {
  abandonPublicDeposit, createPublicDeposit, getDepositDestination, getStripe, isCapturable,
  matchesAuthorization, quoteDeposit, readReservationDeposit, releaseRejectedDeposit,
  verifyPublicDeposit,
};
