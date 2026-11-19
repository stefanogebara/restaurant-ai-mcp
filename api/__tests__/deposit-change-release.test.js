const mockRead = jest.fn();
const mockCancel = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockMaybeSingle = jest.fn();

jest.mock('../_lib/reservation-deposits', () => ({
  getStripe: () => ({ paymentIntents: { cancel: mockCancel } }),
  readReservationDeposit: (...args) => mockRead(...args),
}));
jest.mock('../_lib/db/clients', () => ({
  supabaseAdmin: {
    from: () => ({
      update: values => {
        mockUpdate(values);
        const query = {
          eq: (...args) => { mockEq(...args); return query; },
          not: () => query,
          select: () => query,
          maybeSingle: mockMaybeSingle,
        };
        return query;
      },
    }),
  },
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ warn: jest.fn() }),
}));

const { settleChangedDeposit } = require('../_lib/deposit-change-release');
const booking = {
  id: 'booking', restaurant_id: 'tenant', deposit_amount: 20,
  deposit_payment_intent_id: 'pi_sandbox', deposit_release_pending_at: '2026-11-19T21:00:00Z',
};
const hold = { id: 'pi_sandbox', status: 'requires_capture', amount: 2000, currency: 'eur' };

beforeEach(() => {
  jest.resetAllMocks();
  mockRead.mockResolvedValue(hold);
  mockCancel.mockResolvedValue({ ...hold, status: 'canceled' });
  mockMaybeSingle.mockResolvedValue({ data: { id: 'booking' } });
});

test('clears a released hold only by its tenant, reservation and authorization', async () => {
  expect(await settleChangedDeposit(booking)).toBe('released');
  expect(mockCancel).toHaveBeenCalledWith('pi_sandbox', {}, expect.objectContaining({
    idempotencyKey: 'reservation-deposit-release-pi_sandbox',
  }));
  expect(mockUpdate).toHaveBeenCalledWith({
    deposit_amount: null, deposit_currency: null, deposit_payment_intent_id: null,
  });
  expect(mockEq.mock.calls).toEqual([
    ['id', 'booking'], ['restaurant_id', 'tenant'], ['deposit_payment_intent_id', 'pi_sandbox'],
  ]);
});

test('records a capture that won the race with release and retains the captured amount', async () => {
  mockCancel.mockRejectedValue({ code: 'payment_intent_unexpected_state' });
  mockRead.mockResolvedValueOnce(hold).mockResolvedValueOnce({ ...hold, status: 'succeeded', amount_received: 2000 });
  expect(await settleChangedDeposit(booking)).toBe('captured');
  expect(mockUpdate).toHaveBeenCalledWith({
    deposit_captured_payment_intent_id: 'pi_sandbox', deposit_payment_intent_id: null, deposit_currency: 'eur',
  });
});

test('leaves an unverified or failed authorization queued for retry', async () => {
  mockRead.mockResolvedValueOnce(null);
  expect(await settleChangedDeposit(booking)).toBe('pending');
  expect(mockCancel).not.toHaveBeenCalled();
  mockCancel.mockRejectedValueOnce(new Error('Stripe unavailable'));
  expect(await settleChangedDeposit(booking)).toBe('pending');
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('recovers when Stripe released the hold but the reservation still has it attached', async () => {
  mockRead.mockResolvedValue({ ...hold, status: 'canceled' });
  expect(await settleChangedDeposit(booking)).toBe('released');
  expect(mockCancel).not.toHaveBeenCalled();
});
