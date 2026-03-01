const mockFrom = jest.fn();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: mockFrom },
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

const { getRestaurantSnapshot } = require('../services/restaurantSnapshot');

beforeEach(() => jest.clearAllMocks());

function mockChain(data) {
  const chain = { select: jest.fn(), eq: jest.fn(), gte: jest.fn(), order: jest.fn(), limit: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.gte.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockResolvedValue({ data, error: null });
  return chain;
}

it('returns snapshot with upcoming reservations and active parties', async () => {
  mockFrom.mockImplementation((table) => {
    if (table === 'reservations') return mockChain([{ id: 'r1', guest_name: 'Ana', party_size: 2, reservation_time: '2026-03-01T19:00:00Z', status: 'confirmed' }]);
    if (table === 'waitlist') return mockChain([]);
    if (table === 'service_records') return mockChain([{ id: 's1', guest_name: 'Bob', party_size: 3, table_id: 't1' }]);
    return mockChain([]);
  });

  const snap = await getRestaurantSnapshot('rest-1');
  expect(snap).toHaveProperty('upcoming_reservations');
  expect(snap).toHaveProperty('active_parties');
  expect(snap).toHaveProperty('waitlist_count');
  expect(snap.active_parties).toHaveLength(1);
});
