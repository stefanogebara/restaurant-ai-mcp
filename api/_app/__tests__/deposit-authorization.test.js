const mockDb = jest.fn();
const mockReadDeposit = jest.fn();
const mockCancel = jest.fn();

jest.mock('../_lib/db/clients', () => ({ supabaseAdmin: { from: (...args) => mockDb(...args) } }));
jest.mock('../_lib/reservation-deposits', () => ({
  getStripe: () => ({ paymentIntents: { cancel: mockCancel } }),
  captureDeadline: payment => payment.deadline,
  readReservationDeposit: (...args) => mockReadDeposit(...args),
  stripeLiveMode: () => false,
}));

const {
  depositAuthorizationEventIntent,
  reconcileDepositAuthorizationEvent,
  reviewDueDepositAuthorizations,
} = require('../_lib/deposit-authorization');

const now = Date.parse('2026-11-19T22:00:00Z');
const booking = { id: 'booking', restaurant_id: 'tenant', deposit_payment_intent_id: 'pi_hold123', deposit_check_after: new Date(now).toISOString() };
const canceled = { id: 'pi_hold123', status: 'canceled', amount_received: 0 };

function query(result) {
  const builder = {
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
  for (const method of ['select', 'update', 'eq', 'is', 'not', 'lte', 'or', 'order', 'limit']) {
    builder[method] = jest.fn().mockReturnValue(builder);
  }
  return builder;
}

beforeEach(() => jest.resetAllMocks());

test('only accepts same-mode platform events for ended authorizations', () => {
  const event = { type: 'charge.expired', livemode: false, data: { object: { livemode: false, payment_intent: 'pi_hold123' } } };
  expect(depositAuthorizationEventIntent(event)).toBe('pi_hold123');
  expect(depositAuthorizationEventIntent({ ...event, livemode: true })).toBeNull();
  expect(depositAuthorizationEventIntent({ ...event, account: 'acct_external' })).toBeNull();
  expect(depositAuthorizationEventIntent({ ...event, type: 'charge.refunded' })).toBeNull();
});

test('projects a verified provider expiry without clearing a replacement or queued release', async () => {
  const read = query({ data: booking });
  const write = query({});
  mockDb.mockReturnValueOnce(read).mockReturnValueOnce(write);
  mockReadDeposit.mockResolvedValue(canceled);

  await reconcileDepositAuthorizationEvent('pi_hold123', true);

  expect(write.update).toHaveBeenCalledWith({
    deposit_payment_intent_id: null, deposit_amount: null, deposit_currency: null,
    deposit_authorization_expired_at: expect.any(String), deposit_reauthorization_required: true,
  });
  expect(write.eq.mock.calls).toEqual([
    ['id', 'booking'], ['restaurant_id', 'tenant'], ['deposit_payment_intent_id', 'pi_hold123'],
  ]);
  expect(write.is).toHaveBeenCalledWith('deposit_release_pending_at', null);
  expect(mockCancel).not.toHaveBeenCalled();
});

test('does not clear a hold from a stale or prematurely delivered expiry event', async () => {
  mockDb.mockReturnValueOnce(query({ data: null })).mockReturnValueOnce(query({ data: booking }));
  mockReadDeposit.mockResolvedValue({ status: 'requires_capture' });

  await reconcileDepositAuthorizationEvent('pi_hold123', true);
  expect(mockReadDeposit).not.toHaveBeenCalled();
  await expect(reconcileDepositAuthorizationEvent('pi_hold123', true)).rejects.toThrow('has not settled');
  expect(mockDb).toHaveBeenCalledTimes(2);
});

test('the scheduled fallback ends an authorization only after its provider deadline', async () => {
  const read = query({ data: [booking] });
  const write = query({});
  mockDb.mockReturnValueOnce(read).mockReturnValueOnce(write);
  mockReadDeposit.mockResolvedValue({ ...canceled, status: 'requires_capture', deadline: now - 1000 });
  mockCancel.mockResolvedValue(canceled);

  expect(await reviewDueDepositAuthorizations(now)).toEqual(['cleared']);
  expect(read.limit).toHaveBeenCalledWith(12);
  expect(mockCancel).toHaveBeenCalledWith('pi_hold123', {}, expect.objectContaining({ idempotencyKey: 'reservation-deposit-release-pi_hold123' }));
  expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ deposit_authorization_expired_at: new Date(now).toISOString() }));
});

test('a valid hold stays attached and is due for review by the Stripe deadline', async () => {
  const write = query({});
  mockDb.mockReturnValueOnce(query({ data: [booking] })).mockReturnValueOnce(write);
  const deadline = now + 60_000;
  mockReadDeposit.mockResolvedValue({ status: 'requires_capture', deadline });

  expect(await reviewDueDepositAuthorizations(now)).toEqual(['scheduled']);
  expect(write.update).toHaveBeenCalledWith({ deposit_check_after: new Date(deadline).toISOString() });
  expect(mockCancel).not.toHaveBeenCalled();
});
