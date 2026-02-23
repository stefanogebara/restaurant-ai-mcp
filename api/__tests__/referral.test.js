const mockSingle = jest.fn();
const mockLimit  = jest.fn(() => ({ single: mockSingle }));
const mockEq2    = jest.fn(() => ({ limit: mockLimit, single: mockSingle }));
const mockEq1    = jest.fn(() => ({ eq: mockEq2, single: mockSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq1 }));
const mockUpdate = jest.fn(() => ({ eq: mockEq1 }));
const mockInsert = jest.fn(() => ({ select: mockSelect }));
const mockFrom   = jest.fn(() => ({ select: mockSelect, update: mockUpdate, insert: mockInsert }));
const mockSchema = jest.fn(() => ({ from: mockFrom }));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: mockSchema, from: mockFrom },
}));
jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn() }));
jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn().mockResolvedValue(false),
}));

const { verifyAuth } = require('../_lib/auth');
const handler = require('../referral');

function makeRes() {
  const res = {};
  res.setHeader = jest.fn();
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.end = jest.fn(() => res);
  return res;
}

describe('GET ?action=code', () => {
  test('returns 401 when not authenticated', async () => {
    verifyAuth.mockResolvedValue({ error: 'Unauthorized', status: 401 });
    const req = { method: 'GET', query: { action: 'code' }, headers: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns existing referral code', async () => {
    verifyAuth.mockResolvedValue({ user: { restaurant_id: 'rest-1' } });
    mockSingle.mockResolvedValue({ data: { referral_code: 'LUIGI-K4M2', id: 'rest-1' }, error: null });
    mockFrom.mockReturnValue({ select: mockSelect });
    mockSchema.mockReturnValue({ from: mockFrom });
    const req = { method: 'GET', query: { action: 'code' }, headers: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.code).toBe('LUIGI-K4M2');
  });
});

describe('POST ?action=track', () => {
  test('returns valid: false for unknown code', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    mockSchema.mockReturnValue({ from: mockFrom });
    const req = { method: 'POST', query: { action: 'track' }, body: { code: 'FAKE-CODE' }, headers: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].valid).toBe(false);
  });
});

describe('POST ?action=attach', () => {
  test('returns 400 when missing referral_code or restaurant_id', async () => {
    const req = { method: 'POST', query: { action: 'attach' }, body: {}, headers: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
