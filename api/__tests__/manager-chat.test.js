// mockSupabaseAdmin must be declared with var so it is hoisted above jest.mock() calls
// (jest.mock factories run before const/let declarations are initialized)
var mockSupabaseAdmin = { from: jest.fn() };

const managerChat = require('../manager-chat');

jest.mock('../_lib/auth', () => ({
  verifyJWT: jest.fn().mockReturnValue({ restaurantId: 'rest-1' }),
}));
jest.mock('../_lib/manager-agent', () => ({
  runManagerAgent: jest.fn().mockResolvedValue('You have 2 reservations tonight.'),
}));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => jest.clearAllMocks());

describe('POST /api/manager-chat', () => {
  it('returns reply from runManagerAgent', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { message: 'Who is coming tonight?' } };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reply: 'You have 2 reservations tonight.' }));
  });

  it('returns 400 when message is missing', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: {} };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 405 for non-POST/GET', async () => {
    const req = { method: 'DELETE', headers: {}, body: {} };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

describe('GET /api/manager-chat', () => {
  it('returns conversation history', async () => {
    const chain = { select: jest.fn(), eq: jest.fn(), order: jest.fn(), limit: jest.fn() };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.order.mockReturnValue(chain);
    chain.limit.mockResolvedValue({ data: [{ role: 'manager', content: 'Hi', created_at: '2026-03-01T10:00:00Z' }], error: null });
    mockSupabaseAdmin.from.mockReturnValue(chain);

    const req = { method: 'GET', headers: { authorization: 'Bearer tok' }, body: {} };
    const res = mockRes();
    await managerChat(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ history: expect.any(Array) }));
  });
});
