const mockFrom = jest.fn();

jest.mock('../_lib/db/clients', () => ({
  supabase: { from: mockFrom },
  supabaseAdmin: {},
  handleSupabaseResponse: jest.fn(() => ({ success: false })),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn() }),
}));

const { getWaitlistCount } = require('../_lib/db/waitlist');

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
