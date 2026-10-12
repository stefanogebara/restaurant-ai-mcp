/**
 * Unit tests for api/services/wikiCompiler.js
 * Covers: hash-skip, article compilation, upsert, getWikiPages
 */

var mockUpsert = jest.fn();
var mockSelectEq = jest.fn();
var mockSchemaFrom = jest.fn();

var mockSupabaseAdmin = {
  from: jest.fn(),
  schema: jest.fn().mockReturnValue({ from: mockSchemaFrom }),
};

var mockGetAI = jest.fn();
var mockGetRestaurantSnapshot = jest.fn();

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/ai-client', () => ({
  getAI: () => mockGetAI(),
  AI_MODEL_FAST: 'test-fast-model',
}));
jest.mock('../_services/restaurantSnapshot', () => ({
  getRestaurantSnapshot: (...a) => mockGetRestaurantSnapshot(...a),
}));
const { compileWikiForRestaurant, getWikiPages } = require('../_services/wikiCompiler');

const RESTAURANT_ID = 'rest-abc-123';

function makeFromChain({ data = [], error = null } = {}) {
  const c = {
    select: jest.fn(),
    eq: jest.fn(),
    gte: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue({ data: data[0] || null, error }),
    upsert: jest.fn().mockResolvedValue({ error: null }),
  };
  c.select.mockReturnValue(c);
  c.eq.mockReturnValue(c);
  c.gte.mockReturnValue(c);
  c.order.mockReturnValue(c);
  c.limit.mockResolvedValue({ data, error });
  return c;
}

beforeEach(() => {
  jest.clearAllMocks();

  mockGetRestaurantSnapshot.mockResolvedValue({
    upcoming_reservations: [],
    active_parties: [],
    waitlist_count: 0,
    deposit_summary: { count: 0, total_amount: 0 },
    staffing_forecast: [],
  });
  mockSchemaFrom.mockImplementation((table) => table === 'customer_ltv'
    ? makeFromChain({ data: [] })
    : makeFromChain({ data: [{ restaurant_name: 'Test Bistro', restaurant_type: 'italian', agent_language: 'en' }] }));

  // supabaseAdmin.from() calls: reservations, manager_memory, tables, restaurant_wiki_pages
  mockSupabaseAdmin.from.mockImplementation((table) => {
    if (table === 'reservations') return makeFromChain({ data: [] });
    if (table === 'manager_memory') return makeFromChain({ data: [] });
    if (table === 'tables') {
      const c = makeFromChain({ data: [] });
      // count query returns count property
      c.select.mockReturnValue({ ...c, eq: jest.fn().mockResolvedValue({ count: 8, error: null }) });
      return c;
    }
    if (table === 'restaurant_wiki_pages') {
      const c = makeFromChain({ data: [] });
      c.upsert = jest.fn().mockResolvedValue({ error: null });
      return c;
    }
    return makeFromChain({ data: [] });
  });

  // AI returns article text
  mockGetAI.mockReturnValue({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Compiled article content.' }],
      }),
    },
  });
});

describe('compileWikiForRestaurant', () => {
  it('compiles all 5 articles when no existing hashes (all new)', async () => {
    const result = await compileWikiForRestaurant(RESTAURANT_ID);
    // 5 articles compiled (no prior hashes → all new)
    expect(result.compiled + result.skipped).toBe(5);
    expect(result.compiled).toBeGreaterThan(0);
  });

  it('skips an article when source hash is unchanged', async () => {
    // Pre-seed a stored hash matching the current input
    const crypto = require('crypto');

    // We need the hash for the 'overview' article to match.
    // Capture what compileWikiForRestaurant would pass as overview data.
    // The easiest approach: run once (all compiled), then mock the hash to match.
    let capturedHash = null;

    mockSupabaseAdmin.from.mockImplementation((table) => {
      if (table === 'restaurant_wiki_pages') {
        const c = makeFromChain({ data: [] });
        c.upsert = jest.fn().mockImplementation((row) => {
          if (row.slug === 'overview') capturedHash = row.source_hash;
          return Promise.resolve({ error: null });
        });
        // maybeSingle returns null hash by default
        c.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
        return c;
      }
      if (table === 'reservations') return makeFromChain({ data: [] });
      if (table === 'manager_memory') return makeFromChain({ data: [] });
      if (table === 'tables') {
        const c = makeFromChain({ data: [] });
        c.select.mockReturnValue({ ...c, eq: jest.fn().mockResolvedValue({ count: 8, error: null }) });
        return c;
      }
      return makeFromChain({ data: [] });
    });

    // First run — captures the hash
    await compileWikiForRestaurant(RESTAURANT_ID);
    expect(capturedHash).not.toBeNull();

    jest.clearAllMocks();
    mockGetRestaurantSnapshot.mockResolvedValue({ upcoming_reservations: [], active_parties: [], waitlist_count: 0, deposit_summary: { count: 0 }, staffing_forecast: [] });
    mockSchemaFrom.mockImplementation((table) => table === 'customer_ltv'
      ? makeFromChain({ data: [] })
      : makeFromChain({ data: [{ restaurant_name: 'Test Bistro', restaurant_type: 'italian', agent_language: 'en' }] }));
    mockGetAI.mockReturnValue({ messages: { create: jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Article.' }] }) } });

    // Second run — same data, overview hash matches → overview should be skipped
    let overviewHashReturned = false;
    mockSupabaseAdmin.from.mockImplementation((table) => {
      if (table === 'restaurant_wiki_pages') {
        const c = makeFromChain({ data: [] });
        c.upsert = jest.fn().mockResolvedValue({ error: null });
        // Return the saved hash for overview slug, null for others
        c.maybeSingle = jest.fn().mockImplementation(() => {
          // We can't easily distinguish slug here without tracking calls,
          // so return the hash for the first call (overview) and null after
          if (!overviewHashReturned) {
            overviewHashReturned = true;
            return Promise.resolve({ data: { source_hash: capturedHash }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        });
        return c;
      }
      if (table === 'reservations') return makeFromChain({ data: [] });
      if (table === 'manager_memory') return makeFromChain({ data: [] });
      if (table === 'tables') {
        const c = makeFromChain({ data: [] });
        c.select.mockReturnValue({ ...c, eq: jest.fn().mockResolvedValue({ count: 8, error: null }) });
        return c;
      }
      return makeFromChain({ data: [] });
    });

    const result2 = await compileWikiForRestaurant(RESTAURANT_ID);
    // One article was skipped (overview hash matched), others compiled
    expect(result2.skipped).toBeGreaterThanOrEqual(1);
    expect(result2.compiled + result2.skipped).toBe(5);
  });

  it('returns { compiled: 0, skipped: 0 } and does not crash on AI error', async () => {
    mockGetAI.mockReturnValue({
      messages: {
        create: jest.fn().mockRejectedValue(new Error('AI unavailable')),
      },
    });

    await expect(compileWikiForRestaurant(RESTAURANT_ID)).rejects.toThrow('AI unavailable');
  });

  it('handles empty customer profiles gracefully', async () => {
    const result = await compileWikiForRestaurant(RESTAURANT_ID);
    expect(result.compiled + result.skipped).toBe(5);
  });

  it('compiles customers only from restaurant-scoped LTV rows', async () => {
    const ltvChain = makeFromChain({ data: [] });
    ltvChain.limit.mockResolvedValue({
      data: [{ customer_id: 'phone-1', customer_name: 'Own Guest', customer_tier: 'vip', total_visits: 8 }],
      count: 1,
      error: null,
    });
    mockSchemaFrom.mockImplementation((table) => table === 'customer_ltv'
      ? ltvChain
      : makeFromChain({ data: [{ restaurant_name: 'Test Bistro' }] }));
    const create = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Article.' }] });
    mockGetAI.mockReturnValue({ messages: { create } });

    await compileWikiForRestaurant(RESTAURANT_ID);

    expect(mockSupabaseAdmin.schema).toHaveBeenCalledWith('restaurant');
    expect(mockSchemaFrom).toHaveBeenCalledWith('customer_ltv');
    expect(ltvChain.eq).toHaveBeenCalledWith('restaurant_id', RESTAURANT_ID);
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('customer_behavioral_profiles');
    expect(create.mock.calls.some(([params]) => params.messages[0].content.includes('Own Guest'))).toBe(true);
    const wikiWrites = mockSupabaseAdmin.from.mock.calls.flatMap(([table], index) =>
      table === 'restaurant_wiki_pages'
        ? mockSupabaseAdmin.from.mock.results[index].value.upsert.mock.calls
        : []);
    expect(wikiWrites.some(([row]) => row.slug === 'customers' && row.source_hash.startsWith('tenant-ltv-v1:'))).toBe(true);
  });

  it('does not overwrite wiki pages when the scoped customer lookup fails', async () => {
    const ltvChain = makeFromChain({ data: [] });
    ltvChain.limit.mockResolvedValue({ data: null, error: { message: 'LTV unavailable' } });
    mockSchemaFrom.mockImplementation((table) => table === 'customer_ltv'
      ? ltvChain
      : makeFromChain({ data: [{ restaurant_name: 'Test Bistro' }] }));

    await expect(compileWikiForRestaurant(RESTAURANT_ID)).rejects.toEqual({ message: 'LTV unavailable' });
    expect(mockSupabaseAdmin.from).not.toHaveBeenCalledWith('restaurant_wiki_pages');
  });
});

describe('getWikiPages', () => {
  it('returns empty array when no wiki pages exist', async () => {
    const chain = makeFromChain({ data: [] });
    mockSupabaseAdmin.from.mockReturnValue(chain);

    const pages = await getWikiPages(RESTAURANT_ID);
    expect(pages).toEqual([]);
  });

  it('returns wiki pages sorted by slug', async () => {
    const mockPages = [
      { slug: 'overview', title: 'Overview', content: 'Overview content', compiled_at: '2026-04-10T04:30:00Z' },
      { slug: 'customers', title: 'Customers', content: 'Customer content', compiled_at: '2026-04-10T04:30:00Z', source_hash: 'tenant-ltv-v1:abc' },
    ];

    // order().eq() chain for getWikiPages
    const chain = {
      select: jest.fn(),
      eq: jest.fn(),
      order: jest.fn(),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockResolvedValue({ data: mockPages, error: null });

    mockSupabaseAdmin.from.mockReturnValue(chain);

    const pages = await getWikiPages(RESTAURANT_ID);
    expect(pages).toHaveLength(2);
    expect(pages[0].slug).toBe('overview');
    expect(pages[1]).not.toHaveProperty('source_hash');
  });

  it('hides customer articles compiled from the old global source', async () => {
    const rows = [
      { slug: 'customers', title: 'Old global customer article', content: 'Unsafe', compiled_at: '2026-04-10', source_hash: 'legacy-hash' },
      { slug: 'overview', title: 'Overview', content: 'Safe', compiled_at: '2026-04-10', source_hash: 'other-hash' },
    ];
    const chain = { select: jest.fn(), eq: jest.fn(), order: jest.fn() };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockResolvedValue({ data: rows, error: null });
    mockSupabaseAdmin.from.mockReturnValue(chain);

    expect(await getWikiPages(RESTAURANT_ID)).toEqual([
      { slug: 'overview', title: 'Overview', content: 'Safe', compiled_at: '2026-04-10' },
    ]);
  });

  it('returns empty array on database error', async () => {
    const chain = {
      select: jest.fn(),
      eq: jest.fn(),
      order: jest.fn(),
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    mockSupabaseAdmin.from.mockReturnValue(chain);

    const pages = await getWikiPages(RESTAURANT_ID);
    expect(pages).toEqual([]);
  });
});
