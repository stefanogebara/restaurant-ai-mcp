const mockReservation = {
  id: 'booking-row', reservation_id: 'RES-1', restaurant_id: 'restaurant-A',
  deposit_amount: 25, deposit_currency: 'eur', deposit_captured_payment_intent_id: 'pi_capture',
};
const mockReadReservationDeposit = jest.fn();
const mockCreate = jest.fn();
const mockList = jest.fn();
const mockAuth = jest.fn();
const mockFind = jest.fn();
const mockSave = jest.fn();
const mockFilters = [];

jest.mock('../_lib/auth', () => ({ verifyAuth: (...args) => mockAuth(...args) }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn().mockResolvedValue(false) }));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn(() => {
        const query = { eq: jest.fn((...args) => { mockFilters.push(args); return query; }), maybeSingle: mockFind };
        return query;
      }),
      update: jest.fn(update => {
        const query = { eq: jest.fn(() => query), or: jest.fn(condition => mockSave(update, condition)) };
        return query;
      }),
    })),
  },
}));
jest.mock('../_lib/reservation-deposits', () => ({
  getStripe: () => ({ refunds: { create: mockCreate, list: mockList } }),
  readReservationDeposit: (...args) => mockReadReservationDeposit(...args),
}));

const handler = require('../refund-deposit');
const { projectDepositRefund, refundIntentId } = require('../_lib/deposit-refunds');
const { supabaseAdmin } = require('../_lib/supabase');

function refund(status = 'succeeded', amount = 2500, id = 're_first') {
  return { status, amount, id, currency: 'eur' };
}

function listing(...items) {
  return (async function* () { yield* items; })();
}

function run() {
  const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  return handler({ method: 'POST', headers: {}, body: { reservation_id: 'RES-1' } }, res).then(() => res);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockReset();
  mockFilters.length = 0;
  mockAuth.mockResolvedValue({ user: { role: 'owner', restaurant_id: 'restaurant-A' } });
  mockFind.mockResolvedValue({ data: mockReservation });
  mockSave.mockResolvedValue({});
  mockReadReservationDeposit.mockResolvedValue({ status: 'succeeded', amount: 2500, amount_received: 2500, currency: 'eur' });
  mockList.mockImplementation(() => listing());
  mockCreate.mockResolvedValue(refund());
});

it('refunds through Connect, reverses the transfer and persists the confirmed amount', async () => {
  mockReadReservationDeposit.mockResolvedValue({
    status: 'succeeded', amount: 2500, amount_received: 2500, currency: 'eur',
    transfer_data: { destination: 'acct_restaurant' },
  });
  mockList.mockReturnValueOnce(listing()).mockReturnValueOnce(listing(refund()));
  const res = await run();
  expect(mockFilters).toContainEqual(['restaurant_id', 'restaurant-A']);
  expect(mockReadReservationDeposit).toHaveBeenCalledWith(mockReservation, 'deposit_captured_payment_intent_id');
  expect(mockCreate).toHaveBeenCalledWith({ payment_intent: 'pi_capture', amount: 2500, reverse_transfer: true },
    { idempotencyKey: 'reservation-deposit-refund-pi_capture-2500-first' });
  expect(mockSave).toHaveBeenCalledWith({ deposit_refunded_amount: 25 }, 'deposit_refunded_amount.is.null,deposit_refunded_amount.lt.25');
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ success: true, state: 'refunded', amount_refunded: 25 });
});

it('reconciles an already successful refund after a local persistence failure', async () => {
  mockList.mockReturnValueOnce(listing()).mockReturnValueOnce(listing(refund())).mockReturnValueOnce(listing(refund()));
  mockSave.mockResolvedValueOnce({ error: new Error('database temporarily unavailable') });
  expect((await run()).status).toHaveBeenCalledWith(503);
  expect((await run()).status).toHaveBeenCalledWith(200);
  expect(mockCreate).toHaveBeenCalledTimes(1);
});

it('reports a pending refund without submitting again or labeling it as refunded', async () => {
  mockList.mockReturnValueOnce(listing(refund('pending')));
  const res = await run();
  expect(res.status).toHaveBeenCalledWith(202);
  expect(res.json).toHaveBeenCalledWith({ success: true, state: 'pending', amount_refunded: 0 });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
});

it('refunds only the remainder and supports retry after a terminal failure', async () => {
  mockList.mockReturnValueOnce(listing(refund('failed', 1500, 're_failed'), refund('succeeded', 1000)))
    .mockReturnValueOnce(listing(refund('succeeded', 1000), refund('succeeded', 1500, 're_second')));
  expect((await run()).status).toHaveBeenCalledWith(200);
  expect(mockCreate).toHaveBeenCalledWith({ payment_intent: 'pi_capture', amount: 1500 },
    { idempotencyKey: 'reservation-deposit-refund-pi_capture-1500-re_failed' });
});

it('limits the operation to owners and captured deposits', async () => {
  mockAuth.mockResolvedValueOnce({ user: { role: 'manager', restaurant_id: 'restaurant-A' } });
  expect((await run()).status).toHaveBeenCalledWith(403);
  mockFind.mockResolvedValueOnce({ data: null });
  expect((await run()).status).toHaveBeenCalledWith(404);
  mockReadReservationDeposit.mockResolvedValueOnce({ status: 'requires_capture' });
  expect((await run()).status).toHaveBeenCalledWith(409);
  expect(mockCreate).not.toHaveBeenCalled();
});

it('projects the provider total from signed-event data without lowering the recorded amount', async () => {
  const event = { type: 'refund.updated', livemode: false, data: { object: { payment_intent: 'pi_capture' } } };
  expect(refundIntentId(event, 'sk_test_example')).toBe('pi_capture');
  expect(refundIntentId(event, 'sk_live_example')).toBeNull();
  const stripe = { refunds: { list: mockList } };
  mockList.mockReturnValueOnce(listing(refund())).mockReturnValueOnce(listing(refund('succeeded', 1000)));
  await projectDepositRefund(supabaseAdmin, stripe, 'pi_capture');
  await projectDepositRefund(supabaseAdmin, stripe, 'pi_capture');
  expect(mockSave.mock.calls.map(([, condition]) => condition)).toEqual([
    'deposit_refunded_amount.is.null,deposit_refunded_amount.lt.25',
    'deposit_refunded_amount.is.null,deposit_refunded_amount.lt.10',
  ]);
});
