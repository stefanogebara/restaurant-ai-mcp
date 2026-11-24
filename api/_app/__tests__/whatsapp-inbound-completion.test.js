'use strict';

const mockRows = new Set();
let mockError = null;
const mockFrom = jest.fn(() => ({
  select: () => ({ eq: (_field, key) => ({ maybeSingle: async () =>
    mockError ? { data: null, error: mockError } :
      { data: mockRows.has(key) ? { message_id: key } : null, error: null } }) }),
  insert: async ({ message_id: key }) => {
    if (mockError) return { error: mockError };
    if (mockRows.has(key)) return { error: { code: '23505' } };
    mockRows.add(key);
    return { error: null };
  },
  delete: () => ({ eq: async (_field, key) => {
    if (mockError) return { error: mockError };
    mockRows.delete(key);
    return { error: null };
  } }),
}));
jest.mock('../_lib/central-supabase', () => ({ centralSupabase: { from: mockFrom } }));

const { completionKey, wasCompleted, markCompleted, claimRateCount,
  hasSendAttempt, reserveSendAttempt, releaseRejectedSend } = require('../_lib/channels/inbound-completion');
const A = { provider: 'meta', receiver: '11111111111' };
const B = { provider: 'meta', receiver: '22222222222' };

beforeEach(() => { mockRows.clear(); mockError = null; jest.clearAllMocks(); });

test('the same provider message ID is completed separately for A and B', async () => {
  expect(completionKey(A, 'wamid.same')).not.toBe(completionKey(B, 'wamid.same'));
  expect(await wasCompleted(A, 'wamid.same')).toBe(false);
  await markCompleted(A, 'wamid.same');
  expect(await wasCompleted(A, 'wamid.same')).toBe(true);
  expect(await wasCompleted(B, 'wamid.same')).toBe(false);
  await expect(markCompleted(A, 'wamid.same')).resolves.toBeUndefined();
});

test('database failures fail closed rather than consuming or replaying a message', async () => {
  mockError = { code: '08006' };
  await expect(wasCompleted(A, 'wamid.failed')).rejects.toThrow('lookup failed');
  await expect(markCompleted(A, 'wamid.failed')).rejects.toThrow('write failed');
  expect(mockRows.size).toBe(0);
});

test('provider retries do not consume a second rate-limit slot', async () => {
  expect(await claimRateCount(A, 'wamid.retry')).toBe(true);
  expect(await claimRateCount(A, 'wamid.retry')).toBe(false);
  expect(await claimRateCount(B, 'wamid.retry')).toBe(true);
  expect(await wasCompleted(A, 'wamid.retry')).toBe(false);
});

test('pre-send marker survives completion failure and can only be released after a known rejection', async () => {
  expect(await hasSendAttempt(A, 'wamid.send')).toBe(false);
  await reserveSendAttempt(A, 'wamid.send');
  expect(await hasSendAttempt(A, 'wamid.send')).toBe(true);
  mockError = { code: '08006' };
  await expect(markCompleted(A, 'wamid.send')).rejects.toThrow('write failed');
  mockError = null;
  expect(await hasSendAttempt(A, 'wamid.send')).toBe(true);
  await releaseRejectedSend(A, 'wamid.send');
  expect(await hasSendAttempt(A, 'wamid.send')).toBe(false);
});
