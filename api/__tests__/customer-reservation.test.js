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
const mockUpdate = jest.fn();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: () => mockSingle(),
      update: (...args) => { mockUpdate(...args); return { eq: jest.fn(() => Promise.resolve({ error: null })) }; },
    })),
  },
}));

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

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────────────────────
describe('customer-reservation: lookup', () => {
  test('returns 400 with no identifier', async () => {
    const { req, res } = mkReqRes({ query: { action: 'lookup' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns reservation by reservation_id', async () => {
    mockSingle.mockResolvedValueOnce({ data: RESERVATION, error: null });

    const { req, res } = mkReqRes({
      query: { action: 'lookup', reservation_id: 'CEL-2026-0218-A7K3' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.reservation.reservation_id).toBe('CEL-2026-0218-A7K3');
  });

  test('allows phone lookup without restaurant_id (cross-tenant)', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const { req, res } = mkReqRes({
      query: { action: 'lookup', customer_phone: '+15550001234' },
    });
    await handler(req, res);

    // Should proceed to DB lookup and return 404 (no match), not 400 (bad request)
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns reservation by phone with restaurant_id', async () => {
    mockSingle.mockResolvedValueOnce({ data: RESERVATION, error: null });

    const { req, res } = mkReqRes({
      query: { action: 'lookup', customer_phone: '+15550001234', restaurant_id: 'rest-123' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('returns 404 when not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const { req, res } = mkReqRes({
      query: { action: 'lookup', reservation_id: 'FAKE-0000' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Modify
// ─────────────────────────────────────────────────────────────────────────────
describe('customer-reservation: modify', () => {
  test('returns 405 for non-POST', async () => {
    const { req, res } = mkReqRes({ method: 'GET', query: { action: 'modify' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('returns 400 when reservation_id or customer_phone missing', async () => {
    const { req, res } = mkReqRes({
      method: 'POST',
      query: { action: 'modify' },
      body: { reservation_id: 'CEL-2026-0218-A7K3' }, // missing phone
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 when phone does not match (M-02: same as not found)', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'row-1', status: 'Confirmed', customer_phone: '+15550001234' },
      error: null,
    });

    const { req, res } = mkReqRes({
      method: 'POST',
      query: { action: 'modify' },
      body: {
        reservation_id: 'CEL-2026-0218-A7K3',
        customer_phone: '+19999999999', // wrong phone (10 digits, valid format)
        date: '2026-03-02',
      },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('returns 400 when modifying a cancelled reservation', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'row-1', status: 'Cancelled', customer_phone: '+15550001234' },
      error: null,
    });

    const { req, res } = mkReqRes({
      method: 'POST',
      query: { action: 'modify' },
      body: {
        reservation_id: 'CEL-2026-0218-A7K3',
        customer_phone: '+15550001234',
        date: '2026-03-02',
      },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('updates reservation and returns 200', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'row-1', status: 'Confirmed', customer_phone: '+15550001234' },
      error: null,
    });

    const { req, res } = mkReqRes({
      method: 'POST',
      query: { action: 'modify' },
      body: {
        reservation_id: 'CEL-2026-0218-A7K3',
        customer_phone: '+15550001234',
        date: '2026-03-05',
        party_size: 6,
      },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].success).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-03-05', party_size: 6 }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cancel
// ─────────────────────────────────────────────────────────────────────────────
describe('customer-reservation: cancel', () => {
  test('returns 404 when phone does not match (M-02: same as not found)', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'row-1', status: 'Confirmed', customer_phone: '+15550001234' },
      error: null,
    });

    const { req, res } = mkReqRes({
      method: 'POST',
      query: { action: 'cancel' },
      body: { reservation_id: 'CEL-2026-0218-A7K3', customer_phone: '+19999999999' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('cancels reservation and returns 200', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'row-1', status: 'Confirmed', customer_phone: '+15550001234' },
      error: null,
    });

    const { req, res } = mkReqRes({
      method: 'POST',
      query: { action: 'cancel' },
      body: { reservation_id: 'CEL-2026-0218-A7K3', customer_phone: '+15550001234' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdate).toHaveBeenCalledWith({ status: 'Cancelled' });
  });

  test('returns 400 when already cancelled', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { id: 'row-1', status: 'Cancelled', customer_phone: '+15550001234' },
      error: null,
    });

    const { req, res } = mkReqRes({
      method: 'POST',
      query: { action: 'cancel' },
      body: { reservation_id: 'CEL-2026-0218-A7K3', customer_phone: '+15550001234' },
    });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
