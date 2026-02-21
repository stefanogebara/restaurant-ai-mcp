/**
 * Host Dashboard API Tests
 *
 * Tests all 14 actions: dashboard, check-in, check-walk-in, seat-party,
 * complete-service, mark-table-clean, update-table-status, update-reservation,
 * update-table-position, update-table-properties, link-tables, unlink-tables,
 * delete-table, create-table, auto-assign-shapes.
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

jest.mock('../_lib/sentry', () => ({
  captureException: jest.fn(),
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

// ---------------------------------------------------------------------------
// OPTIONS preflight
// ---------------------------------------------------------------------------
describe('OPTIONS preflight', () => {
  test('returns early when handlePreflight returns true', async () => {
    const { handlePreflight } = require('../_lib/cors');
    handlePreflight.mockReturnValueOnce(true);

    const { req, res } = mockReqRes({ action: 'dashboard', method: 'OPTIONS' });
    await dashboardHandler(req, res);

    expect(mockGetAllTables).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Dashboard error path
// ---------------------------------------------------------------------------
describe('Dashboard error paths', () => {
  test('returns 500 when getAllTables fails', async () => {
    mockGetAllTables.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({ action: 'dashboard', method: 'GET' });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('returns 500 when getActiveServiceRecords fails', async () => {
    mockGetActiveServiceRecords.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({ action: 'dashboard', method: 'GET' });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// check-walk-in
// ---------------------------------------------------------------------------
describe('POST check-walk-in action', () => {
  test('returns 400 when party_size is missing', async () => {
    const { req, res } = mockReqRes({ action: 'check-walk-in', body: {} });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Party size is required',
    }));
  });

  test('returns can_accommodate=true when tables are available', async () => {
    const { req, res } = mockReqRes({
      action: 'check-walk-in',
      body: { party_size: 2 },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(data.can_accommodate).toBe(true);
    expect(data.recommendation).toBeDefined();
  });

  test('returns can_accommodate=false when no tables match', async () => {
    mockFindBestTableCombination.mockReturnValueOnce([]);

    const { req, res } = mockReqRes({
      action: 'check-walk-in',
      body: { party_size: 20 },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.can_accommodate).toBe(false);
    expect(data.estimated_wait_time).toBeDefined();
  });

  test('filters by preferred_location when provided', async () => {
    const { req, res } = mockReqRes({
      action: 'check-walk-in',
      body: { party_size: 2, preferred_location: 'Main' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockFindBestTableCombination).toHaveBeenCalled();
  });

  test('returns 500 when getAllTables fails', async () => {
    mockGetAllTables.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      action: 'check-walk-in',
      body: { party_size: 2 },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// seat-party
// ---------------------------------------------------------------------------
describe('POST seat-party action', () => {
  const validSeatBody = {
    customer_name: 'Alice Smith',
    customer_phone: '+1234567890',
    party_size: 2,
    table_ids: ['t1'],
  };

  test('returns 400 when validation fails', async () => {
    const { validateServiceRecord } = require('../_lib/validation');
    validateServiceRecord.mockReturnValueOnce({ valid: false, errors: ['Name required'] });

    const { req, res } = mockReqRes({
      action: 'seat-party',
      body: { customer_name: '', party_size: 2, table_ids: ['t1'] },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Validation failed',
    }));
  });

  test('returns 400 when table UUID not found', async () => {
    const { req, res } = mockReqRes({
      action: 'seat-party',
      body: { ...validSeatBody, table_ids: ['nonexistent-uuid'] },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('not found'),
    }));
  });

  test('seats party successfully', async () => {
    const { req, res } = mockReqRes({
      action: 'seat-party',
      body: validSeatBody,
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(data.service_record_id).toBeDefined();
    expect(mockCreateServiceRecord).toHaveBeenCalled();
    expect(mockUpdateTable).toHaveBeenCalled();
  });

  test('rolls back service record when table update fails', async () => {
    mockUpdateTable.mockRejectedValueOnce(new Error('DB error'));

    const { req, res } = mockReqRes({
      action: 'seat-party',
      body: validSeatBody,
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockDeleteServiceRecord).toHaveBeenCalled();
    const data = res.json.mock.calls[0][0];
    expect(data.rollback_performed).toBe(true);
  });

  test('returns 500 when getAllTables fails during seat-party', async () => {
    mockGetAllTables.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      action: 'seat-party',
      body: validSeatBody,
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// mark-table-clean
// ---------------------------------------------------------------------------
describe('POST mark-table-clean action', () => {
  test('returns 400 when table_id is missing', async () => {
    const { req, res } = mockReqRes({ action: 'mark-table-clean', body: {} });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Table ID is required',
    }));
  });

  test('marks table as available successfully', async () => {
    const { req, res } = mockReqRes({
      action: 'mark-table-clean',
      body: { table_id: 't1' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateTable).toHaveBeenCalledWith(RESTAURANT_ID, 't1', { 'Status': 'available' });
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
  });

  test('returns 500 when DB update fails', async () => {
    mockUpdateTable.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      action: 'mark-table-clean',
      body: { table_id: 't1' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// update-table-status
// ---------------------------------------------------------------------------
describe('POST update-table-status action', () => {
  test('returns 400 when table_id or status missing', async () => {
    const { req, res } = mockReqRes({ action: 'update-table-status', body: { table_id: 't1' } });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 for invalid status', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-status',
      body: { table_id: 't1', status: 'invalid-status' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('Invalid status'),
    }));
  });

  test('updates status to available successfully', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-status',
      body: { table_id: 't1', status: 'available' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateTable).toHaveBeenCalledWith(RESTAURANT_ID, 't1', { 'Status': 'available' });
  });

  test('handles "being cleaned" status (maps space to underscore)', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-status',
      body: { table_id: 't1', status: 'being cleaned' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateTable).toHaveBeenCalledWith(RESTAURANT_ID, 't1', { 'Status': 'being_cleaned' });
  });

  test('returns 500 when DB update fails', async () => {
    mockUpdateTable.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      action: 'update-table-status',
      body: { table_id: 't1', status: 'occupied' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// update-reservation
// ---------------------------------------------------------------------------
describe('POST update-reservation action', () => {
  test('returns 400 when reservation_id is missing', async () => {
    const { req, res } = mockReqRes({ action: 'update-reservation', body: {} });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'reservation_id is required',
    }));
  });

  test('returns 404 when reservation not found', async () => {
    mockFindReservation.mockResolvedValueOnce({ success: false, reservation: null });

    const { req, res } = mockReqRes({
      action: 'update-reservation',
      body: { reservation_id: 'RES-GONE' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('updates reservation notes successfully', async () => {
    mockFindReservation.mockResolvedValueOnce({
      success: true,
      reservation: { reservation_id: 'RES-001', record_id: 'rec-001' },
    });

    const { req, res } = mockReqRes({
      action: 'update-reservation',
      body: {
        reservation_id: 'RES-001',
        dietary_restrictions: 'vegetarian',
        language_preference: 'Spanish',
        first_time_visitor: true,
      },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateReservation).toHaveBeenCalledWith(
      RESTAURANT_ID,
      'rec-001',
      expect.objectContaining({ dietary_restrictions: 'vegetarian', first_time_visitor: true })
    );
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
  });

  test('returns 500 when updateReservation fails', async () => {
    mockFindReservation.mockResolvedValueOnce({
      success: true,
      reservation: { reservation_id: 'RES-001', record_id: 'rec-001' },
    });
    mockUpdateReservation.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({
      action: 'update-reservation',
      body: { reservation_id: 'RES-001', internal_notes: 'VIP' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ---------------------------------------------------------------------------
// update-table-position (floor plan editor)
// ---------------------------------------------------------------------------
describe('POST update-table-position action', () => {
  test('returns 400 when table_id is missing', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-position',
      body: { position_x: 10, position_y: 20 },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'table_id is required',
    }));
  });

  test('returns 400 when position_x or position_y is missing', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-position',
      body: { table_id: 't1', position_x: 10 },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'position_x and position_y are required',
    }));
  });

  test('updates position successfully', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-position',
      body: { table_id: 't1', position_x: 100, position_y: 200 },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateTableConfig).toHaveBeenCalledWith(
      RESTAURANT_ID,
      't1',
      expect.objectContaining({ position_x: 100, position_y: 200 })
    );
  });

  test('includes optional width, height, rotation when provided', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-position',
      body: { table_id: 't1', position_x: 50, position_y: 75, width: 120, height: 80, rotation: 45 },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateTableConfig).toHaveBeenCalledWith(
      RESTAURANT_ID,
      't1',
      expect.objectContaining({ width: 120, height: 80, rotation: 45 })
    );
  });

  test('returns 400 when updateTableConfig fails', async () => {
    mockUpdateTableConfig.mockResolvedValueOnce({ success: false, message: 'Not found' });

    const { req, res } = mockReqRes({
      action: 'update-table-position',
      body: { table_id: 't1', position_x: 10, position_y: 20 },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// update-table-properties (floor plan editor)
// ---------------------------------------------------------------------------
describe('POST update-table-properties action', () => {
  test('returns 400 when table_id is missing', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-properties',
      body: { shape: 'round' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'table_id is required',
    }));
  });

  test('returns 400 when no properties provided', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-properties',
      body: { table_id: 't1' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('At least one property'),
    }));
  });

  test('returns 400 for invalid shape', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-properties',
      body: { table_id: 't1', shape: 'triangle' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('shape must be one of'),
    }));
  });

  test('returns 400 for capacity out of range', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-properties',
      body: { table_id: 't1', capacity: 25 },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringContaining('capacity must be a number between 1 and 20'),
    }));
  });

  test('updates shape and capacity successfully', async () => {
    const { req, res } = mockReqRes({
      action: 'update-table-properties',
      body: { table_id: 't1', shape: 'round', capacity: 4, is_joinable: true },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUpdateTableConfig).toHaveBeenCalledWith(
      RESTAURANT_ID,
      't1',
      expect.objectContaining({ shape: 'round', capacity: 4, is_joinable: true })
    );
  });
});

// ---------------------------------------------------------------------------
// link-tables
// ---------------------------------------------------------------------------
describe('POST link-tables action', () => {
  test('returns 400 when table_id or linked_table_id is missing', async () => {
    const { req, res } = mockReqRes({
      action: 'link-tables',
      body: { table_id: 't1' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'table_id and linked_table_id are required',
    }));
  });

  test('returns 400 when linking table to itself', async () => {
    const { req, res } = mockReqRes({
      action: 'link-tables',
      body: { table_id: 't1', linked_table_id: 't1' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Cannot link a table to itself',
    }));
  });

  test('links tables successfully', async () => {
    mockLinkTables.mockResolvedValueOnce({
      success: true,
      message: 'Tables linked',
      linked: ['t1', 't2'],
    });

    const { req, res } = mockReqRes({
      action: 'link-tables',
      body: { table_id: 't1', linked_table_id: 't2' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockLinkTables).toHaveBeenCalledWith(RESTAURANT_ID, 't1', 't2');
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
  });

  test('returns 400 when linkTables fails', async () => {
    mockLinkTables.mockResolvedValueOnce({ success: false, message: 'Already linked' });

    const { req, res } = mockReqRes({
      action: 'link-tables',
      body: { table_id: 't1', linked_table_id: 't2' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// unlink-tables
// ---------------------------------------------------------------------------
describe('POST unlink-tables action', () => {
  test('returns 400 when required fields are missing', async () => {
    const { req, res } = mockReqRes({
      action: 'unlink-tables',
      body: { table_id: 't1' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'table_id and linked_table_id are required',
    }));
  });

  test('unlinks tables successfully', async () => {
    mockUnlinkTables.mockResolvedValueOnce({
      success: true,
      message: 'Tables unlinked',
      unlinked: ['t1', 't2'],
    });

    const { req, res } = mockReqRes({
      action: 'unlink-tables',
      body: { table_id: 't1', linked_table_id: 't2' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockUnlinkTables).toHaveBeenCalledWith(RESTAURANT_ID, 't1', 't2');
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
  });

  test('returns 400 when unlinkTables fails', async () => {
    mockUnlinkTables.mockResolvedValueOnce({ success: false, message: 'Not linked' });

    const { req, res } = mockReqRes({
      action: 'unlink-tables',
      body: { table_id: 't1', linked_table_id: 't2' },
    });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// delete-table
// ---------------------------------------------------------------------------
describe('POST delete-table action', () => {
  test('returns 400 when table_id is missing', async () => {
    const { req, res } = mockReqRes({ action: 'delete-table', body: {} });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'table_id is required',
    }));
  });

  test('returns 404 when table not found', async () => {
    mockGetTableById.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({ action: 'delete-table', body: { table_id: 'nonexistent' } });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Table not found',
    }));
  });

  test('returns 400 when table is currently occupied', async () => {
    mockGetTableById.mockResolvedValueOnce({
      success: true,
      table: { id: 't1', table_number: 1, status: 'occupied' },
    });

    const { req, res } = mockReqRes({ action: 'delete-table', body: { table_id: 't1' } });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Cannot delete a table that is currently occupied',
    }));
  });

  test('deletes table successfully', async () => {
    mockDeleteTable.mockResolvedValueOnce({ success: true, table_number: 5, message: 'Table 5 deleted' });

    const { req, res } = mockReqRes({ action: 'delete-table', body: { table_id: 't1' } });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockDeleteTable).toHaveBeenCalledWith(RESTAURANT_ID, 't1');
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(data.table_number).toBe(5);
  });

  test('returns 400 when deleteTable fails', async () => {
    mockDeleteTable.mockResolvedValueOnce({ success: false, message: 'Constraint violation' });

    const { req, res } = mockReqRes({ action: 'delete-table', body: { table_id: 't1' } });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ---------------------------------------------------------------------------
// auto-assign-shapes
// ---------------------------------------------------------------------------
describe('POST auto-assign-shapes action', () => {
  test('returns 200 with updated=0 when no tables exist', async () => {
    mockGetAllTables.mockResolvedValueOnce({ success: true, tables: [] });

    const { req, res } = mockReqRes({ action: 'auto-assign-shapes', body: {} });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    expect(data.updated).toBe(0);
  });

  test('assigns shapes based on capacity', async () => {
    mockGetAllTables.mockResolvedValueOnce({
      success: true,
      tables: [
        { id: 'ta', table_number: 1, capacity: 2 },
        { id: 'tb', table_number: 2, capacity: 4 },
        { id: 'tc', table_number: 3, capacity: 6 },
        { id: 'td', table_number: 4, capacity: 8 },
        { id: 'te', table_number: 5, capacity: 1 },
      ],
    });

    const { req, res } = mockReqRes({ action: 'auto-assign-shapes', body: {} });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];
    expect(data.success).toBe(true);
    // Capacity 2 → round, capacity 1 → bar-stool, capacity 8 → rectangle
    const shapes = data.shapes.reduce((acc, s) => { acc[s.table_number] = s.shape; return acc; }, {});
    expect(shapes[1]).toBe('round');      // capacity 2
    expect(shapes[5]).toBe('bar-stool'); // capacity 1
    expect(shapes[4]).toBe('rectangle'); // capacity 8
  });

  test('returns 500 when getAllTables fails', async () => {
    mockGetAllTables.mockResolvedValueOnce({ success: false });

    const { req, res } = mockReqRes({ action: 'auto-assign-shapes', body: {} });
    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
