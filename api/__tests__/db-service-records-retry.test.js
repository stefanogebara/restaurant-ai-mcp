/**
 * Tests that service record functions retry on transient Supabase errors.
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

const { getServiceRecords, getActiveServiceRecords, createServiceRecord, updateServiceRecord, deleteServiceRecord } = require('../_lib/db-service-records');

const SAMPLE_FIELDS = {
  'Service ID': 'SVC-001',
  'Customer Name': 'Bob',
  'Customer Phone': '+1234567890',
  'Party Size': 3,
  'Table IDs': ['table-uuid-1'],
  'Seated At': '2026-03-15T19:00:00Z',
};

describe('getServiceRecords withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const ROWS = [{ id: 'uuid-1', service_id: 'SVC-001', reservation_id: null, customer_name: 'Bob', customer_phone: null, party_size: 3, table_ids: [], seated_at: '2026-03-15T19:00:00Z', estimated_departure: null, actual_departure: null, special_requests: null, status: 'active' }];

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ROWS, error: null }));
    const result = await getServiceRecords('rest-1');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: ROWS, error: null });
    });

    const promise = getServiceRecords('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('econnreset')));
    const promise = getServiceRecords('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('getActiveServiceRecords withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const ROWS = [{ id: 'uuid-1', service_id: 'SVC-001', reservation_id: null, customer_name: 'Bob', customer_phone: null, party_size: 3, table_ids: [], seated_at: '2026-03-15T19:00:00Z', estimated_departure: null, special_requests: null, status: 'active' }];

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ROWS, error: null }));
    const result = await getActiveServiceRecords('rest-1');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: ROWS, error: null });
    });

    const promise = getActiveServiceRecords('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('timeout')));
    const promise = getActiveServiceRecords('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('createServiceRecord withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const ROW = { id: 'uuid-1', service_id: 'SVC-001', customer_name: 'Bob', status: 'active' };

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ROW, error: null }));
    const result = await createServiceRecord('rest-1', SAMPLE_FIELDS);
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: ROW, error: null });
    });

    const promise = createServiceRecord('rest-1', SAMPLE_FIELDS);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('503 service unavailable')));
    const promise = createServiceRecord('rest-1', SAMPLE_FIELDS);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('updateServiceRecord withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const ROW = { id: 'uuid-1', service_id: 'SVC-001', table_ids: [], status: 'completed' };

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ROW, error: null }));
    const result = await updateServiceRecord('rest-1', 'SVC-001', { 'Status': 'completed' });
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: ROW, error: null });
    });

    const promise = updateServiceRecord('rest-1', 'SVC-001', { 'Status': 'completed' });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('econnreset')));
    const promise = updateServiceRecord('rest-1', 'SVC-001', { 'Status': 'completed' });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('deleteServiceRecord withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [{ id: 'uuid-1' }], error: null }));
    const result = await deleteServiceRecord('rest-1', 'SVC-001');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: [{ id: 'uuid-1' }], error: null });
    });

    const promise = deleteServiceRecord('rest-1', 'SVC-001');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('timeout')));
    const promise = deleteServiceRecord('rest-1', 'SVC-001');
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

function makeRejectChain(err) {
  const rejected = Promise.reject(err);
  rejected.catch(() => {});
  const proxy = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (resolve, reject) => rejected.then(resolve, reject);
      return () => proxy;
    },
  });
  return proxy;
}
