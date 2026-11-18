const { randomUUID } = require('node:crypto');
const { minChargeAmount, MIN_CHARGE_AMOUNT, resolveDepositCurrency } = require('./currency');

const PURPOSE = 'reservation_deposit_post_booking';
const CHECKOUT_EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded']);
const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STRIPE_READ = { timeout: 10000, maxNetworkRetries: 0 };

function stripeMode(key) {
  const match = /^[a-z]{2,8}_(test|live)_/.exec(key || '');
  if (!match) throw new Error('Hosted deposit Stripe mode is unavailable');
  return match[1] === 'live';
}

function objectId(value) {
  return (typeof value === 'string' ? value : value?.id) || null;
}

async function read(result, label) {
  const { data, error } = await result;
  if (error) throw new Error(label, { cause: error });
  return data;
}

function connectDestination(account, currency) {
  if (account?.status !== 'active' || !account.charges_enabled) return null;
  if (!/^acct_[A-Za-z0-9]+$/.test(account.stripe_account_id)) {
    throw new Error('Hosted deposit Connect account is invalid');
  }
  const settlementCurrency = account.default_currency?.toLowerCase();
  return !settlementCurrency || settlementCurrency === currency ? account.stripe_account_id : null;
}

function metadataFor(attempt) {
  return {
    type: PURPOSE,
    hosted_deposit_id: attempt.id,
    restaurant_id: attempt.restaurant_id,
    reservation_id: attempt.reservation_code,
    party_size: String(attempt.party_size),
    date: attempt.booking_date,
    time: attempt.booking_time,
    currency: attempt.currency,
  };
}

function startAttempt({ restaurantId, reservation, config, baseUrl, destination, livemode, amountMinor, currency }) {
  const attempt = {
    id: randomUUID(),
    restaurant_id: restaurantId,
    booking_id: reservation.id,
    reservation_code: reservation.reservation_id,
    booking_date: reservation.date,
    booking_time: reservation.time,
    party_size: reservation.party_size,
    amount_minor: amountMinor,
    currency,
    destination,
    livemode,
    expires_at: Math.floor(Date.now() / 1000) + 2 * 60 * 60,
  };
  const metadata = metadataFor(attempt);
  attempt.checkout_params = {
    mode: 'payment',
    // Preserve card-only checkout so there is a card authorization expiry to verify.
    payment_method_types: ['card'],
    adaptive_pricing: { enabled: false },
    client_reference_id: attempt.id,
    expires_at: attempt.expires_at,
    line_items: [{
      quantity: 1,
      price_data: {
        currency,
        unit_amount: amountMinor,
        product_data: {
          name: `Deposit — ${config.restaurant_name}`,
          description: `${reservation.party_size} guest${reservation.party_size === 1 ? '' : 's'} on ${reservation.date} at ${reservation.time.slice(0, 5)}`,
        },
      },
    }],
    payment_intent_data: {
      capture_method: 'manual',
      description: `Reservation deposit at ${config.restaurant_name}`,
      metadata,
      ...(destination && { on_behalf_of: destination, transfer_data: { destination } }),
    },
    success_url: `${baseUrl}/book/${config.slug}/confirmed?id=${reservation.id}&deposit=ok`,
    cancel_url: `${baseUrl}/book/${config.slug}?deposit=cancelled`,
    ...(reservation.customer_email && { customer_email: reservation.customer_email }),
    metadata,
  };

  return attempt;
}

async function beginAttempt(db, attempt) {
  return read(db.rpc('begin_hosted_reservation_deposit', {
    p_id: attempt.id,
    p_restaurant_id: attempt.restaurant_id,
    p_booking_id: attempt.booking_id,
    p_reservation_code: attempt.reservation_code,
    p_date: attempt.booking_date,
    p_time: attempt.booking_time,
    p_party_size: attempt.party_size,
    p_amount_minor: attempt.amount_minor,
    p_currency: attempt.currency,
    p_destination: attempt.destination,
    p_livemode: attempt.livemode,
    p_expires_at: attempt.expires_at,
    p_checkout_params: attempt.checkout_params,
  }), 'Could not start hosted deposit');
}

function quoteDeposit(config, partySize) {
  const deposit = config.deposit_config;
  if (deposit?.enabled !== true) {
    return { error: 'Deposits are not enabled for this restaurant. Enable them in Settings first.' };
  }
  const currency = resolveDepositCurrency(config.country, deposit.currency);
  const amount = Number(deposit.amount) * (deposit.type === 'per_person' ? partySize : 1);
  const amountMinor = Math.round(amount * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > 99999999) {
    return { error: 'Invalid deposit amount in config' };
  }
  if (!Object.hasOwn(MIN_CHARGE_AMOUNT, currency)) return { error: 'Invalid deposit currency in config' };
  const minimum = minChargeAmount(currency);
  if (amountMinor < minimum * 100) {
    return { error: `Deposit amount too small (minimum ${currency.toUpperCase()} ${minimum.toFixed(2)})` };
  }
  return { amountMinor, currency };
}

function sameMetadata(metadata, attempt) {
  return Object.entries(metadataFor(attempt)).every(([name, value]) => metadata?.[name] === value);
}

function verifySession(session, id, attempt) {
  if (session.id !== id || !/^cs_/.test(id) || session.mode !== 'payment' || session.livemode !== attempt.livemode ||
      session.client_reference_id !== attempt.id || !sameMetadata(session.metadata, attempt) ||
      session.amount_total !== attempt.amount_minor || session.currency !== attempt.currency ||
      session.expires_at !== attempt.expires_at ||
      (attempt.checkout_session_id && attempt.checkout_session_id !== id)) {
    throw new Error('Hosted deposit Checkout binding mismatch');
  }
}

function verifyIntent(intent, id, attempt) {
  if (intent.id !== id || !/^pi_/.test(id) || intent.livemode !== attempt.livemode ||
      !sameMetadata(intent.metadata, attempt) || intent.capture_method !== 'manual' ||
      intent.amount !== attempt.amount_minor || intent.currency !== attempt.currency ||
      objectId(intent.on_behalf_of) !== attempt.destination ||
      objectId(intent.transfer_data?.destination) !== attempt.destination) {
    throw new Error('Hosted deposit authorization binding mismatch');
  }
}

async function settle(db, attempt, session, intent, observation, charge) {
  const result = await read(db.rpc('settle_hosted_reservation_deposit', {
    p_id: attempt.id,
    p_session_id: session.id,
    p_intent_id: intent?.id ?? null,
    p_authorized_at: charge?.created ?? null,
    p_capture_before: charge?.payment_method_details?.card?.capture_before ?? null,
    p_observation: observation,
  }), 'Could not settle hosted deposit');
  if (!['open', 'attached', 'unavailable', 'release_pending', 'released'].includes(result)) {
    throw new Error(`Hosted deposit database binding failed: ${result}`);
  }
  return result;
}

async function reconcileCompleted(db, stripe, session, attempt) {
  const intentId = objectId(session.payment_intent);
  if (session.status !== 'complete' || !intentId) {
    throw new Error('Hosted deposit Checkout is not complete yet');
  }
  const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ['latest_charge'] }, STRIPE_READ);
  verifyIntent(intent, intentId, attempt);

  // An attached attempt is terminal even if an operator subsequently captures
  // or releases the hold. Its signed webhook can never attach it a second time.
  if (['attached', 'released'].includes(attempt.state)) {
    if (attempt.payment_intent_id !== intentId || attempt.checkout_session_id !== session.id) {
      throw new Error('Hosted deposit terminal binding mismatch');
    }
    return attempt.state;
  }
  if (intent.status === 'canceled') return settle(db, attempt, session, intent, 'canceled');

  const charge = intent.latest_charge;
  // Stripe can report Checkout as unpaid after a successful manual card
  // authorization. The uncaptured PaymentIntent is the authority for the hold.
  if (intent.status !== 'requires_capture' ||
      intent.amount_capturable !== attempt.amount_minor || intent.amount_received !== 0 ||
      objectId(charge?.payment_intent) !== intentId || charge.captured !== false ||
      charge.payment_method_details?.type !== 'card' || !Number.isSafeInteger(charge.created) ||
      !Number.isSafeInteger(charge.payment_method_details.card?.capture_before)) {
    throw new Error('Hosted deposit has no verified card authorization to settle');
  }

  const result = await settle(db, attempt, session, intent, 'hold', charge);
  if (result !== 'release_pending') return result;

  // The DB transition commits before cancellation so a replay can finish a
  // release after a lost response, and no competing handler can attach it.
  let canceled;
  try {
    canceled = await stripe.paymentIntents.cancel(intentId, { cancellation_reason: 'abandoned' }, {
      ...STRIPE_READ,
      idempotencyKey: `hosted-deposit-release-${attempt.id}`,
    });
  } catch (error) {
    if (error.code !== 'payment_intent_unexpected_state') throw error;
    canceled = await stripe.paymentIntents.retrieve(intentId, {}, STRIPE_READ);
  }
  verifyIntent(canceled, intentId, attempt);
  if (canceled.status !== 'canceled') throw new Error('Hosted deposit release was not confirmed');
  return settle(db, attempt, session, canceled, 'canceled');
}

async function createSession(stripe, attempt) {
  for (let retry = 0; ; retry += 1) {
    try {
      return await stripe.checkout.sessions.create(attempt.checkout_params, {
        ...STRIPE_READ,
        idempotencyKey: `hosted-deposit-${attempt.id}`,
      });
    } catch (error) {
      if (error.code !== 'idempotency_key_in_use' || retry === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 200 * (retry + 1)));
    }
  }
}

async function openCheckout(db, stripe, attempt) {
  const id = attempt.checkout_session_id ?? (await createSession(stripe, attempt)).id;
  // The result of an idempotent create can be an old snapshot after a guest
  // completes Checkout. Always check the current status before sharing a URL.
  const session = await stripe.checkout.sessions.retrieve(id, {}, STRIPE_READ);
  verifySession(session, id, attempt);
  if (session.status === 'complete') {
    return { result: await reconcileCompleted(db, stripe, session, attempt) };
  }
  if (session.status === 'expired') {
    return { result: await settle(db, attempt, session, null, 'expired') };
  }
  if (session.status !== 'open' || !session.url) return { result: 'unavailable' };

  return { result: await settle(db, attempt, session, null, 'open'), url: session.url };
}

function isHostedDepositEvent(event) {
  const object = event.data?.object;
  // Old open links have no quote identifier. They must never be auto-adopted.
  return CHECKOUT_EVENTS.has(event.type) && object?.mode === 'payment' &&
    object.metadata?.type === PURPOSE && Boolean(object.metadata?.hosted_deposit_id);
}

async function handleHostedDepositEvent({ db, stripe, event, livemode }) {
  const object = event.data.object;
  const id = object.metadata.hosted_deposit_id;
  if (!ATTEMPT_ID.test(id) || event.account || event.livemode !== livemode || object.livemode !== livemode) return 'ignored';

  const attempt = await read(db.from('hosted_reservation_deposits').select('*').eq('id', id).maybeSingle(),
    'Could not read hosted deposit');
  if (!attempt) return 'ignored';
  if (!sameMetadata(object.metadata, attempt) || attempt.livemode !== livemode) return 'ignored';

  const session = await stripe.checkout.sessions.retrieve(object.id, {}, STRIPE_READ);
  verifySession(session, object.id, attempt);
  const result = await reconcileCompleted(db, stripe, session, attempt);
  if (!['attached', 'released'].includes(result)) throw new Error(`Hosted deposit webhook still pending: ${result}`);
  return result;
}

module.exports = {
  stripeMode, read, quoteDeposit, connectDestination, startAttempt, beginAttempt, openCheckout,
  handleHostedDepositEvent, isHostedDepositEvent,
};
