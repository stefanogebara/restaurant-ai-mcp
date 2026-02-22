/**
 * Tests that waitlist functions retry on transient Supabase errors.
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

const { getWaitlistEntries, addToWaitlist, updateWaitlistEntry, removeFromWaitlist, getWaitlistCount } = require('../_lib/db-waitlist');

const ENTRY = { id: 'uuid-1', waitlist_id: 'WAIT-20260315-123', customer_name: 'Carol', customer_phone: '+1234567890', party_size: 2, notes: null, estimated_wait_minutes: 15, status: 'waiting', added_at: '2026-03-15T19:00:00Z' };

describe('getWaitlistEntries withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [ENTRY], error: null }));
    const result = await getWaitlistEntries('rest-1');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: [ENTRY], error: null });
    });

    const promise = getWaitlistEntries('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('econnreset')));
    const promise = getWaitlistEntries('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('addToWaitlist withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const ENTRY_INPUT = { customer_name: 'Carol', customer_phone: '+1234567890', party_size: 2, estimated_wait_minutes: 15 };

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ENTRY, error: null }));
    const result = await addToWaitlist('rest-1', ENTRY_INPUT);
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: ENTRY, error: null });
    });

    const promise = addToWaitlist('rest-1', ENTRY_INPUT);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('timeout')));
    const promise = addToWaitlist('rest-1', ENTRY_INPUT);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('updateWaitlistEntry withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: { ...ENTRY, status: 'notified' }, error: null }));
    const result = await updateWaitlistEntry('uuid-1', 'rest-1', { status: 'notified' });
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: { ...ENTRY, status: 'notified' }, error: null });
    });

    const promise = updateWaitlistEntry('uuid-1', 'rest-1', { status: 'notified' });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('econnreset')));
    const promise = updateWaitlistEntry('uuid-1', 'rest-1', { status: 'notified' });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('removeFromWaitlist withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: [ENTRY], error: null }));
    const result = await removeFromWaitlist('uuid-1', 'rest-1');
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ data: [ENTRY], error: null });
    });

    const promise = removeFromWaitlist('uuid-1', 'rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('503 service unavailable')));
    const promise = removeFromWaitlist('uuid-1', 'rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('getWaitlistCount withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ count: 3, error: null }));
    const result = await getWaitlistCount('rest-1');
    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transientErr = new Error('fetch failed: network error');
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount < 3) return makeRejectChain(transientErr);
      return makeChain({ count: 3, error: null });
    });

    const promise = getWaitlistCount('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('timeout')));
    const promise = getWaitlistCount('rest-1');
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
