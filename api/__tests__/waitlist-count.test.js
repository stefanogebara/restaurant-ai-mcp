const mockFrom = jest.fn();

jest.mock('../_lib/db/clients', () => ({
  supabase: { from: mockFrom },
  supabaseAdmin: {},
  handleSupabaseResponse: jest.fn(() => ({ success: false })),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn() }),
}));

const { getWaitlistCount, getWaitlistEntries, getWaitlistStatusCounts } = require('../_lib/db/waitlist');

function countQuery(count) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ count, error: null }),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

beforeEach(() => jest.clearAllMocks());

test('counts both active statuses for exactly one restaurant', async () => {
  const query = countQuery(3);
  expect(await getWaitlistCount('rest-1')).toEqual({ success: true, count: 3 });
  expect(query.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
  expect(query.eq).toHaveBeenCalledWith('restaurant_id', 'rest-1');
  expect(query.in).toHaveBeenCalledWith('status', ['waiting', 'notified']);
});

test('preserves a real zero, but does not convert a missing count into zero', async () => {
  countQuery(0);
  expect(await getWaitlistCount('rest-1')).toEqual({ success: true, count: 0 });

  countQuery(null);
  expect(await getWaitlistCount('rest-1')).toEqual({ success: false, count: null });
});

test('filters the selected status before returning a bounded page and its exact total', async () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue({ data: [{ id: 'newest' }], count: 151, error: null }),
  };
  mockFrom.mockReturnValue(chain);
  expect(await getWaitlistEntries('rest-1', { status: 'seated', limit: 50, offset: 100, newestFirst: true })).toEqual({ success: true, entries: [{ id: 'newest' }], total: 151 });
  expect(chain.eq).toHaveBeenCalledWith('restaurant_id', 'rest-1');
  expect(chain.in).toHaveBeenCalledWith('status', ['seated']);
  expect(chain.select).toHaveBeenCalledWith(expect.any(String), { count: 'exact' });
  expect(chain.order).toHaveBeenCalledWith('added_at', { ascending: false });
  expect(chain.range).toHaveBeenCalledWith(100, 149);
});

test('counts each tab independently of the current page', async () => {
  const byStatus = { waiting: 3, seated: 125, cancelled: 18 };
  mockFrom.mockImplementation(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn(async (_column, statuses) => ({ count: byStatus[statuses[0]], error: null })),
  }));
  expect(await getWaitlistStatusCounts('rest-1')).toEqual({ success: true, counts: { active: 3, seated: 125, removed: 18 } });
});

test('prioritizes notified parties within the active queue before paging', async () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockResolvedValue({ data: [], count: 0, error: null }),
  };
  mockFrom.mockReturnValue(chain);
  await getWaitlistEntries('rest-1', { status: 'waiting,notified', limit: 50 });
  expect(chain.order.mock.calls.map(([column]) => column)).toEqual(['status', 'added_at', 'id']);
});
