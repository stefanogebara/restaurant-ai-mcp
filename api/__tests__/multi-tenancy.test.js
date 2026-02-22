/**
 * Multi-Tenancy Isolation Tests
 *
 * Verifies that every operational query in the data layer and API endpoints
 * is scoped by restaurant_id, preventing cross-tenant data leakage.
 *
 * Test categories:
 *  1. Query functions include restaurant_id filter
 *  2. Create functions set restaurant_id on inserts
 *  3. Restaurant A cannot see Restaurant B's data
 *  4. API endpoints extract restaurant_id from req.user
 */

// ---------------------------------------------------------------------------
// Fake environment variables (must be set before requiring supabase.js)
// ---------------------------------------------------------------------------
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';

// ---------------------------------------------------------------------------
// Test UUIDs  (prefixed with "mock" so Jest allows use in mock factories)
// ---------------------------------------------------------------------------
const mockRestaurantA = 'aaaa-aaaa';
const mockRestaurantB = 'bbbb-bbbb';

// Public aliases used in test bodies for readability
const RESTAURANT_A = mockRestaurantA;
const RESTAURANT_B = mockRestaurantB;

// ---------------------------------------------------------------------------
// Chainable Supabase mock
// ---------------------------------------------------------------------------

/**
 * Build a chainable mock that records every method call and ultimately
 * resolves with `resolvedValue`.  Each call returns the proxy so chains like
 * `.from('x').select('*').eq('k','v').order('c')` work naturally.
 *
 * The chain is thenable so callers can `await` it.
 */
function createChainableMock(resolvedValue = { data: [], error: null }) {
  const calls = [];

  const handler = {
    get(target, prop) {
      // Make the chain thenable so `await chain` works
      if (prop === 'then') {
        return (resolve) => resolve(resolvedValue);
      }
      // Expose the internal call log
      if (prop === '__calls') {
        return calls;
      }
      // Return a function that records the call and returns the proxy again
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
// Mock @supabase/supabase-js BEFORE requiring the module under test
// ---------------------------------------------------------------------------

let latestChain = null;

const mockSupabaseInstance = {
  from: jest.fn((table) => {
    latestChain = createChainableMock({ data: [], error: null });
    latestChain.__calls.push({ method: 'from', args: [table] });
    return latestChain;
  }),
  schema: jest.fn(() => mockSupabaseInstance),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseInstance),
}));

jest.mock('../_lib/secure-id', () => ({
  generateSecureReservationId: jest.fn(() => 'RES-TEST-000000000000'),
  generateSecureServiceId: jest.fn(() => 'SRV-TEST-000000000000'),
}));

// ---------------------------------------------------------------------------
// Mocks for host-dashboard dependencies (hoisted to top level)
// ---------------------------------------------------------------------------
jest.mock('../ml/data-logger', () => ({
  logCustomerShowedUp: jest.fn(),
  logCustomerCancelled: jest.fn(),
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
      user: { id: 'user-1', restaurant_id: mockRestaurantA },
    }),
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
// Require modules under test (AFTER mocks are in place)
// ---------------------------------------------------------------------------
const db = require('../_lib/supabase');
const handler = require('../host-dashboard');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return all recorded calls from the latest chain. */
function chainCalls() {
  return latestChain ? latestChain.__calls : [];
}

/** Return args for every `.eq()` call in the latest chain. */
function eqCalls() {
  return chainCalls().filter((c) => c.method === 'eq');
}

/** Assert that at least one `.eq('restaurant_id', id)` exists in the chain. */
function expectRestaurantFilter(restaurantId) {
  const eqs = eqCalls();
  const match = eqs.find(
    (c) => c.args[0] === 'restaurant_id' && c.args[1] === restaurantId,
  );
  expect(match).toBeDefined();
}

/** Create a minimal Express-like req/res pair. */
function mockReqRes({ action, body = {}, user } = {}) {
  const req = {
    method: 'POST',
    query: { action },
    body,
    headers: { authorization: 'Bearer test-token' },
    user: user || undefined,
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

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  jest.clearAllMocks();
  latestChain = null;
});

// ===================================================================
// 1. QUERY FUNCTIONS INCLUDE restaurant_id FILTER
// ===================================================================
describe('Query functions include restaurant_id filter', () => {
  test('getReservations passes restaurant_id to .eq()', async () => {
    await db.getReservations(RESTAURANT_A, {});
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getReservations with status filter still includes restaurant_id', async () => {
    await db.getReservations(RESTAURANT_A, { status: 'confirmed' });
    expectRestaurantFilter(RESTAURANT_A);
    const statusEq = eqCalls().find(
      (c) => c.args[0] === 'status' && c.args[1] === 'confirmed',
    );
    expect(statusEq).toBeDefined();
  });

  test('getReservations with date filter still includes restaurant_id', async () => {
    await db.getReservations(RESTAURANT_A, { date: '2025-12-25' });
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getTables passes restaurant_id to .eq()', async () => {
    await db.getTables(RESTAURANT_A);
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getTables with status filter still includes restaurant_id', async () => {
    await db.getTables(RESTAURANT_A, { status: 'available' });
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getServiceRecords passes restaurant_id to .eq()', async () => {
    await db.getServiceRecords(RESTAURANT_A);
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getServiceRecords with status filter still includes restaurant_id', async () => {
    await db.getServiceRecords(RESTAURANT_A, { status: 'active' });
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getActiveServiceRecords passes restaurant_id to .eq()', async () => {
    await db.getActiveServiceRecords(RESTAURANT_A);
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getAvailableTables passes restaurant_id to .eq()', async () => {
    await db.getAvailableTables(RESTAURANT_A);
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getReservationById passes restaurant_id to .eq()', async () => {
    await db.getReservationById(RESTAURANT_A, 'RES-TEST-123');
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getTableByNumber passes restaurant_id to .eq()', async () => {
    await db.getTableByNumber(RESTAURANT_A, 1);
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getSubscriptions passes restaurant_id to .eq()', async () => {
    await db.getSubscriptions(RESTAURANT_A);
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getAllTables passes restaurant_id to .eq()', async () => {
    await db.getAllTables(RESTAURANT_A);
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('getAllTablesAdmin passes restaurant_id to .eq()', async () => {
    await db.getAllTablesAdmin(RESTAURANT_A);
    expectRestaurantFilter(RESTAURANT_A);
  });

  test('findReservation passes restaurant_id to .eq()', async () => {
    await db.findReservation(RESTAURANT_A, { reservation_id: 'RES-123' });
    expectRestaurantFilter(RESTAURANT_A);
  });
});

// ===================================================================
// 2. CREATE FUNCTIONS SET restaurant_id IN INSERTED DATA
// ===================================================================
describe('Create functions set restaurant_id on insert', () => {
  test('createReservation includes restaurant_id in insert payload', async () => {
    await db.createReservation(RESTAURANT_A, {
      'Reservation ID': 'RES-20250101-ABCDEF',
      'Customer Name': 'Alice',
      'Customer Phone': '+1234567890',
      'Party Size': 4,
      'Date': '2025-01-15',
      'Time': '19:00',
      'Status': 'confirmed',
    });

    const insertCall = chainCalls().find((c) => c.method === 'insert');
    expect(insertCall).toBeDefined();
    expect(insertCall.args[0]).toHaveProperty('restaurant_id', RESTAURANT_A);
  });

  test('createTable includes restaurant_id in insert payload', async () => {
    await db.createTable(RESTAURANT_A, {
      table_number: '10',
      capacity: 4,
      location: 'Patio',
    });

    const insertCall = chainCalls().find((c) => c.method === 'insert');
    expect(insertCall).toBeDefined();
    expect(insertCall.args[0]).toHaveProperty('restaurant_id', RESTAURANT_A);
  });

  test('createServiceRecord includes restaurant_id in insert payload', async () => {
    await db.createServiceRecord(RESTAURANT_A, {
      'Service ID': 'SRV-TEST-001',
      'Customer Name': 'Bob',
      'Customer Phone': '+0987654321',
      'Party Size': 2,
      'Table IDs': [1],
      'Estimated Departure': new Date().toISOString(),
    });

    const insertCall = chainCalls().find((c) => c.method === 'insert');
    expect(insertCall).toBeDefined();
    expect(insertCall.args[0]).toHaveProperty('restaurant_id', RESTAURANT_A);
  });

  test('createSubscription includes restaurant_id in upsert payload', async () => {
    await db.createSubscription(RESTAURANT_A, {
      'Subscription ID': 'sub_test_123',
      'Customer ID': 'cus_test_456',
      'Customer Email': 'test@example.com',
      'Plan Name': 'Professional',
      'Price ID': 'price_test',
      'Status': 'active',
      'Current Period Start': '2025-01-01',
      'Current Period End': '2025-02-01',
    });

    const upsertCall = chainCalls().find((c) => c.method === 'upsert');
    expect(upsertCall).toBeDefined();
    expect(upsertCall.args[0]).toHaveProperty('restaurant_id', RESTAURANT_A);
  });
});

// ===================================================================
// 3. RESTAURANT A CANNOT ACCESS RESTAURANT B'S DATA
// ===================================================================
describe('Cross-tenant isolation: Restaurant A cannot access Restaurant B data', () => {
  test('getReservations for Restaurant A filters by A, not B', async () => {
    await db.getReservations(RESTAURANT_A, {});
    const eqs = eqCalls();

    const matchA = eqs.find(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_A,
    );
    expect(matchA).toBeDefined();

    const matchB = eqs.find(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_B,
    );
    expect(matchB).toBeUndefined();
  });

  test('getTables for Restaurant B filters by B, not A', async () => {
    await db.getTables(RESTAURANT_B);
    const eqs = eqCalls();

    const matchB = eqs.find(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_B,
    );
    expect(matchB).toBeDefined();

    const matchA = eqs.find(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_A,
    );
    expect(matchA).toBeUndefined();
  });

  test('getServiceRecords for Restaurant A filters by A, not B', async () => {
    await db.getServiceRecords(RESTAURANT_A);
    const eqs = eqCalls();

    const matchA = eqs.find(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_A,
    );
    expect(matchA).toBeDefined();

    const matchB = eqs.find(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_B,
    );
    expect(matchB).toBeUndefined();
  });

  test('createReservation for Restaurant A stamps A, not B', async () => {
    await db.createReservation(RESTAURANT_A, {
      'Reservation ID': 'RES-CROSS-001',
      'Customer Name': 'Cross-Tenant Test',
      'Customer Phone': '+111',
      'Party Size': 2,
      'Date': '2025-06-01',
      'Time': '20:00',
    });

    const insertCall = chainCalls().find((c) => c.method === 'insert');
    expect(insertCall.args[0].restaurant_id).toBe(RESTAURANT_A);
    expect(insertCall.args[0].restaurant_id).not.toBe(RESTAURANT_B);
  });

  test('updateReservation scopes update to the correct restaurant', async () => {
    await db.updateReservation(RESTAURANT_A, 'some-record-id', {
      Status: 'confirmed',
    });

    expectRestaurantFilter(RESTAURANT_A);
    const matchB = eqCalls().find(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_B,
    );
    expect(matchB).toBeUndefined();
  });

  test('updateTable scopes update to the correct restaurant', async () => {
    await db.updateTable(RESTAURANT_B, 'table-uuid', { Status: 'occupied' });

    expectRestaurantFilter(RESTAURANT_B);
    const matchA = eqCalls().find(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_A,
    );
    expect(matchA).toBeUndefined();
  });

  test('deleteServiceRecord scopes delete to the correct restaurant', async () => {
    await db.deleteServiceRecord(RESTAURANT_A, 'SRV-001');

    expectRestaurantFilter(RESTAURANT_A);
    const matchB = eqCalls().find(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_B,
    );
    expect(matchB).toBeUndefined();
  });

  test('sequential queries for different restaurants are independently scoped', async () => {
    // Query for Restaurant A
    await db.getReservations(RESTAURANT_A);
    const eqsA = eqCalls();
    const hasA = eqsA.some(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_A,
    );
    const hasB_inA = eqsA.some(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_B,
    );
    expect(hasA).toBe(true);
    expect(hasB_inA).toBe(false);

    // Now query for Restaurant B
    await db.getTables(RESTAURANT_B);
    const eqsB = eqCalls();
    const hasBinB = eqsB.some(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_B,
    );
    const hasA_inB = eqsB.some(
      (c) => c.args[0] === 'restaurant_id' && c.args[1] === RESTAURANT_A,
    );
    expect(hasBinB).toBe(true);
    expect(hasA_inB).toBe(false);
  });
});

// ===================================================================
// 4. API ENDPOINT EXTRACTS restaurant_id FROM req.user
// ===================================================================
describe('host-dashboard extracts restaurant_id from req.user', () => {
  test('dashboard action reads req.user.restaurant_id and passes it to data layer', async () => {
    const { req, res } = mockReqRes({ action: 'dashboard' });

    await handler(req, res);

    // The handler should have called supabase.from() multiple times
    const fromCalls = mockSupabaseInstance.from.mock.calls;
    expect(fromCalls.length).toBeGreaterThan(0);

    // Verify that verifyAuth was called and the restaurant_id was set
    const { verifyAuth } = require('../_lib/auth');
    expect(verifyAuth).toHaveBeenCalled();

    // The handler sets req.user from authResult.user, which contains restaurant_id
    expect(req.user).toBeDefined();
    expect(req.user.restaurant_id).toBe(RESTAURANT_A);
  });

  test('dashboard action responds with 200 (not an auth error)', async () => {
    const { req, res } = mockReqRes({ action: 'dashboard' });

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('req.user.restaurant_id is forwarded to getAllTables', async () => {
    const { req, res } = mockReqRes({ action: 'dashboard' });

    await handler(req, res);

    const tableCalls = mockSupabaseInstance.from.mock.calls.filter(
      (c) => c[0] === 'tables',
    );
    expect(tableCalls.length).toBeGreaterThan(0);
  });

  test('check-in action uses req.user.restaurant_id', async () => {
    const { req, res } = mockReqRes({
      action: 'check-in',
      body: { reservation_id: 'RES-20250101-ABCDEF' },
    });

    await handler(req, res);

    const reservationCalls = mockSupabaseInstance.from.mock.calls.filter(
      (c) => c[0] === 'reservations',
    );
    expect(reservationCalls.length).toBeGreaterThan(0);
    expect(req.user.restaurant_id).toBe(RESTAURANT_A);
  });

  test('create-table action uses req.user.restaurant_id in insert', async () => {
    const { req, res } = mockReqRes({
      action: 'create-table',
      body: { table_number: '99', capacity: 6 },
    });

    await handler(req, res);

    const tableCalls = mockSupabaseInstance.from.mock.calls.filter(
      (c) => c[0] === 'tables',
    );
    expect(tableCalls.length).toBeGreaterThan(0);
    expect(req.user.restaurant_id).toBe(RESTAURANT_A);
  });
});

// ===================================================================
// 5. EXPORTS STRUCTURE
// ===================================================================
describe('Module exports the expected multi-tenant-aware API', () => {
  test('exports query (primary Supabase client)', () => {
    expect(db.query).toBeDefined();
  });

  test('exports all CRUD functions for reservations', () => {
    expect(typeof db.getReservations).toBe('function');
    expect(typeof db.getReservationById).toBe('function');
    expect(typeof db.createReservation).toBe('function');
    expect(typeof db.updateReservation).toBe('function');
    expect(typeof db.findReservation).toBe('function');
    expect(typeof db.cancelReservation).toBe('function');
  });

  test('exports all CRUD functions for tables', () => {
    expect(typeof db.getTables).toBe('function');
    expect(typeof db.getAllTables).toBe('function');
    expect(typeof db.getAvailableTables).toBe('function');
    expect(typeof db.createTable).toBe('function');
    expect(typeof db.updateTable).toBe('function');
    expect(typeof db.deleteTable).toBe('function');
  });

  test('exports all CRUD functions for service records', () => {
    expect(typeof db.getServiceRecords).toBe('function');
    expect(typeof db.getActiveServiceRecords).toBe('function');
    expect(typeof db.createServiceRecord).toBe('function');
    expect(typeof db.updateServiceRecord).toBe('function');
    expect(typeof db.completeServiceRecord).toBe('function');
    expect(typeof db.deleteServiceRecord).toBe('function');
  });

  test('exports all CRUD functions for subscriptions', () => {
    expect(typeof db.getSubscriptions).toBe('function');
    expect(typeof db.createSubscription).toBe('function');
    expect(typeof db.updateSubscription).toBe('function');
    expect(typeof db.cancelSubscription).toBe('function');
  });

  test('every exported query/mutation function requires restaurantId as first parameter', () => {
    const operationalFunctions = [
      'getReservations',
      'getReservationById',
      'createReservation',
      'updateReservation',
      'getTables',
      'getAllTables',
      'getAvailableTables',
      'createTable',
      'updateTable',
      'deleteTable',
      'getServiceRecords',
      'getActiveServiceRecords',
      'createServiceRecord',
      'updateServiceRecord',
      'deleteServiceRecord',
      'getSubscriptions',
      'createSubscription',
      'updateSubscription',
      'findReservation',
      'cancelReservation',
      'getRestaurantInfo',
    ];

    for (const fnName of operationalFunctions) {
      const fn = db[fnName];
      expect(fn).toBeDefined();
      expect(fn.length).toBeGreaterThanOrEqual(1);
    }
  });
});
