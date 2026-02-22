/**
 * Tests that createReservation retries on transient Supabase errors.
 */
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon';

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));

// Use REAL withRetry but mock the Supabase client
const mockFrom = jest.fn();

jest.mock('../_lib/db-clients', () => {
  const actual = jest.requireActual('../_lib/db-clients');
  return {
    ...actual,
    supabase: { from: (...args) => mockFrom(...args) },
  };
});

const { createReservation, updateReservation } = require('../_lib/db-reservations');

const SAMPLE_FIELDS = {
  'Reservation ID': 'RES-001',
  'Customer Name': 'Alice',
  'Customer Phone': '+1234567890',
  'Customer Email': 'alice@test.com',
  'Party Size': 2,
  'Date': '2026-03-15',
  'Time': '19:00',
};

describe('createReservation withRetry integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt with no retries', async () => {
    const row = { id: 'uuid-1', reservation_id: 'RES-001', customer_name: 'Alice', status: 'pending' };
    mockFrom.mockReturnValue(makeChain({ data: row, error: null }));
    const result = await createReservation('rest-1', SAMPLE_FIELDS);
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    const row = { id: 'uuid-1', reservation_id: 'RES-001', customer_name: 'Alice', status: 'pending' };
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: row, error: null });
    });

    const promise = createReservation('rest-1', SAMPLE_FIELDS);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    const transientErr = new Error('503 service unavailable');
    Object.assign(transientErr, { status: 503 });
    mockFrom.mockReturnValue(makeRejectChain(transientErr));

    const promise = createReservation('rest-1', SAMPLE_FIELDS, { maxAttempts: 3, baseDelayMs: 10 });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('updateReservation withRetry integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt with no retries', async () => {
    const row = { id: 'uuid-1', reservation_id: 'RES-001', status: 'confirmed' };
    mockFrom.mockReturnValue(makeChain({ data: row, error: null }));
    const result = await updateReservation('rest-1', 'uuid-1', { 'Status': 'confirmed' });
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    const row = { id: 'uuid-1', reservation_id: 'RES-001', status: 'confirmed' };
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: row, error: null });
    });

    const promise = updateReservation('rest-1', 'uuid-1', { 'Status': 'confirmed' });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    const transientErr = new Error('econnreset');
    mockFrom.mockReturnValue(makeRejectChain(transientErr));

    const promise = updateReservation('rest-1', 'uuid-1', { 'Status': 'confirmed' });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

function makeChain(result) {
  const proxy = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve(result);
      return () => proxy;
    },
  });
  return proxy;
}

// Simulates a real network-level failure where the Supabase client throws
// (e.g. fetch failed / connection refused) rather than returning { error }.
// Returns a thenable that behaves like a rejected Promise.
function makeRejectChain(err) {
  const rejected = Promise.reject(err);
  // Suppress unhandled rejection warning; withRetry will catch it.
  rejected.catch(() => {});
  const proxy = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (resolve, reject) => rejected.then(resolve, reject);
      return () => proxy;
    },
  });
  return proxy;
}
