// mockSupabaseAdmin must be declared with var so it is hoisted above jest.mock() calls
// (jest.mock factories run before const/let declarations are initialized)
var mockSupabaseAdmin = { from: jest.fn() };

const managerWhatsapp = require('../manager-whatsapp');

jest.mock('../_lib/manager-agent', () => {
  class ManagerQuotaError extends Error {
    constructor(type, data = {}) {
      super(type);
      this.name = 'ManagerQuotaError';
      this.type = type;
      this.used = data.used;
      this.limit = data.limit;
      this.plan = data.plan;
    }
  }
  return {
    runManagerAgent: jest.fn().mockResolvedValue('Tonight you have 3 reservations.'),
    ManagerQuotaError,
  };
});
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
// whatsapp-sender.js lives in api/_lib/ (not api/services/)
jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.single.mockResolvedValue({
    data: { id: 'rest-1', manager_phone: '+15551234567', manager_whatsapp_verified: true, notification_preferences: {} },
    error: null,
  });
  mockSupabaseAdmin.from.mockReturnValue(chain);
});

it('routes verified manager message to runManagerAgent and replies', async () => {
  const req = {
    method: 'POST',
    body: { From: 'whatsapp:+15551234567', Body: 'How many covers tonight?', MessageSid: 'SM123' },
  };
  const res = mockRes();
  await managerWhatsapp(req, res);

  const { runManagerAgent } = require('../_lib/manager-agent');
  expect(runManagerAgent).toHaveBeenCalledWith('rest-1', 'How many covers tonight?', 'whatsapp');
  const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
  expect(sendWhatsAppMessage).toHaveBeenCalledWith('+15551234567', 'Tonight you have 3 reservations.');
  expect(res.status).toHaveBeenCalledWith(200);
});

it('returns 200 silently for unknown phone numbers', async () => {
  const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.single.mockResolvedValue({ data: null, error: null });
  mockSupabaseAdmin.from.mockReturnValue(chain);

  const req = { method: 'POST', body: { From: 'whatsapp:+19999999999', Body: 'hello', MessageSid: 'SM999' } };
  const res = mockRes();
  await managerWhatsapp(req, res);
  expect(res.status).toHaveBeenCalledWith(200);
});

it('returns 405 for non-POST methods', async () => {
  const req = { method: 'GET', body: {} };
  const res = mockRes();
  await managerWhatsapp(req, res);
  expect(res.status).toHaveBeenCalledWith(405);
});

it('returns 200 silently when Body is missing', async () => {
  const req = { method: 'POST', body: { From: 'whatsapp:+15551234567' } };
  const res = mockRes();
  await managerWhatsapp(req, res);
  const { runManagerAgent } = require('../_lib/manager-agent');
  expect(runManagerAgent).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
});

it('sends upgrade message via WhatsApp when quota exceeded', async () => {
  const { runManagerAgent, ManagerQuotaError } = require('../_lib/manager-agent');
  const quotaErr = new ManagerQuotaError('quota_exceeded', { limit: 100 });
  runManagerAgent.mockRejectedValueOnce(quotaErr);
  const req = {
    method: 'POST',
    body: { From: 'whatsapp:+15551234567', Body: 'How many covers tonight?', MessageSid: 'SM123' },
  };
  const res = mockRes();
  await managerWhatsapp(req, res);
  const { sendWhatsAppMessage } = require('../_lib/whatsapp-sender');
  expect(sendWhatsAppMessage).toHaveBeenCalledWith(
    '+15551234567',
    expect.stringContaining('100'),
  );
  expect(sendWhatsAppMessage).toHaveBeenCalledWith(
    '+15551234567',
    expect.stringMatching(/limit/i),
  );
  expect(res.status).toHaveBeenCalledWith(200);
});

it('returns 200 silently when manager not verified', async () => {
  const chain = { select: jest.fn(), eq: jest.fn(), single: jest.fn() };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.single.mockResolvedValue({
    data: { id: 'rest-1', manager_phone: '+15551234567', manager_whatsapp_verified: false },
    error: null,
  });
  mockSupabaseAdmin.from.mockReturnValue(chain);

  const req = { method: 'POST', body: { From: 'whatsapp:+15551234567', Body: 'hello', MessageSid: 'SM000' } };
  const res = mockRes();
  await managerWhatsapp(req, res);
  const { runManagerAgent } = require('../_lib/manager-agent');
  expect(runManagerAgent).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(200);
});
