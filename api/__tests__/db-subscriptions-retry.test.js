/**
 * Tests that subscription functions retry on transient Supabase errors.
 */
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon';

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));

// Use REAL withRetry but mock the Supabase client
// schema('restaurant').from(...) and from(...) both route through mockFrom
const mockFrom = jest.fn();

jest.mock('../_lib/db-clients', () => {
  const actual = jest.requireActual('../_lib/db-clients');
  return {
    ...actual,
    supabase: {
      from: (...args) => mockFrom(...args),
      schema: () => ({ from: (...args) => mockFrom(...args) }),
    },
  };
});

const { getRestaurantInfo, getSubscriptions, createSubscription, updateSubscription } = require('../_lib/db-subscriptions');

describe('getRestaurantInfo withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const ROW = { id: 'rest-1', restaurant_name: 'The Test Place', phone: null, email: null, address: null, business_hours: null, avg_dining_duration_minutes: 90, timezone: 'Europe/Madrid' };

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ROW, error: null }));
    const result = await getRestaurantInfo('rest-1');
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

    const promise = getRestaurantInfo('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('econnreset')));
    const promise = getRestaurantInfo('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('getSubscriptions withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const ROWS = [{ id: 'uuid-1', subscription_id: 'sub_001', customer_id: 'cus_001', customer_email: 'a@test.com', plan_name: 'growth', price_id: 'price_001', status: 'active', current_period_start: null, current_period_end: null, trial_end: null, canceled_at: null, created_at: null }];

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ROWS, error: null }));
    const result = await getSubscriptions('rest-1');
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

    const promise = getSubscriptions('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('timeout')));
    const promise = getSubscriptions('rest-1');
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('createSubscription withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const ROW = { id: 'uuid-1', subscription_id: 'sub_001', status: 'active' };
  const FIELDS = {
    'Subscription ID': 'sub_001',
    'Customer ID': 'cus_001',
    'Customer Email': 'a@test.com',
    'Plan Name': 'growth',
    'Price ID': 'price_001',
    'Status': 'active',
  };

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ROW, error: null }));
    const result = await createSubscription('rest-1', FIELDS);
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

    const promise = createSubscription('rest-1', FIELDS);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('503 service unavailable')));
    const promise = createSubscription('rest-1', FIELDS);
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(false);
  });
});

describe('updateSubscription withRetry integration', () => {
  beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
  afterEach(() => jest.useRealTimers());

  const ROW = { id: 'uuid-1', subscription_id: 'sub_001', status: 'canceled' };

  test('succeeds on first attempt', async () => {
    mockFrom.mockReturnValue(makeChain({ data: ROW, error: null }));
    const result = await updateSubscription('rest-1', 'sub_001', { 'Status': 'canceled' });
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

    const promise = updateSubscription('rest-1', 'sub_001', { 'Status': 'canceled' });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  test('fails after maxAttempts exhausted', async () => {
    mockFrom.mockReturnValue(makeRejectChain(new Error('econnreset')));
    const promise = updateSubscription('rest-1', 'sub_001', { 'Status': 'canceled' });
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
