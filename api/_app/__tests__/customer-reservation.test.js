/**
 * Tests for api/customer-reservation.js
 * Public endpoint — no JWT required.
 */

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));
jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));
jest.mock('../_lib/cors', () => ({
  setWebhookCors: jest.fn(),
  handlePreflight: jest.fn().mockReturnValue(false),
}));

// ── Supabase mock ────────────────────────────────────────────────────────────
const mockSingle = jest.fn();
const mockMaybeSingle = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateResult = jest.fn();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => {
      const chain = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        in: jest.fn(() => chain),
        order: jest.fn(() => chain),
        limit: jest.fn(() => chain),
        single: () => mockSingle(),
        maybeSingle: () => mockMaybeSingle(),
        update: (...args) => {
          mockUpdate(...args);
          const write = {
            eq: jest.fn(() => write),
            in: jest.fn(() => write),
            select: jest.fn(() => mockUpdateResult()),
          };
          return write;
        },
      };
      return chain;
    }),
  },
}));

// Guest changes must go through the guarded transition, never a direct write.
const mockMutations = {
  verifyGuestReservation: jest.fn(),
  modifyGuestReservation: jest.fn(),
  cancelGuestReservation: jest.fn(),
};
jest.mock('../_lib/reservation-mutations', () => mockMutations);
const mockTrackUsage = jest.fn().mockResolvedValue(undefined);
jest.mock('../_lib/usage-tracking', () => ({ trackUsage: (...a) => mockTrackUsage(...a) }));

const handler = require('../customer-reservation');

function mkReqRes(overrides = {}) {
  const req = {
    method: overrides.method || 'GET',
    query: overrides.query || {},
    body: overrides.body || {},
    headers: {},
    ...overrides,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn(),
    setHeader: jest.fn(),
  };
  return { req, res };
}

const RESERVATION = {
  reservation_id: 'CEL-2026-0218-A7K3',
  customer_name: 'Alice Smith',
  customer_phone: '+15550001234',
  customer_email: 'alice@example.com',
  date: '2026-03-01',
  time: '19:00',
  party_size: 4,
  special_requests: null,
  status: 'Confirmed',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSingle.mockReset();
  mockMaybeSingle.mockReset();
  mockUpdateResult.mockReset();
  mockUpdateResult.mockResolvedValue({ data: [{ id: 'row-1' }], error: null });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────────────────────
describe('customer-reservation: lookup', () => {
  test('returns 400 with no identifier', async () => {
    const { req, res } = mkReqRes({ query: { action: 'lookup' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns reservation by complete reservation_id and matching phone', async () => {
    mockSingle.mockResolvedValueOnce({ data: RESERVATION, error: null });

    const { req, res } = mkReqRes({
      query: { action: 'lookup', reservation_id: 'CEL-2026-0218-A7K3', customer_phone: '+15550001234' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.reservation.reservation_id).toBe('CEL-2026-0218-A7K3');
  });

  test('refuses phone-only lookup without querying reservations', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const { req, res } = mkReqRes({
      query: { action: 'lookup', customer_phone: '+15550001234' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSingle).not.toHaveBeenCalled();
  });

  test('restaurant_id does not authorize a phone-only lookup', async () => {
    mockSingle.mockResolvedValueOnce({ data: RESERVATION, error: null });

    const { req, res } = mkReqRes({
      query: { action: 'lookup', customer_phone: '+15550001234', restaurant_id: 'rest-123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('reservation');
    expect(mockSingle).not.toHaveBeenCalled();
  });

  test('returns 404 when not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const { req, res } = mkReqRes({
      query: { action: 'lookup', reservation_id: 'FAKE-0000', customer_phone: '+15550001234' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Modify
// ─────────────────────────────────────────────────────────────────────────────
const TENANT = '11111111-2222-4333-8444-555555555555';
const owned = (overrides = {}) => ({
  success: true, changed: true, error: null,
  reservation: { id: 'row-1', reservation_id: 'CEL-2026-0218-A7K3', restaurant_id: TENANT, customer_phone: '+15550001234',
    date: '2026-12-01', time: '19:00', party_size: 6, status: 'confirmed', special_requests: '', ...overrides },
});
const refused = (code, message = `refused: ${code}`) => ({ success: false, changed: false, reservation: null, error: { code, message } });
const post = (action, body) => mkReqRes({ method: 'POST', query: { action }, body });

describe('customer-reservation: modify', () => {
  test('returns 405 for non-POST', async () => {
    const { req, res } = mkReqRes({ method: 'GET', query: { action: 'modify' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('returns 400 when reservation_id or customer_phone missing', async () => {
    const { req, res } = post('modify', { reservation_id: 'CEL-2026-0218-A7K3', date: '2026-12-01' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockMutations.modifyGuestReservation).not.toHaveBeenCalled();
  });

  test('returns 404 when the code is unknown, without calling the transition', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { req, res } = post('modify', { reservation_id: 'RES-NOPE', customer_phone: '+15550001234', date: '2026-12-01' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockMutations.modifyGuestReservation).not.toHaveBeenCalled();
  });

  test('returns 404 when the transition rejects the phone (M-02: same as not found)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { restaurant_id: TENANT }, error: null });
    mockMutations.modifyGuestReservation.mockResolvedValueOnce(refused('verification_failed'));
    const { req, res } = post('modify', { reservation_id: 'CEL-2026-0218-A7K3', customer_phone: '+19999999999', date: '2026-12-01' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error).toBe('Reservation not found or phone number does not match');
  });

  test.each([
    ['unavailable', 409], ['outside_hours', 409], ['too_late', 409], ['past_slot', 409], ['too_far', 409],
    ['party_too_large', 409], ['invalid_status', 400], ['invalid_time', 400], ['mutation_unavailable', 503],
  ])('a %s refusal from the transition is %i and writes nothing', async (code, status) => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { restaurant_id: TENANT }, error: null });
    mockMutations.modifyGuestReservation.mockResolvedValueOnce(refused(code));
    const { req, res } = post('modify', { reservation_id: 'CEL-2026-0218-A7K3', customer_phone: '+15550001234', time: '19:30' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('passes the tenant, code, typed phone and new slot to the transition', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { restaurant_id: TENANT }, error: null });
    mockMutations.modifyGuestReservation.mockResolvedValueOnce(owned());
    const { req, res } = post('modify', {
      reservation_id: ' CEL-2026-0218-A7K3 ', customer_phone: '+15550001234', date: '2026-12-01', time: '19:00:00', party_size: '6',
    });
    await handler(req, res);
    expect(mockMutations.modifyGuestReservation).toHaveBeenCalledWith({
      restaurantId: TENANT, reservationId: 'CEL-2026-0218-A7K3', customerPhone: '+15550001234',
      newDate: '2026-12-01', newTime: '19:00', newPartySize: 6,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, changed: true });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('keeps the channel party limit of 50', async () => {
    const { req, res } = post('modify', { reservation_id: 'CEL-2026-0218-A7K3', customer_phone: '+15550001234', party_size: 51 });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockMutations.modifyGuestReservation).not.toHaveBeenCalled();
  });

  test('saves changed special requests only after the verified change', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { restaurant_id: TENANT }, error: null });
    mockMutations.modifyGuestReservation.mockResolvedValueOnce(owned({ special_requests: 'old' }));
    const { req, res } = post('modify', {
      reservation_id: 'CEL-2026-0218-A7K3', customer_phone: '+15550001234', time: '19:00', special_requests: 'window seat',
    });
    await handler(req, res);
    expect(mockUpdate).toHaveBeenCalledWith({ special_requests: 'window seat' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('a notes-only change is verified first and refused for a finished visit', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { restaurant_id: TENANT }, error: null });
    mockMutations.verifyGuestReservation.mockResolvedValueOnce(owned({ status: 'completed', changed: false }));
    const { req, res } = post('modify', { reservation_id: 'CEL-2026-0218-A7K3', customer_phone: '+15550001234', special_requests: 'x' });
    await handler(req, res);
    expect(mockMutations.modifyGuestReservation).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('rejects special requests over 1000 characters before any lookup', async () => {
    const { req, res } = post('modify', { reservation_id: 'CEL-2026-0218-A7K3', customer_phone: '+15550001234', special_requests: 'x'.repeat(1001) });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cancel
// ─────────────────────────────────────────────────────────────────────────────
describe('customer-reservation: cancel', () => {
  const body = { reservation_id: 'CEL-2026-0218-A7K3', customer_phone: '+15550001234' };

  test('returns 404 when the transition rejects the phone (M-02: same as not found)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { restaurant_id: TENANT }, error: null });
    mockMutations.cancelGuestReservation.mockResolvedValueOnce(refused('verification_failed'));
    const { req, res } = post('cancel', { ...body, customer_phone: '+19999999999' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockTrackUsage).not.toHaveBeenCalled();
  });

  test('cancels through the transition, bills once and returns 200', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { restaurant_id: TENANT }, error: null });
    mockMutations.cancelGuestReservation.mockResolvedValueOnce(owned({ status: 'cancelled' }));
    const { req, res } = post('cancel', body);
    await handler(req, res);
    expect(mockMutations.cancelGuestReservation).toHaveBeenCalledWith({
      restaurantId: TENANT, reservationId: 'CEL-2026-0218-A7K3', customerPhone: '+15550001234',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockTrackUsage).toHaveBeenCalledWith(TENANT, 'reservation_cancelled');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('a repeated cancel (already cancelled, any casing) is 400 and not billed again', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { restaurant_id: TENANT }, error: null });
    mockMutations.cancelGuestReservation.mockResolvedValueOnce({ ...owned({ status: 'Cancelled' }), changed: false });
    const { req, res } = post('cancel', body);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockTrackUsage).not.toHaveBeenCalled();
  });

  test('a finished visit cannot be cancelled (no billing credit)', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { restaurant_id: TENANT }, error: null });
    mockMutations.cancelGuestReservation.mockResolvedValueOnce(refused('invalid_status'));
    const { req, res } = post('cancel', body);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockTrackUsage).not.toHaveBeenCalled();
  });

  test('a tenant lookup error is 503 and calls nothing else', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'down' } });
    const { req, res } = post('cancel', body);
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(mockMutations.cancelGuestReservation).not.toHaveBeenCalled();
  });
});
