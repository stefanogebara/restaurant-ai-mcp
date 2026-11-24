jest.mock('../_lib/supabase', () => ({ supabaseAdmin: {} }));
const mockRetrieve = jest.fn();
jest.mock('stripe', () => jest.fn().mockImplementation(() => ({
  paymentIntents: { retrieve: mockRetrieve },
})));

const { isCapturable, matchesAuthorization, readReservationDeposit } = require('../_lib/reservation-deposits');

beforeEach(() => {
  jest.replaceProperty(process, 'env', { ...process.env, STRIPE_SECRET_KEY: 'sk_test_dummy' });
});
afterEach(() => jest.restoreAllMocks());

const quote = {
  id: 'quote-1', restaurant_id: 'rest-1', intent_id: 'pi_test',
  amount_minor: 3000, currency: 'brl', destination: 'acct_expected',
};
const purpose = 'reservation_deposit';
const payment = {
  id: quote.intent_id, livemode: false, status: 'requires_capture',
  amount: 3000, amount_capturable: 3000, currency: 'brl', capture_method: 'manual',
  metadata: { type: purpose, quote_id: quote.id, restaurant_id: quote.restaurant_id },
  on_behalf_of: 'acct_expected', transfer_data: { destination: 'acct_expected' },
};

test('authorizes only the destination and settlement account stored on a Connect quote', () => {
  expect(matchesAuthorization(payment, quote, purpose)).toBe(true);
  expect(matchesAuthorization({ ...payment, transfer_data: { destination: 'acct_other' } }, quote, purpose)).toBe(false);
  expect(matchesAuthorization({ ...payment, on_behalf_of: 'acct_other' }, quote, purpose)).toBe(false);
  expect(matchesAuthorization({ ...payment, transfer_data: null, on_behalf_of: null }, quote, purpose)).toBe(false);
});

test.each([
  { currency: 'usd' }, { amount: 2999 }, { capture_method: 'automatic' }, { livemode: true },
  { metadata: { ...payment.metadata, quote_id: 'other' } },
  { metadata: { ...payment.metadata, type: 'reservation_deposit_post_booking' } },
])('rejects an authorization with different Stripe facts %p', facts => {
  expect(matchesAuthorization({ ...payment, ...facts }, quote, purpose)).toBe(false);
});

test('requires the full amount in an unexpired capture window', () => {
  expect(isCapturable(payment, 3000)).toBe(true);
  expect(isCapturable({ ...payment, status: 'requires_action' }, 3000)).toBe(false);
  expect(isCapturable({ ...payment, amount_capturable: 2700 }, 3000)).toBe(false);
  expect(isCapturable({ ...payment, latest_charge: {
    payment_method_details: { card: { capture_before: 1 } },
  } }, 3000)).toBe(false);
});

test.each([
  ['RES-BOOKING-1', true],
  ['booking-row-1', true],
  ['RES-OTHER-BOOKING', false],
])('checks hosted deposit metadata against either exact reservation identifier (%s)', async (reference, expected) => {
  const hosted = {
    ...payment,
    metadata: { type: 'reservation_deposit_post_booking', restaurant_id: 'rest-1', reservation_id: reference },
  };
  mockRetrieve.mockResolvedValueOnce(hosted);
  const result = await readReservationDeposit({
    id: 'booking-row-1', reservation_id: 'RES-BOOKING-1', restaurant_id: 'rest-1',
    deposit_payment_intent_id: payment.id, deposit_amount: 30,
  });
  expect(result).toBe(expected ? hosted : null);
});
