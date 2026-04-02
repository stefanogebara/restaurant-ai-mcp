// mockSupabaseAdmin must be declared with var so it is hoisted above jest.mock() calls
// (jest.mock factories run before const/let declarations are initialized)
var mockSchemaFrom = jest.fn();
var mockSupabaseAdmin = {
  from: jest.fn(),
  schema: jest.fn().mockReturnValue({ from: mockSchemaFrom }),
};
var mockSendBriefing = jest.fn().mockResolvedValue(undefined);
var mockGetVIPsForToday = jest.fn().mockResolvedValue([]);

const briefings = require('../cron/manager-briefings');

jest.mock('../_lib/briefing-sender', () => ({
  sendBriefing: (...a) => mockSendBriefing(...a),
}));
jest.mock('../_lib/manager-agent', () => ({
  runManagerAgent: jest.fn().mockResolvedValue('End of day: 24 covers served.'),
}));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../services/restaurantSnapshot', () => ({
  getVIPsForToday: (...a) => mockGetVIPsForToday(...a),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
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
beforeEach(() => {
  jest.clearAllMocks();
  mockGetVIPsForToday.mockResolvedValue([]);
});

it('sends end-of-day briefing to opted-in restaurants via sendBriefing', async () => {
  mockSchemaFrom.mockReturnValue(mockChain([
    { id: 'rest-1', manager_phone: '+15551234567', manager_whatsapp_verified: true, notification_preferences: { end_of_day_briefing: true, briefing_channel: 'text' } },
  ]));

  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, query: { type: 'end_of_day' } };
  const res = mockRes();

  await briefings(req, res);

  expect(mockSendBriefing).toHaveBeenCalledWith('+15551234567', expect.any(String), 'text', 'rest-1');
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: 1 }));
});

it('uses voice_note channel when briefing_channel is voice_note', async () => {
  mockSchemaFrom.mockReturnValue(mockChain([
    { id: 'rest-1', manager_phone: '+15551234567', manager_whatsapp_verified: true, notification_preferences: { end_of_day_briefing: true, briefing_channel: 'voice_note' } },
  ]));

  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, query: { type: 'end_of_day' } };
  const res = mockRes();
  await briefings(req, res);

  expect(mockSendBriefing).toHaveBeenCalledWith('+15551234567', expect.any(String), 'voice_note', 'rest-1');
});

it('defaults to text channel when briefing_channel is not set', async () => {
  mockSchemaFrom.mockReturnValue(mockChain([
    { id: 'rest-1', manager_phone: '+15551234567', manager_whatsapp_verified: true, notification_preferences: { end_of_day_briefing: true } },
  ]));

  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, query: { type: 'end_of_day' } };
  const res = mockRes();
  await briefings(req, res);

  expect(mockSendBriefing).toHaveBeenCalledWith('+15551234567', expect.any(String), 'text', 'rest-1');
});

it('skips restaurants without end_of_day_briefing preference', async () => {
  mockSchemaFrom.mockReturnValue(mockChain([
    { id: 'rest-2', manager_phone: '+15559999999', notification_preferences: { end_of_day_briefing: false } },
  ]));

  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, query: { type: 'end_of_day' } };
  const res = mockRes();
  await briefings(req, res);

  expect(mockSendBriefing).not.toHaveBeenCalled();
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
  mockSchemaFrom.mockReturnValue(mockChain([
    { id: 'rest-1', manager_phone: '+15551234567', manager_whatsapp_verified: true, notification_preferences: { morning_briefing: true, briefing_channel: 'phone_call' } },
  ]));

  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, query: { type: 'morning' } };
  const res = mockRes();

  await briefings(req, res);

  const { runManagerAgent } = require('../_lib/manager-agent');
  expect(runManagerAgent).toHaveBeenCalledWith('rest-1', expect.stringContaining('morning'), 'whatsapp');
  expect(mockSendBriefing).toHaveBeenCalledWith('+15551234567', expect.any(String), 'phone_call', 'rest-1');
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: 1 }));
});

it('injects [VIP GUESTS TODAY] block in morning prompt when VIPs exist', async () => {
  mockGetVIPsForToday.mockResolvedValue([
    { customer_name: 'Maria Sanchez', customer_tier: 'vip', total_visits: 22 },
    { customer_name: "John O'Brien", customer_tier: 'regular', total_visits: 8 },
  ]);
  mockSchemaFrom.mockReturnValue(mockChain([
    { id: 'rest-1', manager_phone: '+15551234567', manager_whatsapp_verified: true, notification_preferences: { morning_briefing: true, briefing_channel: 'text' } },
  ]));

  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, query: { type: 'morning' } };
  const res = mockRes();
  await briefings(req, res);

  const { runManagerAgent } = require('../_lib/manager-agent');
  const [[, promptArg]] = runManagerAgent.mock.calls;
  expect(promptArg).toContain('[VIP GUESTS TODAY]');
  expect(promptArg).toContain('Maria Sanchez');
});

it('uses base morning prompt when no VIPs today', async () => {
  mockGetVIPsForToday.mockResolvedValue([]);
  mockSchemaFrom.mockReturnValue(mockChain([
    { id: 'rest-1', manager_phone: '+15551234567', manager_whatsapp_verified: true, notification_preferences: { morning_briefing: true, briefing_channel: 'text' } },
  ]));

  const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' }, query: { type: 'morning' } };
  const res = mockRes();
  await briefings(req, res);

  const { runManagerAgent } = require('../_lib/manager-agent');
  const [[, promptArg]] = runManagerAgent.mock.calls;
  expect(promptArg).not.toContain('[VIP GUESTS TODAY]');
});
