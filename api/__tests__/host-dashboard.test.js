/**
 * Host Dashboard API Tests
 *
 * Tests dashboard, check-in, seat-party, complete-service, create-table actions.
 * Follows multi-tenancy.test.js mock pattern.
 */

// ---------------------------------------------------------------------------
// Fake environment
// ---------------------------------------------------------------------------
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';

const RESTAURANT_ID = 'rest-dashboard-001';

// ---------------------------------------------------------------------------
// Chainable Supabase mock for supabase query
// ---------------------------------------------------------------------------
function mockCreateChainableMock(resolvedValue = { data: null, error: null }) {
  const calls = [];
  const handler = {
    get(target, prop) {
      if (prop === 'then') return (resolve) => resolve(resolvedValue);
      if (prop === '__calls') return calls;
      return (...args) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };
  const proxy = new Proxy({}, handler);
  return proxy;
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockGetAllTables = jest.fn(() =>
  Promise.resolve({
    success: true,
    tables: [
      { id: 't1', table_number: 1, capacity: 4, location: 'Main', status: 'available', is_fixed: false, is_joinable: true, shape: 'square' },
      { id: 't2', table_number: 2, capacity: 2, location: 'Patio', status: 'occupied', is_fixed: false, is_joinable: true, shape: 'round' },
    ],
  })
);

const mockGetActiveServiceRecords = jest.fn(() =>
  Promise.resolve({
    success: true,
    service_records: [
      {
        service_id: 'SRV-001',
        customer_name: 'Alice',
        customer_phone: '+1111',
        party_size: 2,
        table_ids: '2',
        seated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        estimated_departure: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    ],
  })
);

const mockGetUpcomingReservations = jest.fn(() =>
  Promise.resolve({
    success: true,
    reservations: [
      { reservation_id: 'RES-001', customer_name: 'Bob', party_size: 4, time: '19:00', date: '2026-03-15' },
    ],
  })
);

const mockFindReservation = jest.fn(() =>
  Promise.resolve({
    success: true,
    reservation: {
      reservation_id: 'RES-001',
      customer_name: 'Bob',
      party_size: 4,
    },
  })
);

const mockUpdateReservation = jest.fn(() => Promise.resolve({ success: true }));
const mockCreateServiceRecord = jest.fn(() => Promise.resolve({ success: true }));
const mockUpdateServiceRecord = jest.fn(() =>
  Promise.resolve({
    success: true,
    service_record: { reservation_id: 'RES-001', table_ids: '1', seated_at: new Date().toISOString() },
  })
);
const mockDeleteServiceRecord = jest.fn(() => Promise.resolve({ success: true }));
const mockUpdateTable = jest.fn(() =>
  Promise.resolve({ success: true, data: { fields: { 'Table Number': 1 } } })
);
const mockGenerateServiceId = jest.fn(() => 'SRV-TEST-001');
const mockFindBestTableCombination = jest.fn(() => [
  { tables: [{ id: 't1', table_number: 1, capacity: 4 }], totalCapacity: 4, waste: 0 },
]);
const mockCanAccommodateParty = jest.fn(() => true);
const mockCreateTable = jest.fn(() =>
  Promise.resolve({ success: true, table: { id: 't3', table_number: 3 } })
);
const mockUpdateTableConfig = jest.fn(() => Promise.resolve({ success: true, table: {} }));
const mockDeleteTable = jest.fn(() => Promise.resolve({ success: true, table_number: 1 }));
const mockLinkTables = jest.fn(() => Promise.resolve({ success: true }));
const mockUnlinkTables = jest.fn(() => Promise.resolve({ success: true }));
const mockGetTableById = jest.fn(() =>
  Promise.resolve({ success: true, table: { id: 't1', table_number: 1, status: 'available' } })
);

jest.mock('../_lib/supabase', () => ({
  getAllTables: mockGetAllTables,
  getActiveServiceRecords: mockGetActiveServiceRecords,
  getUpcomingReservations: mockGetUpcomingReservations,
  findReservation: mockFindReservation,
  updateReservation: mockUpdateReservation,
  createServiceRecord: mockCreateServiceRecord,
  updateServiceRecord: mockUpdateServiceRecord,
  deleteServiceRecord: mockDeleteServiceRecord,
  updateTable: mockUpdateTable,
  generateServiceId: mockGenerateServiceId,
  findBestTableCombination: mockFindBestTableCombination,
  canAccommodateParty: mockCanAccommodateParty,
  createTable: mockCreateTable,
  updateTableConfig: mockUpdateTableConfig,
  deleteTable: mockDeleteTable,
  linkTables: mockLinkTables,
  unlinkTables: mockUnlinkTables,
  getTableById: mockGetTableById,
  query: {
    schema: jest.fn(() => ({
      from: jest.fn(() => mockCreateChainableMock({ data: { slug: 'test-restaurant' }, error: null })),
    })),
  },
}));

jest.mock('../ml/data-logger', () => ({
  logCustomerShowedUp: jest.fn(() => Promise.resolve()),
  logCustomerCancelled: jest.fn(() => Promise.resolve()),
}));

jest.mock('../_lib/validation', () => ({
  validateServiceRecord: jest.fn(() => ({ valid: true, errors: [] })),
  sanitizeInput: jest.fn((v) => v),
  validateWaitlistEntry: jest.fn(() => ({ valid: true, errors: [] })),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(() =>
    Promise.resolve({
      user: { id: 'user-1', restaurant_id: RESTAURANT_ID, timezone: 'UTC' },
    })
  ),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('../_lib/constants', () => ({
  getDiningDuration: jest.fn(() => 90),
  DEFAULT_DINING_DURATION_MINUTES: 90,
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
const dashboardHandler = require('../host-dashboard');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockReqRes({ action, method = 'POST', body = {} } = {}) {
  const req = {
    method,
    query: { action },
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

describe('GET dashboard action', () => {
  test('returns tables, active parties, and reservations', async () => {
    const { req, res } = mockReqRes({ action: 'dashboard', method: 'GET' });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockGetAllTables).toHaveBeenCalledWith(RESTAURANT_ID);
    expect(mockGetActiveServiceRecords).toHaveBeenCalledWith(RESTAURANT_ID);
    expect(mockGetUpcomingReservations).toHaveBeenCalledWith(RESTAURANT_ID, 'UTC');

    const responseData = res.json.mock.calls[0][0];
    expect(responseData.tables).toBeDefined();
    expect(responseData.active_parties).toBeDefined();
    expect(responseData.upcoming_reservations).toBeDefined();
    expect(responseData.summary).toBeDefined();
    expect(responseData.summary.total_capacity).toBe(6);
  });

  test('dashboard summary calculates occupancy correctly', async () => {
    const { req, res } = mockReqRes({ action: 'dashboard', method: 'GET' });

    await dashboardHandler(req, res);

    const summary = res.json.mock.calls[0][0].summary;
    expect(summary.total_capacity).toBe(6);
    expect(summary.active_parties).toBe(1);
    expect(summary.upcoming_reservations).toBe(1);
  });
});

describe('POST check-in action', () => {
  test('checks in a reservation and recommends tables', async () => {
    const { req, res } = mockReqRes({
      action: 'check-in',
      body: { reservation_id: 'RES-001' },
    });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockFindReservation).toHaveBeenCalledWith(RESTAURANT_ID, { reservation_id: 'RES-001' });
  });

  test('rejects check-in without reservation_id', async () => {
    const { req, res } = mockReqRes({
      action: 'check-in',
      body: {},
    });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 404 when reservation not found', async () => {
    mockFindReservation.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      action: 'check-in',
      body: { reservation_id: 'RES-NONEXISTENT' },
    });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('POST complete-service action', () => {
  test('completes a service and frees tables', async () => {
    const { req, res } = mockReqRes({
      action: 'complete-service',
      body: { service_record_id: 'SRV-001' },
    });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateServiceRecord).toHaveBeenCalledWith(
      RESTAURANT_ID,
      'SRV-001',
      expect.objectContaining({ Status: 'completed' })
    );
  });

  test('rejects without service_record_id', async () => {
    const { req, res } = mockReqRes({
      action: 'complete-service',
      body: {},
    });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('POST create-table action', () => {
  test('creates a new table', async () => {
    const { req, res } = mockReqRes({
      action: 'create-table',
      body: { table_number: 10, capacity: 6 },
    });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockCreateTable).toHaveBeenCalledWith(
      RESTAURANT_ID,
      expect.objectContaining({
        table_number: '10',
        capacity: 6,
      })
    );
  });

  test('rejects create-table without table_number', async () => {
    const { req, res } = mockReqRes({
      action: 'create-table',
      body: { capacity: 4 },
    });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects create-table without capacity', async () => {
    const { req, res } = mockReqRes({
      action: 'create-table',
      body: { table_number: 10 },
    });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('Invalid action', () => {
  test('returns 400 for unknown action', async () => {
    const { req, res } = mockReqRes({ action: 'nonexistent_action' });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('Authentication', () => {
  test('returns 401 without auth', async () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    const { req, res } = mockReqRes({ action: 'dashboard' });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('Rate limiting', () => {
  test('returns early when rate limited', async () => {
    const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
    checkAndApplyRateLimit.mockResolvedValueOnce(true);

    const { req, res } = mockReqRes({ action: 'dashboard' });

    await dashboardHandler(req, res);

    expect(mockGetAllTables).not.toHaveBeenCalled();
  });
});
