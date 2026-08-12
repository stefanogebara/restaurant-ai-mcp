/**
 * Tests for api/_lib/subscription-middleware.js
 *
 * Focus: the monthly reservation counter behind plan limits. Reservation
 * statuses are stored lowercase everywhere in this codebase (see
 * api/_lib/db/reservations.js), so the counter has to query lowercase or it
 * silently counts zero and plan limits stop being enforced.
 */

const mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/supabase', () => ({
  getSubscriptionByEmail: jest.fn(),
  supabaseAdmin: mockSupabaseAdmin,
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const { checkReservationLimits } = require('../_lib/subscription-middleware');

/**
 * Stand-in for a PostgREST query builder over a fixed set of rows.
 * Only `.in('status', […])` actually filters — that is what's under test.
 * The builder is thenable so `await query` resolves like supabase-js does.
 */
function mockReservationTable(rows) {
  const builder = {
    _rows: rows,
    select: jest.fn(() => builder),
    gte: jest.fn(() => builder),
    lte: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    in: jest.fn((column, values) => {
      if (column === 'status') {
        builder._rows = builder._rows.filter(r => values.includes(r.status));
      }
      return builder;
    }),
    then: (resolve) => resolve({ count: builder._rows.length, error: null }),
  };
  mockSupabaseAdmin.from.mockReturnValue(builder);
  return builder;
}

function makeReq(plan = 'starter', subscription = {}) {
  return {
    user: { restaurant_id: 'rest-1' },
    subscription: { plan_name: plan, ...subscription },
    customerEmail: 'owner@example.com',
  };
}

function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), setHeader: jest.fn() };
}

const rowsWithStatus = (status, qty) => Array.from({ length: qty }, () => ({ status }));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('checkReservationLimits: monthly counter', () => {
  test('counts reservations stored with lowercase statuses', async () => {
    mockReservationTable([
      ...rowsWithStatus('confirmed', 60),
      ...rowsWithStatus('seated', 20),
      ...rowsWithStatus('completed', 40),
    ]);

    const req = makeReq('starter');
    const res = makeRes();
    const next = jest.fn();

    await checkReservationLimits(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.reservationLimit.current).toBe(120);
  });

  test('flags overage once a Starter restaurant passes its monthly limit', async () => {
    mockReservationTable(rowsWithStatus('completed', 120)); // Starter allows 100

    const req = makeReq('starter');
    const res = makeRes();
    const next = jest.fn();

    await checkReservationLimits(req, res, next);

    expect(req.reservationLimit.allowed).toBe(false);
    expect(req.isOverage).toBe(true);
    expect(req.overageCount).toBe(21); // 120 - 100 + 1
    expect(next).toHaveBeenCalled();
  });

  test('excludes cancelled and no-show reservations from the count', async () => {
    mockReservationTable([
      ...rowsWithStatus('completed', 50),
      ...rowsWithStatus('cancelled', 30),
      ...rowsWithStatus('no-show', 15),
    ]);

    const req = makeReq('starter');
    const res = makeRes();

    await checkReservationLimits(req, res, jest.fn());

    expect(req.reservationLimit.current).toBe(50);
    expect(req.isOverage).toBeUndefined();
  });

  test('hard-blocks with 402 when the downgrade grace window has expired', async () => {
    mockReservationTable(rowsWithStatus('completed', 120));

    const expiredGrace = new Date(Date.now() - 86400000).toISOString();
    const req = makeReq('starter', { downgrade_grace_until: expiredGrace });
    const res = makeRes();
    const next = jest.fn();

    await checkReservationLimits(req, res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ used: 120, limit: 100 }));
    expect(next).not.toHaveBeenCalled();
  });

  test('skips counting entirely for the unlimited Scale plan', async () => {
    mockReservationTable(rowsWithStatus('completed', 5000));

    const req = makeReq('Scale'); // stored capitalised in subscriptions.plan_name
    const res = makeRes();
    const next = jest.fn();

    await checkReservationLimits(req, res, next);

    expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(req.isOverage).toBeUndefined();
  });
});

/**
 * The builder above deliberately only honours `.in('status', …)`. The counter
 * also scopes by restaurant_id and by the current-month date window, and a
 * regression in either would leak another tenant's bookings into a plan limit
 * (or bill the wrong month) without any status test noticing. This builder
 * applies all three filters so those two guarantees are pinned too.
 */
function mockFilteringTable(rows) {
  const filters = { statuses: null, from: null, to: null, restaurantId: undefined, eqColumn: null };
  const builder = {
    select: jest.fn(() => builder),
    gte: jest.fn((_col, value) => { filters.from = value; return builder; }),
    lte: jest.fn((_col, value) => { filters.to = value; return builder; }),
    in: jest.fn((_col, values) => { filters.statuses = values; return builder; }),
    // Record the column too: filtering the right value on the wrong column
    // would still isolate nothing, and a fake that ignores `col` would happily
    // pass while production leaked across tenants.
    eq: jest.fn((col, value) => { filters.eqColumn = col; filters.restaurantId = value; return builder; }),
    then: (resolve) => resolve({
      count: rows.filter(r => (
        r.date >= filters.from
        && r.date <= filters.to
        && filters.statuses.includes(r.status)
        && (filters.restaurantId === undefined || r.restaurant_id === filters.restaurantId)
      )).length,
      error: null,
    }),
  };
  mockSupabaseAdmin.from.mockReturnValue(builder);
  return builder;
}

/** Mid-month, so the local-time window the counter builds always contains it. */
function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
}

const row = (overrides = {}) => ({
  date: thisMonth(),
  status: 'confirmed',
  restaurant_id: 'rest-1',
  ...overrides,
});

/** A date in a month that is definitely not the current one. */
function otherMonth(offset) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 15);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
}

describe('checkReservationLimits: scoping of the monthly counter', () => {
  test("excludes another restaurant's reservations, filtering on restaurant_id", async () => {
    const builder = mockFilteringTable([row(), row({ restaurant_id: 'rest-2' })]);

    const req = makeReq('starter');
    await checkReservationLimits(req, makeRes(), jest.fn());

    expect(req.reservationLimit.current).toBe(1);
    expect(builder.eq).toHaveBeenCalledWith('restaurant_id', 'rest-1');
  });

  test('excludes reservations from the previous and the next month', async () => {
    mockFilteringTable([
      row(),
      row({ date: otherMonth(-1) }),
      row({ date: otherMonth(1) }),
    ]);

    const req = makeReq('starter');
    await checkReservationLimits(req, makeRes(), jest.fn());

    expect(req.reservationLimit.current).toBe(1);
  });

  test('counts nothing rather than every tenant when restaurant_id is missing', async () => {
    // An unscoped count would return all 3 rows — enough to 402 a customer over
    // other restaurants' bookings once a grace window has lapsed.
    mockFilteringTable([row(), row({ restaurant_id: 'rest-2' }), row({ restaurant_id: 'rest-3' })]);

    const req = makeReq('starter');
    req.user = {}; // authenticated, but no tenant resolved
    const next = jest.fn();

    await checkReservationLimits(req, makeRes(), next);

    expect(req.reservationLimit.current).toBe(0);
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
