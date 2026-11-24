var mockSupabaseAdmin = {
  from: jest.fn(),
};

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));

const { parsePeriod, aggregatePeriod, comparePeriods } = require('../_lib/periodCompare');

function mockChain(data) {
  const c = {
    select: jest.fn(),
    eq: jest.fn(),
    gte: jest.fn(),
    lte: jest.fn(),
  };
  c.select.mockReturnValue(c);
  c.eq.mockReturnValue(c);
  c.gte.mockReturnValue(c);
  c.lte.mockResolvedValue({ data, error: null });
  return c;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── parsePeriod ────────────────────────────────────────────────────────────

describe('parsePeriod', () => {
  const BASE = new Date('2025-03-12T12:00:00Z'); // Wednesday

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(BASE);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns last_7_days range', () => {
    const { from, to } = parsePeriod('last_7_days');
    expect(from).toBe('2025-03-05');
    expect(to).toBe('2025-03-12');
  });

  it('returns last_30_days range', () => {
    const { from, to } = parsePeriod('last_30_days');
    expect(from).toBe('2025-02-10');
    expect(to).toBe('2025-03-12');
  });

  it('returns this_week range (Mon–today)', () => {
    // Wednesday 2025-03-12 → week starts Monday 2025-03-10
    const { from, to } = parsePeriod('this_week');
    expect(from).toBe('2025-03-10');
    expect(to).toBe('2025-03-12');
  });

  it('returns last_week range (Mon–Sun)', () => {
    // Last week: 2025-03-03 (Mon) – 2025-03-09 (Sun)
    const { from, to } = parsePeriod('last_week');
    expect(from).toBe('2025-03-03');
    expect(to).toBe('2025-03-09');
  });

  it('returns this_month range', () => {
    const { from, to } = parsePeriod('this_month');
    expect(from).toBe('2025-03-01');
    expect(to).toBe('2025-03-12');
  });

  it('returns last_month range', () => {
    const { from, to } = parsePeriod('last_month');
    expect(from).toBe('2025-02-01');
    expect(to).toBe('2025-02-28');
  });

  it('throws on unknown label', () => {
    expect(() => parsePeriod('next_year')).toThrow('Unknown period: next_year');
  });
});

// ── aggregatePeriod ───────────────────────────────────────────────────────

describe('aggregatePeriod', () => {
  it('returns correct metrics for mixed status reservations', async () => {
    mockSupabaseAdmin.from.mockReturnValue(
      mockChain([
        { party_size: 4, status: 'confirmed' },
        { party_size: 2, status: 'no_show' },
        { party_size: 3, status: 'cancelled' },
        { party_size: 5, status: 'confirmed' },
      ])
    );

    const result = await aggregatePeriod('rest-1', '2025-03-01', '2025-03-07');

    expect(result).toEqual({
      from: '2025-03-01',
      to: '2025-03-07',
      reservations: 4,
      covers: 14,
      no_shows: 1,
      cancelled: 1,
      avg_party_size: 3.5,
    });
  });

  it('handles empty result with zero metrics', async () => {
    mockSupabaseAdmin.from.mockReturnValue(mockChain([]));

    const result = await aggregatePeriod('rest-1', '2025-03-01', '2025-03-07');

    expect(result.reservations).toBe(0);
    expect(result.covers).toBe(0);
    expect(result.avg_party_size).toBe(0);
  });
});

// ── comparePeriods ─────────────────────────────────────────────────────────

describe('comparePeriods', () => {
  it('returns period_a, period_b, and delta', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-03-12T12:00:00Z'));

    // aggregatePeriod called twice: last_week then this_week
    mockSupabaseAdmin.from
      .mockReturnValueOnce(
        mockChain([
          { party_size: 4, status: 'confirmed' },
          { party_size: 2, status: 'confirmed' },
        ])
      )
      .mockReturnValueOnce(
        mockChain([
          { party_size: 3, status: 'confirmed' },
          { party_size: 3, status: 'confirmed' },
          { party_size: 3, status: 'confirmed' },
        ])
      );

    const result = await comparePeriods('rest-1', 'last_week', 'this_week');

    expect(result.period_a.label).toBe('last_week');
    expect(result.period_a.reservations).toBe(2);
    expect(result.period_a.covers).toBe(6);

    expect(result.period_b.label).toBe('this_week');
    expect(result.period_b.reservations).toBe(3);
    expect(result.period_b.covers).toBe(9);

    expect(result.delta.covers).toBe(3);
    expect(result.delta.reservations).toBe(1);
    expect(result.delta.covers_pct).toBe(50); // (9-6)/6 * 100

    jest.useRealTimers();
  });
});
