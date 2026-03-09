var mockSendWhatsAppMessage = jest.fn().mockResolvedValue({ success: true });
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: (...a) => mockSendWhatsAppMessage(...a),
}));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

// Build a chain that resolves to the given value at its terminal call
function makeChain(terminalValue) {
  const chain = {
    select: jest.fn(),
    eq: jest.fn(),
    not: jest.fn(),
    gte: jest.fn(),
    insert: jest.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.not.mockResolvedValue(terminalValue);
  chain.gte.mockResolvedValue(terminalValue);
  chain.insert.mockResolvedValue({ data: [{ id: 'alert-1' }], error: null });
  return chain;
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const CRON_SECRET = 'test-cron-secret';
process.env.CRON_SECRET = CRON_SECRET;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
  process.env.CRON_SECRET = CRON_SECRET;
  mockSupabaseAdmin.schema = jest.fn().mockReturnValue(mockSupabaseAdmin);
});

it('returns 401 when CRON_SECRET is wrong', async () => {
  const managerAlerts = require('../cron/manager-alerts');
  const req = { method: 'GET', headers: { authorization: 'Bearer wrong' }, query: { type: 'low_covers' } };
  const res = mockRes();
  await managerAlerts(req, res);
  expect(res.status).toHaveBeenCalledWith(401);
});

it('returns 400 for unknown alert type', async () => {
  const managerAlerts = require('../cron/manager-alerts');
  const req = {
    method: 'GET',
    headers: { authorization: `Bearer ${CRON_SECRET}` },
    query: { type: 'unknown_type' },
  };
  const res = mockRes();
  await managerAlerts(req, res);
  expect(res.status).toHaveBeenCalledWith(400);
});

it('skips restaurant without alert opt-in (alert_low_covers: false)', async () => {
  const restaurant = {
    id: 'rest-1', manager_phone: '+15551234567',
    manager_whatsapp_verified: true,
    notification_preferences: { alert_low_covers: false },
    timezone: 'UTC',
  };
  mockSupabaseAdmin.from.mockReturnValue(makeChain({ data: [restaurant], error: null }));

  const managerAlerts = require('../cron/manager-alerts');
  const req = {
    method: 'GET',
    headers: { authorization: `Bearer ${CRON_SECRET}` },
    query: { type: 'low_covers' },
  };
  const res = mockRes();
  await managerAlerts(req, res);

  expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: 0 }));
});

it('returns 200 with checked/sent counts when no restaurants match', async () => {
  mockSupabaseAdmin.from.mockReturnValue(makeChain({ data: [], error: null }));

  const managerAlerts = require('../cron/manager-alerts');
  const req = {
    method: 'GET',
    headers: { authorization: `Bearer ${CRON_SECRET}` },
    query: { type: 'high_noshows' },
  };
  const res = mockRes();
  await managerAlerts(req, res);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ checked: expect.any(Number), sent: expect.any(Number) })
  );
});

it('returns 405 for non-GET methods', async () => {
  const managerAlerts = require('../cron/manager-alerts');
  const req = { method: 'POST', headers: {}, query: {} };
  const res = mockRes();
  await managerAlerts(req, res);
  expect(res.status).toHaveBeenCalledWith(405);
});
