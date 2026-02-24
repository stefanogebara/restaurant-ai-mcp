// Mock dependencies before requiring the handler
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    schema: jest.fn(),
  },
}));

jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ text: '<p>Generated copy.</p>' }],
      }),
    },
  }))
);

const handler = require('../seo/city-cuisine');
const { supabaseAdmin } = require('../_lib/supabase');

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res;
}

function mockSupabase({ cacheData = null, cacheError = null, restaurants = [] } = {}) {
  supabaseAdmin.from.mockImplementation((table) => {
    if (table === 'seo_page_cache') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: cacheData, error: cacheError }),
          }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
      };
    }
    return {};
  });

  supabaseAdmin.schema = jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockResolvedValue({ data: restaurants, error: null }),
          }),
        }),
      }),
    }),
  });
}

describe('GET /api/seo/city-cuisine', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 405 for non-GET requests', async () => {
    const res = makeRes();
    await handler({ method: 'POST', query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 400 when city is missing', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { cuisine: 'mediterranean' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 400 when cuisine is missing', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { city: 'madrid' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns cached HTML on cache hit', async () => {
    mockSupabase({ cacheData: { html: '<!DOCTYPE html><html>cached</html>' } });
    const res = makeRes();
    await handler({ method: 'GET', query: { city: 'madrid', cuisine: 'mediterranean' } }, res);
    expect(res.send).toHaveBeenCalledWith('<!DOCTYPE html><html>cached</html>');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
  });

  it('returns 404 when no restaurants match city+cuisine', async () => {
    mockSupabase({ cacheError: { code: 'PGRST116' }, restaurants: [] });
    const res = makeRes();
    await handler({ method: 'GET', query: { city: 'madrid', cuisine: 'mediterranean' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('generates and returns HTML on cache miss when restaurants exist', async () => {
    mockSupabase({
      cacheError: { code: 'PGRST116' },
      restaurants: [
        { restaurant_name: 'Celeri', slug: 'celeri-madrid', city: 'Madrid', restaurant_type: 'Mediterranean' },
      ],
    });
    const res = makeRes();
    await handler({ method: 'GET', query: { city: 'madrid', cuisine: 'mediterranean' } }, res);
    expect(res.send).toHaveBeenCalled();
    const html = res.send.mock.calls[0][0];
    expect(html).toMatch(/<!DOCTYPE html>/);
    expect(html).toContain('Madrid');
    expect(html).toContain('Mediterranean');
  });

  it('upserts generated HTML into cache', async () => {
    mockSupabase({
      cacheError: { code: 'PGRST116' },
      restaurants: [
        { restaurant_name: 'Celeri', slug: 'celeri-madrid', city: 'Madrid', restaurant_type: 'Mediterranean' },
      ],
    });
    const res = makeRes();
    await handler({ method: 'GET', query: { city: 'madrid', cuisine: 'mediterranean' } }, res);
    expect(supabaseAdmin.from).toHaveBeenCalledWith('seo_page_cache');
  });
});
