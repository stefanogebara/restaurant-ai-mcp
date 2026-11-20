const {
  stripeMode, quoteDeposit, connectDestination, startAttempt, beginAttempt, openCheckout,
  handleHostedDepositEvent, isHostedDepositEvent,
} = require('../_lib/hosted-reservation-deposit');

const restaurant = 'e5a8a59d-2fa5-44e7-91f2-fc288710709c';
const booking = {
  id: '705e6d21-0d85-4570-94a6-9ace8d5acfe7',
  reservation_id: 'RES-hosted-test', date: '2026-12-24', time: '19:15:00', party_size: 3,
  customer_email: 'guest@example.test',
};
const config = {
  country: 'BR', restaurant_name: 'Casa Teste', slug: 'casa-teste',
  deposit_config: { enabled: true, type: 'per_person', amount: 12.80 },
};
const connect = {
  stripe_account_id: 'acct_connected',
  status: 'active',
  charges_enabled: true,
  default_currency: 'BRL',
};

function fixture(destination = null) {
  const attempt = startAttempt({
    restaurantId: restaurant, reservation: booking, config, baseUrl: 'https://example.test',
    livemode: false, destination, ...quoteDeposit(config, booking.party_size),
  });
  const session = {
    id: 'cs_test_hosted', mode: 'payment', status: 'complete', payment_status: 'unpaid', livemode: false,
    payment_intent: 'pi_hosted', expires_at: attempt.expires_at, metadata: attempt.checkout_params.metadata,
    client_reference_id: attempt.id, amount_total: 3840, currency: 'brl',
  };
  const intent = {
    id: 'pi_hosted', status: 'requires_capture', livemode: false, capture_method: 'manual',
    amount: 3840, amount_capturable: 3840, amount_received: 0, currency: 'brl',
    metadata: attempt.checkout_params.payment_intent_data.metadata,
    on_behalf_of: destination, transfer_data: destination ? { destination } : null,
    latest_charge: {
      payment_intent: 'pi_hosted', captured: false, created: attempt.expires_at - 10,
      payment_method_details: { type: 'card', card: { capture_before: attempt.expires_at + 600 } },
    },
  };
  const event = { type: 'checkout.session.completed', livemode: false, data: { object: { ...session } } };
  const lookup = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: attempt }) };
  const db = { from: jest.fn(() => lookup), rpc: jest.fn().mockResolvedValue({ data: 'attached' }) };
  const stripe = {
    checkout: { sessions: { create: jest.fn().mockResolvedValue(session), retrieve: jest.fn().mockResolvedValue(session) } },
    paymentIntents: {
      retrieve: jest.fn().mockResolvedValue(intent),
      cancel: jest.fn().mockResolvedValue({ ...intent, status: 'canceled', amount_capturable: 0 }),
    },
  };
  return { attempt, session, intent, event, lookup, db, stripe, livemode: false };
}

test('quotes integer minor units, preserves BRL, and fails closed on disabled or invalid policies', () => {
  expect(quoteDeposit(config, 3)).toEqual({ amountMinor: 3840, currency: 'brl' });
  expect(quoteDeposit({ ...config, deposit_config: { enabled: true, type: 'flat', amount: 12.8 } }, 3))
    .toEqual({ amountMinor: 1280, currency: 'brl' });
  expect(quoteDeposit({ ...config, deposit_config: { enabled: false } }, 3)).toHaveProperty('error');
  expect(quoteDeposit({ ...config, deposit_config: { enabled: true, currency: 'jpy', amount: 20 } }, 3)).toHaveProperty('error');
  expect(stripeMode('rkcs_test_fixture')).toBe(false);
  expect(stripeMode('sk_live_fixture')).toBe(true);
  expect(() => stripeMode('wrong')).toThrow('mode');
});

test.each([
  [null, null],
  [{ ...connect, status: 'revoked' }, null],
  [{ ...connect, charges_enabled: false }, null],
  [{ ...connect, default_currency: 'usd' }, null],
  [connect, 'acct_connected'],
  [{ ...connect, default_currency: null }, 'acct_connected'],
])('sends the appropriate destination charge fields for %j', (account, expected) => {
  const destination = connectDestination(account, 'brl');
  expect(destination).toBe(expected);
  const { attempt } = fixture(destination);
  const payment = attempt.checkout_params.payment_intent_data;
  expect(payment.capture_method).toBe('manual');
  expect(payment.on_behalf_of).toBe(expected ?? undefined);
  expect(payment.transfer_data?.destination).toBe(expected ?? undefined);
  expect(attempt.checkout_params.adaptive_pricing).toEqual({ enabled: false });
  expect(payment.metadata).toMatchObject({ restaurant_id: restaurant, reservation_id: booking.reservation_id,
    date: booking.date, time: booking.time, party_size: '3', currency: 'brl', hosted_deposit_id: attempt.id });
  expect(JSON.stringify(payment.metadata)).not.toContain(booking.customer_email);
});

test('requires a real destination identifier for an eligible Connect row', () => {
  expect(() => connectDestination({ ...connect, stripe_account_id: 'invalid' }, 'brl')).toThrow('invalid');
});

test('stores the stable request parameters before using the Stripe idempotency key', async () => {
  const { attempt, db, stripe, session } = fixture();
  db.rpc.mockResolvedValueOnce({ data: { result: 'pending', attempt } }).mockResolvedValueOnce({ data: 'open' });
  const saved = await beginAttempt(db, attempt);
  expect(db.rpc).toHaveBeenCalledWith('begin_hosted_reservation_deposit', expect.objectContaining({
    p_id: attempt.id, p_booking_id: booking.id, p_restaurant_id: restaurant, p_checkout_params: attempt.checkout_params,
  }));
  stripe.checkout.sessions.retrieve.mockResolvedValue({ ...session, status: 'open', payment_intent: null,
    payment_status: 'unpaid', url: 'https://checkout.stripe.com/test' });
  expect(await openCheckout(db, stripe, saved.attempt)).toEqual({ result: 'open', url: 'https://checkout.stripe.com/test' });
  expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(attempt.checkout_params,
    expect.objectContaining({ idempotencyKey: 'hosted-deposit-' + attempt.id }));
  expect(db.rpc).toHaveBeenLastCalledWith('settle_hosted_reservation_deposit', expect.objectContaining({
    p_observation: 'open', p_session_id: session.id, p_intent_id: null,
  }));
  expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
});

test('reconciles from fresh Checkout and PaymentIntent records, not the signed event snapshot', async () => {
  const f = fixture('acct_connected');
  f.event.data.object.payment_intent = 'pi_wrong_from_event';
  expect(await handleHostedDepositEvent(f)).toBe('attached');
  expect(f.stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(f.session.id, {}, expect.anything());
  expect(f.stripe.paymentIntents.retrieve).toHaveBeenCalledWith(f.intent.id, { expand: ['latest_charge'] }, expect.anything());
  expect(f.db.rpc).toHaveBeenCalledWith('settle_hosted_reservation_deposit', expect.objectContaining({
    p_id: f.attempt.id, p_session_id: f.session.id, p_intent_id: f.intent.id, p_observation: 'hold',
    p_authorized_at: f.intent.latest_charge.created,
    p_capture_before: f.intent.latest_charge.payment_method_details.card.capture_before,
  }));
});

test.each([
  ['session total', f => { f.session.amount_total += 1; }],
  ['session currency', f => { f.session.currency = 'usd'; }],
  ['session mode', f => { f.session.mode = 'subscription'; }],
  ['session livemode', f => { f.session.livemode = true; }],
  ['session expiry', f => { f.session.expires_at += 1; }],
  ['session tenant', f => { f.session.metadata = { ...f.session.metadata, restaurant_id: 'foreign' }; }],
  ['session date', f => { f.session.metadata = { ...f.session.metadata, date: '2027-01-01' }; }],
  ['session time', f => { f.session.metadata = { ...f.session.metadata, time: '20:00:00' }; }],
  ['session party', f => { f.session.metadata = { ...f.session.metadata, party_size: '4' }; }],
  ['wrong pinned session', f => { f.attempt.checkout_session_id = 'cs_test_other'; }],
  ['wrong Connect destination', f => { f.intent.transfer_data.destination = 'acct_other'; }],
  ['wrong Connect on_behalf_of', f => { f.intent.on_behalf_of = 'acct_other'; }],
  ['intent amount', f => { f.intent.amount += 1; }],
  ['intent currency', f => { f.intent.currency = 'eur'; }],
  ['processing authorization', f => { f.intent.status = 'processing'; }],
  ['capturable amount', f => { f.intent.amount_capturable -= 1; }],
  ['intent mode', f => { f.intent.livemode = true; }],
  ['already captured', f => { f.intent.status = 'succeeded'; }],
  ['automatic capture', f => { f.intent.capture_method = 'automatic'; }],
  ['missing capture deadline', f => { delete f.intent.latest_charge.payment_method_details.card.capture_before; }],
])('fails closed on %s and leaves the provider hold alone', async (_name, change) => {
  const f = fixture('acct_connected');
  change(f);
  await expect(handleHostedDepositEvent(f)).rejects.toThrow('Hosted deposit');
  expect(f.db.rpc).not.toHaveBeenCalled();
  expect(f.stripe.paymentIntents.cancel).not.toHaveBeenCalled();
});

test('does not adopt a legacy Checkout with tenant and reservation but no quote, or a subscription', () => {
  const f = fixture();
  const legacy = { ...f.event, data: { object: { ...f.session,
    metadata: { restaurant_id: restaurant, reservation_id: booking.reservation_id } } } };
  expect(isHostedDepositEvent(legacy)).toBe(false);
  expect(isHostedDepositEvent({ ...f.event, data: { object: { ...f.session, mode: 'subscription' } } })).toBe(false);
  expect(isHostedDepositEvent(f.event)).toBe(true);
});

test.each([
  ['wrong signed tenant', f => { f.event.data.object.metadata = { ...f.session.metadata, restaurant_id: 'foreign' }; }],
  ['wrong signed mode', f => { f.event.livemode = true; }],
  ['connected direct charge account', f => { f.event.account = 'acct_other'; }],
  ['unknown quote', f => { f.lookup.maybeSingle.mockResolvedValue({ data: null }); }],
])('ignores %s without retrieving or writing Stripe objects', async (_name, change) => {
  const f = fixture();
  change(f);
  expect(await handleHostedDepositEvent(f)).toBe('ignored');
  expect(f.stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
  expect(f.db.rpc).not.toHaveBeenCalled();
});

test('retries on transient DB failure and does not cancel before the durable release decision', async () => {
  const f = fixture();
  f.db.rpc.mockResolvedValueOnce({ error: { code: 'PGRST000' } })
    .mockResolvedValueOnce({ data: 'release_pending' }).mockResolvedValueOnce({ data: 'released' });
  await expect(handleHostedDepositEvent(f)).rejects.toThrow('Could not settle');
  expect(f.stripe.paymentIntents.cancel).not.toHaveBeenCalled();
  expect(await handleHostedDepositEvent(f)).toBe('released');
  expect(f.stripe.paymentIntents.cancel).toHaveBeenCalledWith(f.intent.id, { cancellation_reason: 'abandoned' },
    expect.objectContaining({ idempotencyKey: 'hosted-deposit-release-' + f.attempt.id }));
  expect(f.db.rpc).toHaveBeenLastCalledWith('settle_hosted_reservation_deposit', expect.objectContaining({ p_observation: 'canceled' }));
});

test('retries after a lost cancellation response and settles only once Stripe confirms cancellation', async () => {
  const f = fixture();
  f.db.rpc.mockResolvedValueOnce({ data: 'release_pending' }).mockResolvedValueOnce({ data: 'released' });
  f.stripe.paymentIntents.cancel.mockRejectedValueOnce(new Error('lost provider response'));
  await expect(handleHostedDepositEvent(f)).rejects.toThrow('lost provider response');
  f.stripe.paymentIntents.retrieve.mockResolvedValueOnce({ ...f.intent, status: 'canceled', amount_capturable: 0 });
  expect(await handleHostedDepositEvent(f)).toBe('released');
  expect(f.stripe.paymentIntents.cancel).toHaveBeenCalledTimes(1);
});

test.each(['attached', 'released'])('a replay after a terminal %s write cannot reattach even after capture or release', async state => {
  const f = fixture();
  f.attempt.state = state;
  f.attempt.payment_intent_id = f.intent.id;
  f.attempt.checkout_session_id = f.session.id;
  f.intent.status = state === 'attached' ? 'succeeded' : 'canceled';
  expect(await handleHostedDepositEvent(f)).toBe(state);
  expect(f.db.rpc).not.toHaveBeenCalled();
  expect(f.stripe.paymentIntents.cancel).not.toHaveBeenCalled();
});

test('marks a Checkout expired on its fresh provider status before allowing a replacement', async () => {
  const f = fixture();
  f.attempt.checkout_session_id = f.session.id;
  f.session.status = 'expired';
  expect(await openCheckout(f.db, f.stripe, f.attempt)).toEqual({ result: 'unavailable' });
  expect(f.db.rpc).toHaveBeenCalledWith('expire_hosted_deposit_link', {
    p_id: f.attempt.id, p_session_id: f.session.id,
  });
  expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
});

test('records a hosted checkout expiry only after Stripe confirms the linked session expired', async () => {
  const f = fixture();
  f.event.type = 'checkout.session.expired';
  f.event.data.object.status = 'expired';
  expect(isHostedDepositEvent(f.event)).toBe(true);
  await expect(handleHostedDepositEvent(f)).rejects.toThrow('expiry not confirmed');
  expect(f.db.rpc).not.toHaveBeenCalled();

  f.session.status = 'expired';
  expect(await handleHostedDepositEvent(f)).toBe('expired');
  expect(f.db.rpc).toHaveBeenCalledTimes(1);
  expect(f.db.rpc).toHaveBeenCalledWith('expire_hosted_deposit_link', {
    p_id: f.attempt.id, p_session_id: f.session.id,
  });
  expect(f.stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  expect(f.stripe.paymentIntents.cancel).not.toHaveBeenCalled();
});
