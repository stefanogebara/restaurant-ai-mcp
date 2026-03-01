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

function mockSingleChain(data) {
  const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.single.mockResolvedValue({ data, error: null });
  return chain;
}

it('returns snapshot with upcoming reservations and active parties', async () => {
  mockFrom.mockImplementation((table) => {
    if (table === 'reservations') return mockChain([{ id: 'r1', guest_name: 'Ana', party_size: 2, reservation_time: '2026-03-01T19:00:00Z', date: '2026-03-01', status: 'confirmed' }]);
    if (table === 'waitlist') {
      const countChain = { select: jest.fn(), eq: jest.fn(), limit: jest.fn() };
      countChain.select.mockReturnValue(countChain);
      countChain.eq.mockReturnValue(countChain);
      countChain.limit.mockResolvedValue({ data: null, count: 3, error: null });
      return countChain;
    }
    if (table === 'service_records') return mockChain([{ id: 's1', guest_name: 'Bob', party_size: 3, table_id: 't1' }]);
    if (table === 'restaurant_config') return mockSingleChain({ staffing_config: { roles: [{ name: 'FOH', covers_per_staff: 15 }] } });
    return mockChain([]);
  });

  const snap = await getRestaurantSnapshot('rest-1');
  expect(snap).toHaveProperty('upcoming_reservations');
  expect(snap).toHaveProperty('active_parties');
  expect(snap).toHaveProperty('waitlist_count');
  expect(snap.active_parties).toHaveLength(1);
  expect(snap.waitlist_count).toBe(3);
});

it('includes staffing_forecast with role headcounts', async () => {
  mockFrom.mockImplementation((table) => {
    if (table === 'reservations') return mockChain([]);
    if (table === 'waitlist') {
      const countChain = { select: jest.fn(), eq: jest.fn(), limit: jest.fn() };
      countChain.select.mockReturnValue(countChain);
      countChain.eq.mockReturnValue(countChain);
      countChain.limit.mockResolvedValue({ data: null, count: 0, error: null });
      return countChain;
    }
    if (table === 'service_records') return mockChain([]);
    if (table === 'restaurant_config') return mockSingleChain({ staffing_config: { roles: [{ name: 'FOH', covers_per_staff: 15 }] } });
    return mockChain([]);
  });

  const snap = await getRestaurantSnapshot('rest-1');
  expect(snap).toHaveProperty('staffing_forecast');
  expect(snap.staffing_forecast).toHaveLength(3);
  expect(snap.staffing_forecast[0].roles[0].name).toBe('FOH');
});
