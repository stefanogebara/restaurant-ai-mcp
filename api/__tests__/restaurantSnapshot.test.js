const mockFrom = jest.fn();
const mockSchema = jest.fn();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: mockFrom, schema: mockSchema },
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

const { getRestaurantSnapshot } = require('../services/restaurantSnapshot');

beforeEach(() => {
  jest.clearAllMocks();
  // Default: schema().from() returns appropriate chains per table
  const emptyLtvChain = { select: jest.fn(), eq: jest.fn(), in: jest.fn() };
  emptyLtvChain.select.mockReturnValue(emptyLtvChain);
  emptyLtvChain.eq.mockReturnValue(emptyLtvChain);
  emptyLtvChain.in.mockResolvedValue({ data: [], error: null });
  const defaultConfigChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
  defaultConfigChain.select.mockReturnValue(defaultConfigChain);
  defaultConfigChain.eq.mockReturnValue(defaultConfigChain);
  defaultConfigChain.single.mockResolvedValue({ data: { staffing_config: null }, error: null });
  mockSchema.mockReturnValue({
    from: jest.fn().mockImplementation((table) => {
      if (table === 'restaurant_config') return defaultConfigChain;
      return emptyLtvChain;
    }),
  });
});

function mockChain(data) {
  const chain = { select: jest.fn(), eq: jest.fn(), gte: jest.fn(), not: jest.fn(), in: jest.fn(), order: jest.fn(), limit: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.gte.mockReturnValue(chain);
  chain.not.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.limit.mockResolvedValue({ data, error: null });
  return chain;
}

function mockDepositChain(data) {
  const chain = { select: jest.fn(), eq: jest.fn(), not: jest.fn(), in: jest.fn(), gte: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.not.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.gte.mockResolvedValue({ data, error: null });
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
  let reservationCallCount = 0;
  mockFrom.mockImplementation((table) => {
    if (table === 'reservations') {
      reservationCallCount += 1;
      if (reservationCallCount === 1) return mockChain([{ id: 'r1', guest_name: 'Ana', party_size: 2, reservation_time: '2026-03-01T19:00:00Z', date: '2026-03-01', status: 'confirmed' }]);
      return mockDepositChain([]);
    }
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
  let reservationCallCount = 0;
  mockFrom.mockImplementation((table) => {
    if (table === 'reservations') {
      reservationCallCount += 1;
      if (reservationCallCount === 1) return mockChain([]);
      return mockDepositChain([]);
    }
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

it('enriches upcoming reservations with is_regular and customer_tier when phone matches LTV', async () => {
  let reservationCallCount = 0;
  mockFrom.mockImplementation((table) => {
    if (table === 'reservations') {
      reservationCallCount += 1;
      if (reservationCallCount === 1) {
        return mockChain([{ id: 'r1', guest_name: 'John', party_size: 2, reservation_time: '2026-03-01T19:00:00Z', date: '2026-03-01', status: 'confirmed', customer_phone: '+353861234567' }]);
      }
      return mockDepositChain([]);
    }
    if (table === 'waitlist') {
      const countChain = { select: jest.fn(), eq: jest.fn(), limit: jest.fn() };
      countChain.select.mockReturnValue(countChain);
      countChain.eq.mockReturnValue(countChain);
      countChain.limit.mockResolvedValue({ data: null, count: 0, error: null });
      return countChain;
    }
    if (table === 'service_records') return mockChain([]);
    if (table === 'restaurant_config') return mockSingleChain({ staffing_config: null });
    return mockChain([]);
  });

  const ltvChain = { select: jest.fn(), eq: jest.fn(), in: jest.fn() };
  ltvChain.select.mockReturnValue(ltvChain);
  ltvChain.eq.mockReturnValue(ltvChain);
  ltvChain.in.mockResolvedValue({ data: [{ customer_phone: '+353861234567', customer_tier: 'vip', total_visits: 14, avg_revenue_per_visit: 65 }], error: null });
  const configChain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
  configChain.select.mockReturnValue(configChain);
  configChain.eq.mockReturnValue(configChain);
  configChain.single.mockResolvedValue({ data: { staffing_config: null }, error: null });
  mockSchema.mockReturnValue({
    from: jest.fn().mockImplementation((table) => {
      if (table === 'restaurant_config') return configChain;
      return ltvChain;
    }),
  });

  const snap = await getRestaurantSnapshot('rest-1');
  const r = snap.upcoming_reservations[0];
  expect(r.is_regular).toBe(true);
  expect(r.customer_tier).toBe('vip');
  expect(r.visit_count).toBe(14);
});

it('marks is_regular false when reservation has no customer_phone', async () => {
  let reservationCallCount = 0;
  mockFrom.mockImplementation((table) => {
    if (table === 'reservations') {
      reservationCallCount += 1;
      if (reservationCallCount === 1) {
        return mockChain([{ id: 'r1', guest_name: 'Anonymous', party_size: 2, reservation_time: '2026-03-01T19:00:00Z', date: '2026-03-01', status: 'confirmed', customer_phone: null }]);
      }
      return mockDepositChain([]);
    }
    if (table === 'waitlist') {
      const countChain = { select: jest.fn(), eq: jest.fn(), limit: jest.fn() };
      countChain.select.mockReturnValue(countChain);
      countChain.eq.mockReturnValue(countChain);
      countChain.limit.mockResolvedValue({ data: null, count: 0, error: null });
      return countChain;
    }
    if (table === 'service_records') return mockChain([]);
    if (table === 'restaurant_config') return mockSingleChain({ staffing_config: null });
    return mockChain([]);
  });

  const snap = await getRestaurantSnapshot('rest-1');
  expect(snap.upcoming_reservations[0].is_regular).toBe(false);
});

it('getVIPsForToday returns regulars booked for today', async () => {
  const { getVIPsForToday } = require('../services/restaurantSnapshot');

  let fromCallCount = 0;
  mockFrom.mockImplementation(() => {
    fromCallCount++;
    if (fromCallCount === 1) {
      const c = { select: jest.fn(), eq: jest.fn(), not: jest.fn(), in: jest.fn() };
      c.select.mockReturnValue(c);
      c.eq.mockReturnValue(c);
      c.not.mockReturnValue(c);
      c.in.mockResolvedValue({ data: [{ customer_phone: '+353861234567', guest_name: 'John' }], error: null });
      return c;
    }
    return mockChain([]);
  });

  const ltvChain = { select: jest.fn(), eq: jest.fn(), in: jest.fn() };
  ltvChain.select.mockReturnValue(ltvChain);
  ltvChain.eq.mockReturnValue(ltvChain);
  ltvChain.in.mockResolvedValue({ data: [{ customer_phone: '+353861234567', customer_name: 'John', customer_tier: 'vip', total_visits: 14 }], error: null });
  mockSchema.mockReturnValue({ from: jest.fn().mockReturnValue(ltvChain) });

  const vips = await getVIPsForToday('rest-1');
  expect(vips).toHaveLength(1);
  expect(vips[0].customer_tier).toBe('vip');
});
