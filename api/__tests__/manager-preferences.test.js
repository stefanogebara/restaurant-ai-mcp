var mockVerifyJWT = jest.fn();
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/auth', () => ({ verifyJWT: (...a) => mockVerifyJWT(...a) }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

function makeGetChain(prefs) {
  const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.single.mockResolvedValue({ data: { notification_preferences: prefs }, error: null });
  return chain;
}

function makeUpdateChain(mergedPrefs) {
  const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn(), update: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.single.mockResolvedValue({ data: { notification_preferences: mergedPrefs }, error: null });
  return chain;
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const managerPrefs = require('../manager-preferences');

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyJWT.mockReturnValue({ restaurant_id: 'rest-1' });
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue(mockSupabaseAdmin);
});

it('GET returns notification_preferences', async () => {
  mockSupabaseAdmin.from.mockReturnValue(
    makeGetChain({ morning_briefing: true, briefing_channel: 'voice_note' })
  );

  const req = { method: 'GET', headers: { authorization: 'Bearer tok' } };
  const res = mockRes();
  await managerPrefs(req, res);

  expect(res.json).toHaveBeenCalledWith({
    notification_preferences: { morning_briefing: true, briefing_channel: 'voice_note' },
  });
});

it('PATCH merges preferences and returns updated object', async () => {
  const existing = { morning_briefing: true, briefing_channel: 'text', alert_low_covers: false };
  const updates = { briefing_channel: 'voice_note', alert_low_covers: true };
  const merged = { ...existing, ...updates };

  let callCount = 0;
  mockSupabaseAdmin.from.mockImplementation(() => {
    callCount++;
    if (callCount === 1) return makeGetChain(existing);
    return makeUpdateChain(merged);
  });

  const req = { method: 'PATCH', headers: { authorization: 'Bearer tok' }, body: updates };
  const res = mockRes();
  await managerPrefs(req, res);

  expect(res.json).toHaveBeenCalledWith({ notification_preferences: merged });
});

it('returns 401 when JWT invalid', async () => {
  mockVerifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });
  const req = { method: 'GET', headers: { authorization: 'Bearer bad' } };
  const res = mockRes();
  await managerPrefs(req, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 400 when PATCH body has invalid keys', async () => {
  const req = { method: 'PATCH', headers: { authorization: 'Bearer tok' }, body: { hacked_field: 'x' } };
  const res = mockRes();
  await managerPrefs(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('returns 400 when PATCH body is empty', async () => {
  const req = { method: 'PATCH', headers: { authorization: 'Bearer tok' }, body: {} };
  const res = mockRes();
  await managerPrefs(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('returns 405 for DELETE', async () => {
  const req = { method: 'DELETE', headers: {}, body: {} };
  const res = mockRes();
  await managerPrefs(req, res);
  expect(res.status).toHaveBeenCalledWith(405);
});
