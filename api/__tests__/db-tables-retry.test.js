/**
 * Tests that table functions retry on transient Supabase errors.
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

const { getTables, getAvailableTables, getTableByNumber, updateTable, createTable, getTableById, getAllTables, getAllTablesAdmin, deleteTable } = require('../_lib/db-tables');

const TABLE_ROW = { id: 'uuid-1', table_number: 1, capacity: 4, location: 'Main', status: 'available', is_active: true, current_service_id: null, shape: 'square', is_fixed_seating: false, is_joinable: true, joinable_with: [], position_x: 0, position_y: 0, width: 1, height: 1, rotation: 0, is_fixed: false, min_capacity: 1, max_capacity: null, adjacent_tables: [], combination_group: null };

describe('getTables withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [TABLE_ROW], error: null }));
    const result = await getTables('rest-1');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: [TABLE_ROW], error: null });
    });

    const promise = getTables('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('econnreset')));
    const promise = getTables('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('getAvailableTables withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [TABLE_ROW], error: null }));
    const result = await getAvailableTables('rest-1');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: [TABLE_ROW], error: null });
    });

    const promise = getAvailableTables('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('timeout')));
    const promise = getAvailableTables('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('getTableByNumber withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: TABLE_ROW, error: null }));
    const result = await getTableByNumber('rest-1', 1);
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: TABLE_ROW, error: null });
    });

    const promise = getTableByNumber('rest-1', 1);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('econnreset')));
    const promise = getTableByNumber('rest-1', 1);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('updateTable withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const ROW = { id: 'uuid-1', table_number: 1, status: 'occupied' };

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ROW, error: null }));
    const result = await updateTable('rest-1', 'uuid-1', { 'Status': 'occupied' });
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

    const promise = updateTable('rest-1', 'uuid-1', { 'Status': 'occupied' });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('503 service unavailable')));
    const promise = updateTable('rest-1', 'uuid-1', { 'Status': 'occupied' });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('createTable withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const FIELDS = { table_number: 5, capacity: 4, location: 'Main' };

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: TABLE_ROW, error: null }));
    const result = await createTable('rest-1', FIELDS);
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: TABLE_ROW, error: null });
    });

    const promise = createTable('rest-1', FIELDS);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('econnreset')));
    const promise = createTable('rest-1', FIELDS);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('getTableById withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: TABLE_ROW, error: null }));
    const result = await getTableById('rest-1', 'uuid-1');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: TABLE_ROW, error: null });
    });

    const promise = getTableById('rest-1', 'uuid-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('timeout')));
    const promise = getTableById('rest-1', 'uuid-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('getAllTables withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [TABLE_ROW], error: null }));
    const result = await getAllTables('rest-1');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: [TABLE_ROW], error: null });
    });

    const promise = getAllTables('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('econnreset')));
    const promise = getAllTables('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('getAllTablesAdmin withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [TABLE_ROW], error: null }));
    const result = await getAllTablesAdmin('rest-1');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: [TABLE_ROW], error: null });
    });

    const promise = getAllTablesAdmin('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('timeout')));
    const promise = getAllTablesAdmin('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('deleteTable withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const ROW = { id: 'uuid-1', table_number: 1, is_active: false };

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ROW, error: null }));
    const result = await deleteTable('rest-1', 'uuid-1');
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

    const promise = deleteTable('rest-1', 'uuid-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('econnreset')));
    const promise = deleteTable('rest-1', 'uuid-1');
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
