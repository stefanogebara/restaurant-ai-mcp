/**
 * Waitlist API Tests
 *
 * Tests GET/POST/PATCH/DELETE with restaurant_id scoping.
 */

// ---------------------------------------------------------------------------
// Fake environment
// ---------------------------------------------------------------------------
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';

const RESTAURANT_ID = 'rest-waitlist-001';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockGetWaitlistEntries = jest.fn(() =>
  Promise.resolve({
    success: true,
    entries: [
      { id: 'w1', customer_name: 'Alice', party_size: 2, status: 'waiting' },
      { id: 'w2', customer_name: 'Bob', party_size: 4, status: 'waiting' },
    ],
  })
);

const mockAddToWaitlist = jest.fn(() =>
  Promise.resolve({
    success: true,
    entry: { id: 'w3', customer_name: 'Charlie', party_size: 3, status: 'waiting' },
  })
);

const mockUpdateWaitlistEntry = jest.fn(() =>
  Promise.resolve({
    success: true,
    entry: { id: 'w1', customer_name: 'Alice', party_size: 2, status: 'notified', customer_phone: '+1111' },
  })
);

const mockRemoveFromWaitlist = jest.fn(() =>
  Promise.resolve({ success: true })
);

jest.mock('../_lib/supabase', () => ({
  getWaitlistEntries: mockGetWaitlistEntries,
  addToWaitlist: mockAddToWaitlist,
  updateWaitlistEntry: mockUpdateWaitlistEntry,
  removeFromWaitlist: mockRemoveFromWaitlist,
}));

jest.mock('twilio', () =>
  jest.fn(() => ({
    messages: { create: jest.fn(() => Promise.resolve({ sid: 'SM_TEST' })) },
  }))
);

jest.mock('resend', () => ({
  Resend: jest.fn(() => ({
    emails: { send: jest.fn() },
  })),
}));

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(() =>
    Promise.resolve({
      user: { id: 'user-1', restaurant_id: RESTAURANT_ID },
    })
  ),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('../_lib/validation', () => ({
  validateWaitlistEntry: jest.fn(() => ({ valid: true, errors: [] })),
  sanitizeInput: jest.fn((v) => v),
}));

jest.mock('../_lib/usage-tracking', () => ({
  trackUsage: jest.fn(),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Require handler
// ---------------------------------------------------------------------------
const handler = require('../waitlist');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockReqRes({ method = 'GET', body = {}, query = {} } = {}) {
  const req = {
    method,
    query,
    body,
    headers: { authorization: 'Bearer test-token' },
    socket: { remoteAddress: '127.0.0.1' },
    ip: '127.0.0.1',
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    end: jest.fn(),
  };
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/waitlist', () => {
  test('returns waitlist entries scoped to restaurant_id', async () => {
    const { req, res } = mockReqRes({ method: 'GET' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetWaitlistEntries).toHaveBeenCalledWith(
      RESTAURANT_ID,
      expect.any(Object)
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        count: 2,
        waitlist: expect.any(Array),
      })
    );
  });

  test('passes status filter', async () => {
    const { req, res } = mockReqRes({
      method: 'GET',
      query: { status: 'waiting' },
    });

    await handler(req, res);

    expect(mockGetWaitlistEntries).toHaveBeenCalledWith(
      RESTAURANT_ID,
      expect.objectContaining({ status: 'waiting' })
    );
  });
});

describe('POST /api/waitlist', () => {
  test('adds customer to waitlist', async () => {
    const { req, res } = mockReqRes({
      method: 'POST',
      body: {
        customer_name: 'Charlie',
        customer_phone: '+5511999999999',
        party_size: 3,
      },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockAddToWaitlist).toHaveBeenCalledWith(
      RESTAURANT_ID,
      expect.objectContaining({
        customer_name: 'Charlie',
        customer_phone: '+5511999999999',
        party_size: 3,
      })
    );
  });

  test('rejects invalid data', async () => {
    const { validateWaitlistEntry } = require('../_lib/validation');
    validateWaitlistEntry.mockReturnValueOnce({
      valid: false,
      errors: ['customer_name is required'],
    });

    const { req, res } = mockReqRes({
      method: 'POST',
      body: {},
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('PATCH /api/waitlist', () => {
  test('updates waitlist entry status', async () => {
    const { req, res } = mockReqRes({
      method: 'PATCH',
      query: { id: 'w1' },
      body: { status: 'notified' },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateWaitlistEntry).toHaveBeenCalledWith(
      'w1',
      RESTAURANT_ID,
      expect.objectContaining({ status: 'notified' })
    );
  });

  test('rejects PATCH without id', async () => {
    const { req, res } = mockReqRes({
      method: 'PATCH',
      body: { status: 'notified' },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects invalid status', async () => {
    const { req, res } = mockReqRes({
      method: 'PATCH',
      query: { id: 'w1' },
      body: { status: 'invalid_status' },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects PATCH with no update fields', async () => {
    const { req, res } = mockReqRes({
      method: 'PATCH',
      query: { id: 'w1' },
      body: {},
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('DELETE /api/waitlist', () => {
  test('removes waitlist entry', async () => {
    const { req, res } = mockReqRes({
      method: 'DELETE',
      query: { id: 'w1' },
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockRemoveFromWaitlist).toHaveBeenCalledWith('w1', RESTAURANT_ID);
  });

  test('rejects DELETE without id', async () => {
    const { req, res } = mockReqRes({
      method: 'DELETE',
    });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('Method not allowed', () => {
  test('returns 405 for PUT method', async () => {
    const { req, res } = mockReqRes({ method: 'PUT' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
  });
});

describe('Authentication', () => {
  test('returns 401 without auth', async () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    const { req, res } = mockReqRes({ method: 'GET' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
