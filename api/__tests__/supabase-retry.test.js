process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon';

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));

const { withRetry } = require('../_lib/supabase');

describe('withRetry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('returns result immediately on success', async () => {
    const fn = jest.fn().mockResolvedValue({ data: 'ok', error: null });
    const result = await withRetry(fn);
    expect(result).toEqual({ data: 'ok', error: null });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const transient = new Error('fetch failed: network error');
    const fn = jest.fn()
      .mockRejectedValueOnce(transient)
      .mockRejectedValueOnce(transient)
      .mockResolvedValue({ data: 'ok', error: null });

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    await jest.runAllTimersAsync();
    const result = await promise;
    expect(result).toEqual({ data: 'ok', error: null });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws after maxAttempts exhausted', async () => {
    const transient = new Error('503 Service Unavailable');
    const fn = jest.fn().mockRejectedValue(transient);

    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    await jest.runAllTimersAsync();
    await expect(promise).rejects.toThrow('503 Service Unavailable');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('does not retry non-transient errors', async () => {
    const authError = new Error('JWT expired');
    const fn = jest.fn().mockRejectedValue(authError);
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })).rejects.toThrow('JWT expired');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
