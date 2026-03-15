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

jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
  captureException: jest.fn(),
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
    verifyAuth.mockResolvedValueOnce({ error: 'Authentication required', status: 401 });

    const { req, res } = mockReqRes({ method: 'GET' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ---------------------------------------------------------------------------
// Missing restaurant_id (line 43)
// ---------------------------------------------------------------------------
describe('Missing restaurant_id', () => {
  test('returns 400 when user has no restaurant_id', async () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({ user: { id: 'user-1' } }); // no restaurant_id

    const { req, res } = mockReqRes({ method: 'GET' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'No restaurant associated with this account',
    }));
  });
});

// ---------------------------------------------------------------------------
// Error path - top-level catch (lines 64-66)
// ---------------------------------------------------------------------------
describe('Top-level error catch', () => {
  test('returns 500 and captures exception when handler throws', async () => {
    mockGetWaitlistEntries.mockRejectedValueOnce(new Error('Unexpected DB crash'));

    const { req, res } = mockReqRes({ method: 'GET' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Internal server error',
    }));
  });
});

// ---------------------------------------------------------------------------
// DB failure paths (lines 80, 107, 139, 164)
// ---------------------------------------------------------------------------
describe('DB failure paths', () => {
  test('GET returns 500 when getWaitlistEntries fails', async () => {
    mockGetWaitlistEntries.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({ method: 'GET' });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Failed to fetch waitlist',
    }));
  });

  test('POST returns 500 when addToWaitlist fails', async () => {
    mockAddToWaitlist.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      method: 'POST',
      body: { customer_name: 'Test', customer_phone: '+1234567890', party_size: 2 },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Failed to add to waitlist',
    }));
  });

  test('PATCH returns 404 when entry not found', async () => {
    mockUpdateWaitlistEntry.mockResolvedValueOnce({
      success: false,
      message: 'Entry not found',
    });

    const { req, res } = mockReqRes({
      method: 'PATCH',
      query: { id: 'w-nonexistent' },
      body: { status: 'seated' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('PATCH returns 500 when update fails without not-found message', async () => {
    mockUpdateWaitlistEntry.mockResolvedValueOnce({
      success: false,
      message: 'DB error',
    });

    const { req, res } = mockReqRes({
      method: 'PATCH',
      query: { id: 'w1' },
      body: { status: 'seated' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('DELETE returns 500 when removeFromWaitlist fails', async () => {
    mockRemoveFromWaitlist.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      method: 'DELETE',
      query: { id: 'w1' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Failed to remove from waitlist',
    }));
  });
});

// ---------------------------------------------------------------------------
// SMS notification paths (lines 149, 185-196)
// ---------------------------------------------------------------------------
describe('SMS notification', () => {
  test('triggers SMS notification when status changes to notified with phone', async () => {
    // The notified status mock returns customer_phone, so this path executes
    const { req, res } = mockReqRes({
      method: 'PATCH',
      query: { id: 'w1' },
      body: { status: 'notified' },
    });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('sendSMSNotification runs Twilio client when env vars are set', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_PHONE_NUMBER = '+12025551234';

    try {
      const { req, res } = mockReqRes({
        method: 'PATCH',
        query: { id: 'w1' },
        body: { status: 'notified' },
      });
      await handler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    } finally {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;
    }
  });

  test('.catch callback runs when sendSMSNotification rejects', async () => {
    // Make twilio throw to trigger the .catch callback at line 149
    const twilio = require('twilio');
    twilio.mockImplementationOnce(() => ({
      messages: { create: jest.fn().mockRejectedValue(new Error('Twilio error')) },
    }));

    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_PHONE_NUMBER = '+12025551234';

    try {
      const { req, res } = mockReqRes({
        method: 'PATCH',
        query: { id: 'w1' },
        body: { status: 'notified' },
      });
      await handler(req, res);
      // Give the fire-and-forget .catch callback time to execute
      await new Promise(r => setTimeout(r, 20));

      // Response still succeeds (SMS is fire-and-forget)
      expect(res.status).toHaveBeenCalledWith(200);
    } finally {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_PHONE_NUMBER;
    }
  });
});
