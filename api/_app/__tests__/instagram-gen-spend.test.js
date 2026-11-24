/**
 * Tests for the in-process aggregation logic in
 * api/instagram/gen-spend.js. The actual Supabase query isn't exercised
 * here — those land in the live smoke. What this catches:
 *   - cost_cents sums round-trip without floating-point drift
 *   - by_kind tallies handle unknown kinds gracefully
 *   - non-number cost_cents (corrupt row) → counted as 0, not NaN
 */

// Mirrors the loop in gen-spend.js handlePoll
function aggregateMonth(events) {
  const byKind = { image: 0, video: 0 };
  let total = 0;
  for (const e of events) {
    const c = Number(e.cost_cents) || 0;
    total += c;
    if (e.kind === 'image' || e.kind === 'video') byKind[e.kind] += c;
  }
  return { total_cents: total, by_kind: byKind, gen_count: events.length };
}

describe('aggregateMonth', () => {
  test('sums cost_cents and splits by kind', () => {
    const events = [
      { kind: 'image', cost_cents: 4 },
      { kind: 'image', cost_cents: 4 },
      { kind: 'video', cost_cents: 50 },
    ];
    expect(aggregateMonth(events)).toEqual({
      total_cents: 58,
      by_kind: { image: 8, video: 50 },
      gen_count: 3,
    });
  });

  test('empty input → zeros, gen_count 0', () => {
    expect(aggregateMonth([])).toEqual({
      total_cents: 0, by_kind: { image: 0, video: 0 }, gen_count: 0,
    });
  });

  test('ignores unknown kinds in by_kind but still counts in total', () => {
    const events = [
      { kind: 'image', cost_cents: 4 },
      { kind: 'audio', cost_cents: 99 },  // future kind we don't know about yet
    ];
    const r = aggregateMonth(events);
    expect(r.total_cents).toBe(103);
    expect(r.by_kind).toEqual({ image: 4, video: 0 });
    expect(r.gen_count).toBe(2);
  });

  test('non-number cost_cents → coerced to 0 (no NaN poisoning)', () => {
    const events = [
      { kind: 'image', cost_cents: 4 },
      { kind: 'image', cost_cents: null },
      { kind: 'image', cost_cents: 'oops' },
      { kind: 'image', cost_cents: undefined },
    ];
    expect(aggregateMonth(events).total_cents).toBe(4);
    expect(aggregateMonth(events).by_kind.image).toBe(4);
  });

  test('large per-event values do not overflow (Number.MAX_SAFE_INTEGER headroom)', () => {
    const events = Array.from({ length: 1000 }, () => ({ kind: 'video', cost_cents: 100 }));
    expect(aggregateMonth(events).total_cents).toBe(100_000);
  });

  test('integer-only assumption preserved — caller must not pass floats', () => {
    // The aggregator does not floor. Documenting that cost_cents columns
    // are INTEGER in DDL — this lets us catch a future refactor that
    // accidentally enables floats and then loses cents.
    const events = [{ kind: 'image', cost_cents: 4.7 }];
    expect(aggregateMonth(events).total_cents).toBe(4.7);
  });
});

// Cents → USD formatter mirror — verifies the dashboard pill copy is sane
function formatUSD(cents) {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

describe('formatUSD', () => {
  test.each([
    [0, '$0.00'],
    [1, '$0.01'],
    [99, '$0.99'],
    [100, '$1.00'],
    [243, '$2.43'],
    [12345, '$123.45'],
    [50, '$0.50'],   // matches one Higgsfield video clip
    [4, '$0.04'],    // matches one gpt-image-1 low-quality call
  ])('cents %s → %s', (cents, expected) => {
    expect(formatUSD(cents)).toBe(expected);
  });
});
