// mockSupabaseAdmin must be declared with var so it is hoisted above jest.mock() calls
// (jest.mock factories run before const/let declarations are initialized)
var mockSupabaseAdmin = { from: jest.fn() };

const briefings = require('../cron/manager-briefings');

jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../_lib/manager-agent', () => ({
  runManagerAgent: jest.fn().mockResolvedValue('End of day: 24 covers served.'),
}));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

function mockChain(data) {
  const c = { select: jest.fn(), eq: jest.fn(), not: jest.fn() };
  c.select.mockReturnValue(c);
  c.eq.mockReturnValue(c);
  c.not.mockResolvedValue({ data, error: null });
  return c;
}

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

it('sends end-of-day briefing to opted-in restaurants', async () => {
  mockSupabaseAdmin.from.mockReturnValue(mockChain([
    { id: 'rest-1', manager_phone: '+15551234567', notification_preferences: { end_of_day_briefing: true } },
  ]));

  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, query: { type: 'end_of_day' } };
  const res = mockRes();

  await briefings(req, res);

  const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
  expect(sendWhatsAppMessage).toHaveBeenCalledWith('+15551234567', expect.any(String), 'rest-1');
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: 1 }));
});

it('skips restaurants without end_of_day_briefing preference', async () => {
  mockSupabaseAdmin.from.mockReturnValue(mockChain([
    { id: 'rest-2', manager_phone: '+15559999999', notification_preferences: { end_of_day_briefing: false } },
  ]));

  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, query: { type: 'end_of_day' } };
  const res = mockRes();
  await briefings(req, res);

  const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
  expect(sendWhatsAppMessage).not.toHaveBeenCalled();
});

it('returns 401 for wrong CRON_SECRET', async () => {
  process.env.CRON_SECRET = 'real-secret';
  const req = { method: 'POST', headers: { authorization: 'Bearer wrong' }, query: {} };
  const res = mockRes();
  await briefings(req, res);
  expect(res.status).toHaveBeenCalledWith(401);
  process.env.CRON_SECRET = 'test-cron-secret';
});

it('sends morning briefing to opted-in restaurants', async () => {
  mockSupabaseAdmin.from.mockReturnValue(mockChain([
    { id: 'rest-1', manager_phone: '+15551234567', notification_preferences: { morning_briefing: true } },
  ]));

  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, query: { type: 'morning' } };
  const res = mockRes();

  await briefings(req, res);

  const { runManagerAgent } = require('../_lib/manager-agent');
  const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
  expect(runManagerAgent).toHaveBeenCalledWith('rest-1', expect.stringContaining('morning'), 'whatsapp');
  expect(sendWhatsAppMessage).toHaveBeenCalledWith('+15551234567', expect.any(String), 'rest-1');
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: 1 }));
});
