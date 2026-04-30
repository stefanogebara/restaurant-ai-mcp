/**
 * Tests for api/proactive-comms.js — manager API for the queue.
 *
 * Covers:
 *   - 401 without auth
 *   - GET list scoped to restaurant_id
 *   - GET returns empty list (200) when table missing
 *   - PATCH validates status transitions (pending→approved OK, sent→pending blocked)
 *   - PATCH cross-tenant isolation (foreign id 404s)
 *   - POST send requires approved status
 *   - POST send dispatches WhatsApp + transitions to sent
 */

var mockSchemaFrom = jest.fn();
var mockSupabaseAdmin = {
  schema: jest.fn().mockReturnValue({ from: mockSchemaFrom }),
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));
jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn().mockReturnValue(false),
}));

// Auth: by default, return a valid user; tests can override
var mockVerifyAuth = jest.fn();
jest.mock('../_lib/auth', () => ({
  verifyAuth: (...args) => mockVerifyAuth(...args),
}));

// WhatsApp sender — by default, success
var mockSendWhatsAppMessage = jest.fn();
var mockIsWhatsAppConfigured = jest.fn();
jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: (...args) => mockSendWhatsAppMessage(...args),
  isWhatsAppConfigured: () => mockIsWhatsAppConfigured(),
}));

const handler = require('../proactive-comms');

const RESTAURANT_ID = 'r-1';
const FOREIGN_RESTAURANT_ID = 'r-2';
const ITEM_ID = 'i-1';

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

function authedUser(restaurantId = RESTAURANT_ID) {
  return { error: null, user: { sub: 'u-1', restaurant_id: restaurantId } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyAuth.mockResolvedValue(authedUser());
  mockIsWhatsAppConfigured.mockReturnValue(true);
  mockSendWhatsAppMessage.mockResolvedValue({ success: true });
});

describe('proactive-comms API — auth', () => {
  test('401 without auth', async () => {
    mockVerifyAuth.mockResolvedValue({ error: 'unauthorized', status: 401 });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('400 when user has no restaurant', async () => {
    mockVerifyAuth.mockResolvedValue({ error: null, user: { sub: 'u-1', restaurant_id: null } });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('proactive-comms API — GET', () => {
  test('lists items scoped to restaurant', async () => {
    const items = [
      { id: 'i-1', restaurant_id: RESTAURANT_ID, status: 'pending', type: 'occasion', customer_phone: '+55119', suggested_action: 'a' },
      { id: 'i-2', restaurant_id: RESTAURANT_ID, status: 'approved', type: 'churn_risk', customer_phone: '+55129', suggested_action: 'b' },
    ];
    mockSchemaFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              in: () => Promise.resolve({ data: items, error: null }),
            }),
          }),
        }),
      }),
    });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.items).toHaveLength(2);
    expect(json.counts.pending).toBe(1);
    expect(json.counts.approved).toBe(1);
  });

  test('returns empty list (200) with migration_pending when table missing (postgres 42P01)', async () => {
    mockSchemaFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              in: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'relation does not exist' } }),
            }),
          }),
        }),
      }),
    });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.items).toEqual([]);
    expect(json.migration_pending).toBe(true);
  });

  // Regression test: in production the Supabase JS client surfaces missing
  // tables as PostgREST schema-cache miss (PGRST205), not the postgres-native
  // 42P01. The smoke test caught this on the first deploy — handler returned
  // 500 instead of the graceful migration_pending response.
  test('returns empty list (200) with migration_pending when PostgREST schema cache misses (PGRST205)', async () => {
    mockSchemaFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              in: () => Promise.resolve({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'restaurant.proactive_comms_queue' in the schema cache" } }),
            }),
          }),
        }),
      }),
    });
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.items).toEqual([]);
    expect(json.migration_pending).toBe(true);
  });

  test('400 on invalid status query param', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {}, query: { status: 'bogus' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('proactive-comms API — PATCH', () => {
  test('blocks invalid transition (sent → pending)', async () => {
    mockSchemaFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { id: ITEM_ID, restaurant_id: RESTAURANT_ID, status: 'sent' },
              error: null,
            }),
          }),
        }),
      }),
    });

    const res = mockRes();
    await handler({
      method: 'PATCH',
      headers: {},
      query: { id: ITEM_ID },
      body: { status: 'pending' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const json = res.json.mock.calls[0][0];
    expect(json.error).toBe('invalid_transition');
  });

  test('allows pending → approved and writes approved_by', async () => {
    let updateCapture = null;
    mockSchemaFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { id: ITEM_ID, restaurant_id: RESTAURANT_ID, status: 'pending' },
              error: null,
            }),
          }),
        }),
      }),
      update: (updates) => {
        updateCapture = updates;
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({
                  data: { id: ITEM_ID, status: 'approved', ...updates },
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    });

    const res = mockRes();
    await handler({
      method: 'PATCH',
      headers: {},
      query: { id: ITEM_ID },
      body: { status: 'approved', draft_message: 'Olá!' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateCapture.status).toBe('approved');
    expect(updateCapture.approved_by).toBe('u-1');
    expect(updateCapture.draft_message).toBe('Olá!');
  });

  test('404 when item id does not exist (cross-tenant isolation)', async () => {
    mockSchemaFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    });
    const res = mockRes();
    await handler({
      method: 'PATCH',
      headers: {},
      query: { id: ITEM_ID },
      body: { status: 'approved' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('proactive-comms API — POST send', () => {
  test('400 when item is not approved', async () => {
    mockSchemaFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { id: ITEM_ID, restaurant_id: RESTAURANT_ID, status: 'pending', draft_message: 'hi', customer_phone: '+5511999' },
              error: null,
            }),
          }),
        }),
      }),
    });
    const res = mockRes();
    await handler({
      method: 'POST',
      headers: {},
      query: { id: ITEM_ID, action: 'send' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error).toBe('not_approved');
  });

  test('503 when WhatsApp is not configured', async () => {
    mockIsWhatsAppConfigured.mockReturnValue(false);
    mockSchemaFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { id: ITEM_ID, restaurant_id: RESTAURANT_ID, status: 'approved', draft_message: 'hi', customer_phone: '+5511999' },
              error: null,
            }),
          }),
        }),
      }),
    });
    const res = mockRes();
    await handler({
      method: 'POST',
      headers: {},
      query: { id: ITEM_ID, action: 'send' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  test('sends and transitions to sent on success', async () => {
    let updateCapture = null;
    mockSchemaFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { id: ITEM_ID, restaurant_id: RESTAURANT_ID, status: 'approved', draft_message: 'Olá!', customer_phone: '+5511999' },
              error: null,
            }),
          }),
        }),
      }),
      update: (updates) => {
        updateCapture = updates;
        return {
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: () => Promise.resolve({
                  data: { id: ITEM_ID, status: 'sent', ...updates },
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    });

    const res = mockRes();
    await handler({
      method: 'POST',
      headers: {},
      query: { id: ITEM_ID, action: 'send' },
    }, res);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith('+5511999', 'Olá!', expect.objectContaining({
      restaurant_id: RESTAURANT_ID,
      campaign_type: 'proactive_comms',
    }));
    expect(updateCapture.status).toBe('sent');
    expect(updateCapture.sent_at).toBeDefined();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('502 + records send_error on WhatsApp failure', async () => {
    mockSendWhatsAppMessage.mockResolvedValue({ success: false, error: 'WA: rate limited' });

    let updateCapture = null;
    mockSchemaFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { id: ITEM_ID, restaurant_id: RESTAURANT_ID, status: 'approved', draft_message: 'hi', customer_phone: '+5511999' },
              error: null,
            }),
          }),
        }),
      }),
      update: (updates) => {
        updateCapture = updates;
        return {
          eq: () => ({
            eq: () => Promise.resolve({ data: null, error: null }),
          }),
        };
      },
    });

    const res = mockRes();
    await handler({
      method: 'POST',
      headers: {},
      query: { id: ITEM_ID, action: 'send' },
    }, res);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(updateCapture.send_error).toBe('WA: rate limited');
  });
});
