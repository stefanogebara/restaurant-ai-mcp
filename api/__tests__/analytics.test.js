/**
 * Tests for api/analytics.js
 * Authenticated GET-only analytics endpoint
 */

// --- Mock dependencies ---
const mockSelect = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();
const mockRange = jest.fn();

// Per-table mock data (starts with 'mock' prefix so Jest hoisting can access it)
const mockTableData = {};

function mockCreateChainableMock(returnData = { data: [], error: null }) {
  const chain = new Proxy({}, {
    get(target, prop) {
      if (prop === 'select') return (...args) => { mockSelect(...args); return chain; };
      if (prop === 'eq') return (...args) => { mockEq(...args); return chain; };
      if (prop === 'range') return (from, to) => {
        mockRange(from, to);
        return Promise.resolve({
          ...returnData,
          data: Array.isArray(returnData.data) ? returnData.data.slice(from, to + 1) : returnData.data,
        });
      };
      if (prop === 'then') return (resolve) => resolve(returnData);
      return () => chain;
    },
  });
  return chain;
}

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: (table) => {
      mockFrom(table);
      // Use per-table override if set, otherwise return empty data
      const returnData = mockTableData[table] || { data: [], error: null };
      return mockCreateChainableMock(returnData);
    },
  },
  getAllTables: jest.fn().mockResolvedValue({
    success: true,
    tables: [
      { table_number: '1', capacity: 4, location: 'Main' },
      { table_number: '2', capacity: 6, location: 'Patio' },
    ],
  }),
  getActiveServiceRecords: jest.fn().mockResolvedValue({
    success: true,
    service_records: [],
  }),
}));

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(),
}));

jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: jest.fn().mockImplementation((req, res, next) => {
    // Simulate subscription middleware attaching plan info to req
    req.subscription = req.subscription || { plan_name: 'growth' };
    next();
  }),
  requireFeature: jest.fn().mockReturnValue((req, res, next) => next()),
}));

jest.mock('../_services/subscription-limits', () => ({
  hasFeature: jest.fn().mockReturnValue(true),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const handler = require('../analytics');
const { verifyAuth } = require('../_lib/auth');
const { getAllTables, getActiveServiceRecords } = require('../_lib/supabase');

function createMockReqRes(overrides = {}) {
  const req = {
    method: overrides.method || 'GET',
    query: overrides.query || {},
    body: overrides.body || {},
    headers: overrides.headers || { authorization: 'Bearer test-token' },
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

beforeEach(() => {
  jest.clearAllMocks();
  // Reset per-table data
  delete mockTableData.reservations;
  delete mockTableData.service_records;
});

// ============================================================
// CORS & Method checks
// ============================================================
describe('Analytics: CORS and methods', () => {
  test('handles OPTIONS request', async () => {
    const { req, res } = createMockReqRes({ method: 'OPTIONS' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('rejects non-GET methods', async () => {
    const { req, res } = createMockReqRes({ method: 'POST' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ============================================================
// Authentication
// ============================================================
describe('Analytics: Authentication', () => {
  test('returns 401 when not authenticated', async () => {
    verifyAuth.mockResolvedValueOnce({
      error: 'Not authenticated',
      status: 401,
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Not authenticated',
    }));
  });

  test('proceeds when authenticated', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });

    const { req, res } = createMockReqRes({ query: { period: '7d' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// Analytics data
// ============================================================
describe('Analytics: Data response', () => {
  test('returns analytics object with expected structure', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const responseData = res.json.mock.calls[0][0];
    expect(responseData.success).toBe(true);
    expect(responseData.analytics).toBeDefined();
    expect(responseData.analytics.overview).toBeDefined();
    expect(responseData.analytics.overview.total_reservations).toBeDefined();
    expect(responseData.analytics.overview.total_capacity).toBeDefined();
    expect(responseData.analytics.reservations_by_status).toBeDefined();
    expect(responseData.analytics.reservations_by_day).toBeDefined();
    expect(responseData.analytics.reservations_by_time_slot).toBeDefined();
    expect(responseData.analytics.table_utilization).toBeDefined();
    expect(responseData.analytics.daily_trend).toBeDefined();
  });

  test('daily_trend has entries matching the period (default 30d = ~31 days)', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);

    const responseData = res.json.mock.calls[0][0];
    // 30d period produces 31 buckets (30 days ago through today)
    expect(responseData.analytics.daily_trend.length).toBeGreaterThanOrEqual(30);
    expect(responseData.analytics.daily_trend.length).toBeLessThanOrEqual(31);
  });

  test('uses period query param', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });

    const { req, res } = createMockReqRes({ query: { period: 'today' } });
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('fetches a second page instead of truncating reservation totals at 1000', async () => {
    verifyAuth.mockResolvedValueOnce({ user: { restaurant_id: 'rest-1' } });
    const date = new Date().toISOString().split('T')[0];
    mockTableData.reservations = {
      data: Array.from({ length: 1001 }, (_, i) => ({
        id: `r-${i}`, reservation_id: `r-${i}`, date, time: '19:00', status: 'confirmed', party_size: 2,
      })),
      error: null,
    };

    const { req, res } = createMockReqRes({ query: { period: 'today' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].analytics.overview.total_reservations).toBe(1001);
    expect(mockRange).toHaveBeenCalledWith(1000, 1999);
  });

  test('fetches a second service page instead of understating revenue', async () => {
    verifyAuth.mockResolvedValueOnce({ user: { restaurant_id: 'rest-1' } });
    const today = new Date().toISOString().split('T')[0];
    mockTableData.service_records = {
      data: Array.from({ length: 1001 }, (_, i) => ({
        id: `service-${i}`, status: 'completed', seated_at: `${today}T12:00:00Z`,
        actual_departure: `${today}T13:00:00Z`, table_ids: ['1'], total_bill: 1, party_size: 2,
      })),
      error: null,
    };

    const { req, res } = createMockReqRes({ query: { period: 'today' } });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].analytics.overview.total_revenue).toBe(1001);
    expect(mockRange).toHaveBeenCalledWith(1000, 1999);
  });

  test('fails closed instead of returning partial totals beyond the bounded history', async () => {
    verifyAuth.mockResolvedValueOnce({ user: { restaurant_id: 'rest-1' } });
    mockTableData.reservations = {
      data: Array.from({ length: 20001 }, (_, i) => ({ id: `r-${i}` })),
      error: null,
    };

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Analytics data temporarily unavailable' });
  });
});

// ============================================================
// Default values (empty data)
// ============================================================
describe('Analytics: Empty data defaults', () => {
  test('avgPartySize defaults to 0 when no reservations', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    // mockTableData.reservations not set → returns []

    const { req, res } = createMockReqRes();
    await handler(req, res);

    const data = res.json.mock.calls[0][0];
    expect(data.analytics.overview.avg_party_size).toBe(0);
  });

  test('avgServiceTime defaults to 90 when no completed service records', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    // mockTableData.service_records not set → returns []

    const { req, res } = createMockReqRes();
    await handler(req, res);

    const data = res.json.mock.calls[0][0];
    expect(data.analytics.overview.avg_service_time_minutes).toBe(90);
  });

  test('total_capacity sums table capacities', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    // Tables are [capacity:4, capacity:6] → total 10

    const { req, res } = createMockReqRes();
    await handler(req, res);

    const data = res.json.mock.calls[0][0];
    expect(data.analytics.overview.total_capacity).toBe(10);
  });
});

// ============================================================
// Period filtering
// ============================================================
describe('Analytics: Period filtering', () => {
  function makeDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  }

  test('today period (1 day) excludes reservations from 3 days ago', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    mockTableData.reservations = {
      data: [
        { date: makeDate(0), time: '19:00', status: 'confirmed', party_size: 2, customer_name: 'A', reservation_id: '1', created_at: makeDate(0) },
        { date: makeDate(3), time: '19:00', status: 'confirmed', party_size: 2, customer_name: 'B', reservation_id: '2', created_at: makeDate(3) },
      ],
      error: null,
    };

    const { req, res } = createMockReqRes({ query: { period: 'today' } });
    await handler(req, res);

    const data = res.json.mock.calls[0][0];
    // 'today' = 1 day window → only today's reservation passes filter
    expect(data.analytics.overview.total_reservations).toBe(1);
  });

  test('7d period includes reservations from 3 days ago', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    mockTableData.reservations = {
      data: [
        { date: makeDate(0), time: '19:00', status: 'confirmed', party_size: 2, customer_name: 'A', reservation_id: '1', created_at: makeDate(0) },
        { date: makeDate(3), time: '19:00', status: 'confirmed', party_size: 4, customer_name: 'B', reservation_id: '2', created_at: makeDate(3) },
        { date: makeDate(60), time: '19:00', status: 'confirmed', party_size: 2, customer_name: 'C', reservation_id: '3', created_at: makeDate(60) },
      ],
      error: null,
    };

    const { req, res } = createMockReqRes({ query: { period: '7d' } });
    await handler(req, res);

    const data = res.json.mock.calls[0][0];
    // 7d window includes today + 3 days ago, excludes 60 days ago
    expect(data.analytics.overview.total_reservations).toBe(2);
  });

  test('30d period uses 30-day window', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    mockTableData.reservations = {
      data: [
        { date: makeDate(15), time: '12:00', status: 'confirmed', party_size: 3, customer_name: 'A', reservation_id: '1', created_at: makeDate(15) },
        { date: makeDate(60), time: '12:00', status: 'confirmed', party_size: 2, customer_name: 'B', reservation_id: '2', created_at: makeDate(60) },
      ],
      error: null,
    };

    const { req, res } = createMockReqRes({ query: { period: '30d' } });
    await handler(req, res);

    const data = res.json.mock.calls[0][0];
    // 30d window includes 15 days ago, excludes 60 days ago
    expect(data.analytics.overview.total_reservations).toBe(1);
  });
});

// ============================================================
// Time slot categorization
// ============================================================
describe('Analytics: Time slot categorization', () => {
  function makeReservation(id, hour) {
    const today = new Date().toISOString().split('T')[0];
    return {
      date: today,
      time: `${String(hour).padStart(2, '0')}:00`,
      status: 'confirmed',
      party_size: 2,
      customer_name: `Customer ${id}`,
      reservation_id: String(id),
      created_at: today,
    };
  }

  test('categorizes 12:00 as Lunch (11AM-2PM)', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    mockTableData.reservations = { data: [makeReservation(1, 12)], error: null };

    const { req, res } = createMockReqRes();
    await handler(req, res);
    const data = res.json.mock.calls[0][0];
    expect(data.analytics.reservations_by_time_slot['Lunch (11AM-2PM)']).toBe(1);
  });

  test('categorizes 17:00 as Early Dinner (5PM-7PM)', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    mockTableData.reservations = { data: [makeReservation(1, 17)], error: null };

    const { req, res } = createMockReqRes();
    await handler(req, res);
    const data = res.json.mock.calls[0][0];
    expect(data.analytics.reservations_by_time_slot['Early Dinner (5PM-7PM)']).toBe(1);
  });

  test('categorizes 20:00 as Prime Dinner (7PM-10PM)', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    mockTableData.reservations = { data: [makeReservation(1, 20)], error: null };

    const { req, res } = createMockReqRes();
    await handler(req, res);
    const data = res.json.mock.calls[0][0];
    expect(data.analytics.reservations_by_time_slot['Prime Dinner (7PM-10PM)']).toBe(1);
  });

  test('categorizes 22:00 as Late Night (10PM+)', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    mockTableData.reservations = { data: [makeReservation(1, 22)], error: null };

    const { req, res } = createMockReqRes();
    await handler(req, res);
    const data = res.json.mock.calls[0][0];
    expect(data.analytics.reservations_by_time_slot['Late Night (10PM+)']).toBe(1);
  });

  test('categorizes 09:00 as Other', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    mockTableData.reservations = { data: [makeReservation(1, 9)], error: null };

    const { req, res } = createMockReqRes();
    await handler(req, res);
    const data = res.json.mock.calls[0][0];
    expect(data.analytics.reservations_by_time_slot['Other']).toBe(1);
  });
});

// ============================================================
// Table utilization
// ============================================================
describe('Analytics: Table utilization', () => {
  test('calculates table utilization rate correctly', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    const today = new Date().toISOString().split('T')[0];
    // 2 completed service records, one used table '1', one used table '2'
    mockTableData.service_records = {
      data: [
        { status: 'completed', seated_at: `${today}T12:00:00Z`, actual_departure: `${today}T13:30:00Z`, table_ids: ['1'] },
        { status: 'completed', seated_at: `${today}T19:00:00Z`, actual_departure: `${today}T20:30:00Z`, table_ids: ['1'] },
      ],
      error: null,
    };

    const { req, res } = createMockReqRes({ query: { period: '30d' } });
    await handler(req, res);
    const data = res.json.mock.calls[0][0];

    // Table '1' used twice, table '2' used zero times
    const table1 = data.analytics.table_utilization.find(t => String(t.table_number) === '1');
    const table2 = data.analytics.table_utilization.find(t => String(t.table_number) === '2');

    expect(table1).toBeDefined();
    expect(table1.times_used).toBe(2);
    expect(parseFloat(table1.utilization_rate)).toBe(100.0); // 2/2 = 100%
    expect(table2.times_used).toBe(0);
    expect(parseFloat(table2.utilization_rate)).toBe(0);
  });

  test('calculates avg_service_time from completed records', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    const today = new Date().toISOString().split('T')[0];
    // Service record: 60 minutes duration
    mockTableData.service_records = {
      data: [
        { status: 'completed', seated_at: `${today}T12:00:00Z`, actual_departure: `${today}T13:00:00Z`, table_ids: ['1'] },
      ],
      error: null,
    };

    const { req, res } = createMockReqRes();
    await handler(req, res);
    const data = res.json.mock.calls[0][0];
    expect(data.analytics.overview.avg_service_time_minutes).toBe(60);
  });
});

// ============================================================
// Error paths
// ============================================================
describe('Analytics: Error paths', () => {
  test('does not present missing tables as zero capacity', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    getAllTables.mockResolvedValueOnce({ success: false, error: 'Tables unavailable' });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    const data = res.json.mock.calls[0][0];
    expect(data).toEqual({ success: false, error: 'Analytics data temporarily unavailable' });
  });

  test('does not present a reservation query error as an empty period', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    // Mock reservations to return an error
    mockTableData.reservations = { data: null, error: { message: 'Connection failed' } };

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    const data = res.json.mock.calls[0][0];
    expect(data).toEqual({ success: false, error: 'Analytics data temporarily unavailable' });
  });

  test('does not present a service records error as zero revenue', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    // Force service_records DB to return an error → getAllServiceRecordsData catches → returns { success: false }
    mockTableData.service_records = { data: null, error: { message: 'service_records error' } };

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    const data = res.json.mock.calls[0][0];
    expect(data).toEqual({ success: false, error: 'Analytics data temporarily unavailable' });
  });

  test('does not present missing live occupancy as zero', async () => {
    verifyAuth.mockResolvedValueOnce({ user: { restaurant_id: 'rest-1' } });
    getActiveServiceRecords.mockResolvedValueOnce({ success: false, error: 'Unavailable' });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Analytics data temporarily unavailable' });
  });

  test('does not present malformed live occupancy as zero', async () => {
    verifyAuth.mockResolvedValueOnce({ user: { restaurant_id: 'rest-1' } });
    getActiveServiceRecords.mockResolvedValueOnce({ success: true, service_records: null });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Analytics data temporarily unavailable' });
  });

  test('does not treat null reservation data without an error as an empty period', async () => {
    verifyAuth.mockResolvedValueOnce({ user: { restaurant_id: 'rest-1' } });
    mockTableData.reservations = { data: null, error: null };

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Analytics data temporarily unavailable' });
  });

  test('handler top-level catch (lines 235-236): calculateAnalytics throws', async () => {
    verifyAuth.mockResolvedValueOnce({
      user: { restaurant_id: 'rest-1', email: 'test@test.com' },
    });
    // Make getAllTables throw (not just return failure) to cause Promise.all to reject
    getAllTables.mockRejectedValueOnce(new Error('DB catastrophic failure'));

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Failed to calculate analytics' });
  });
});
