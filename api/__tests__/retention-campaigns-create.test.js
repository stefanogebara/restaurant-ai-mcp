'use strict';

var mockCustomerResult = { data: null, error: null };
var mockEmailResult = { sent: true };
var mockCustomerQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(() => Promise.resolve(mockCustomerResult)),
};
var mockInsertQuery = {
  insert: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: { id: 'campaign-1', status: 'pending' }, error: null }),
};
var mockUpdateQuery = {
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
};
var mockFrom = jest.fn((table) => table === 'customer_ltv' ? mockCustomerQuery : mockInsertQuery);
var mockSendEmail = jest.fn(() => Promise.resolve(mockEmailResult));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: jest.fn(() => ({ from: (...args) => mockFrom(...args) })) },
}));
jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn().mockResolvedValue({ user: { restaurant_id: 'own-restaurant' } }),
}));
jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: (_req, _res, next) => next(),
  requireFeature: () => (_req, _res, next) => next(),
}));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/email', () => ({ sendRetentionCampaignEmail: (...args) => mockSendEmail(...args) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn() }));
jest.mock('../_services/campaignService', () => ({
  createCampaign: jest.fn(), sendCampaignBatch: jest.fn(),
  getCampaignStats: jest.fn(), getSegmentCustomers: jest.fn(),
}));

const handler = require('../retention-campaigns');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function request(overrides = {}) {
  return {
    method: 'POST', query: { action: 'create' },
    body: { customer_id: 'guest-1', campaign_type: 'win_back', message: 'Hello', language: 'pt-BR', ...overrides },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCustomerResult = { data: null, error: null };
  mockEmailResult = { sent: true };
  mockFrom.mockImplementation((table) => table === 'customer_ltv' ? mockCustomerQuery : mockInsertQuery);
});

test('foreign or missing customer creates no campaign and sends no email', async () => {
  const res = response();
  await handler(request(), res);

  expect(mockCustomerQuery.eq).toHaveBeenCalledWith('customer_id', 'guest-1');
  expect(mockCustomerQuery.eq).toHaveBeenCalledWith('restaurant_id', 'own-restaurant');
  expect(res.status).toHaveBeenCalledWith(404);
  expect(mockInsertQuery.insert).not.toHaveBeenCalled();
  expect(mockSendEmail).not.toHaveBeenCalled();
});

test('customer without an email creates no undeliverable campaign', async () => {
  mockCustomerResult = { data: { customer_name: 'Ana', customer_email: null }, error: null };
  const res = response();
  await handler(request(), res);

  expect(res.status).toHaveBeenCalledWith(422);
  expect(mockInsertQuery.insert).not.toHaveBeenCalled();
  expect(mockSendEmail).not.toHaveBeenCalled();
});

test('unsupported individual channel is rejected before lookup and insert', async () => {
  const res = response();
  await handler(request({ channel: 'whatsapp' }), res);

  expect(res.status).toHaveBeenCalledWith(400);
  expect(mockCustomerQuery.maybeSingle).not.toHaveBeenCalled();
  expect(mockInsertQuery.insert).not.toHaveBeenCalled();
});

test('owned customer gets a localized email and a truthful send result', async () => {
  mockCustomerResult = { data: { customer_name: 'Ana', customer_email: 'ana@example.com' }, error: null };
  mockFrom.mockImplementation((table) => table === 'customer_ltv' ? mockCustomerQuery :
    mockInsertQuery.insert.mock.calls.length ? mockUpdateQuery : mockInsertQuery);
  const res = response();
  await handler(request(), res);

  expect(mockInsertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ restaurant_id: 'own-restaurant', channel: 'email' }));
  expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ customerEmail: 'ana@example.com', language: 'pt-BR' }));
  expect(mockUpdateQuery.eq).toHaveBeenCalledWith('restaurant_id', 'own-restaurant');
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, sent: true }));
});

test('provider refusal is reported as failed, never sent', async () => {
  mockCustomerResult = { data: { customer_name: 'Ana', customer_email: 'ana@example.com' }, error: null };
  mockEmailResult = { sent: false, reason: 'rejected' };
  mockFrom.mockImplementation((table) => table === 'customer_ltv' ? mockCustomerQuery :
    mockInsertQuery.insert.mock.calls.length ? mockUpdateQuery : mockInsertQuery);
  const res = response();
  await handler(request(), res);

  expect(mockUpdateQuery.update).toHaveBeenCalledWith({ status: 'failed', sent_at: null });
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, sent: false }));
});
