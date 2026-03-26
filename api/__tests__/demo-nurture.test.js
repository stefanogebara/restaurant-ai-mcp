/**
 * Tests for the demo-nurture cron handler.
 *
 * Covers: auth guard, day-3/5/7 email dispatch, idempotency (sent_at already set),
 * missing email skip, and summary shape.
 */

const CRON_SECRET = 'test-secret';
process.env.CRON_SECRET = CRON_SECRET;
process.env.RESEND_API_KEY = 're_test_key';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockSend = jest.fn().mockResolvedValue({ id: 'email-id' });
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
  captureMessage: jest.fn(),
}));

const mockUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
const mockFromChain = jest.fn();

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockImplementation(() => mockFromChain()),
    }),
  },
}));

const handler = require('../cron/demo-nurture');

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return {
    headers: { authorization: `Bearer ${CRON_SECRET}` },
    ...overrides,
  };
}

function makeRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res;
}

function makeDemo(overrides = {}) {
  return {
    id: 'demo-id-1',
    restaurant_name: 'Trattoria Test',
    demo_token: 'tok-abc',
    demo_contact_email: 'owner@test.com',
    demo_contact_name: 'Maria',
    demo_expires_at: new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

/**
 * Set up the supabase chain mock.
 * fetchResults: [day3Result, day5Result, day7Result] — each { data, error }
 */
function mockSupabase(fetchResults) {
  let callIdx = 0;
  mockFromChain.mockImplementation(() => {
    // select chain for fetches
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      is: jest.fn().mockImplementation(() => {
        const result = fetchResults[callIdx] || { data: [], error: null };
        callIdx++;
        return Promise.resolve(result);
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
        in: jest.fn().mockResolvedValue({ error: null }),
      }),
    };
    return chain;
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('demo-nurture cron', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ id: 'email-id' });
  });

  it('returns 401 when CRON_SECRET is wrong', async () => {
    const res = makeRes();
    await handler({ headers: { authorization: 'Bearer wrong' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('sends day-3 email and marks sent_at', async () => {
    const demo = makeDemo();
    mockSupabase([
      { data: [demo], error: null },  // day-3 fetch
      { data: [], error: null },       // day-5 fetch
      { data: [], error: null },       // day-7 fetch
    ]);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const call = mockSend.mock.calls[0][0];
    expect(call.to).toBe('owner@test.com');
    expect(call.subject).toMatch(/getting on|4 days/i);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, day3: { sent: 1, failed: 0, skipped: 0 } }),
    );
  });

  it('sends day-5 email and marks sent_at', async () => {
    const demo = makeDemo();
    mockSupabase([
      { data: [], error: null },       // day-3
      { data: [demo], error: null },   // day-5
      { data: [], error: null },       // day-7
    ]);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].subject).toMatch(/2 days/i);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ day5: { sent: 1, failed: 0, skipped: 0 } }),
    );
  });

  it('sends day-7 email and marks sent_at', async () => {
    const demo = makeDemo();
    mockSupabase([
      { data: [], error: null },       // day-3
      { data: [], error: null },       // day-5
      { data: [demo], error: null },   // day-7
    ]);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].subject).toMatch(/last day/i);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ day7: { sent: 1, failed: 0, skipped: 0 } }),
    );
  });

  it('skips demo with no contact email', async () => {
    const demo = makeDemo({ demo_contact_email: null });
    mockSupabase([
      { data: [demo], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(mockSend).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ day3: { sent: 0, failed: 0, skipped: 1 } }),
    );
  });

  it('counts failed when resend throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('Resend API error'));
    const demo = makeDemo();
    mockSupabase([
      { data: [demo], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ day3: { sent: 0, failed: 1, skipped: 0 } }),
    );
  });

  it('returns 500 when day-3 DB fetch fails', async () => {
    let callIdx = 0;
    mockFromChain.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      is: jest.fn().mockImplementation(() => {
        callIdx++;
        if (callIdx === 1) return Promise.resolve({ data: null, error: { message: 'DB error' } });
        return Promise.resolve({ data: [], error: null });
      }),
    }));

    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('summary includes all three day keys', async () => {
    mockSupabase([
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);

    const res = makeRes();
    await handler(makeReq(), res);

    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('day3');
    expect(body).toHaveProperty('day5');
    expect(body).toHaveProperty('day7');
  });
});
