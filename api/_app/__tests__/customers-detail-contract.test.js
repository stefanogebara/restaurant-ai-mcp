'use strict';

var customerResult;
var customerQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(() => Promise.resolve(customerResult)),
};
var reservationsQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue({ data: [{ id: 'reservation-1', date: '2026-10-11', time: '19:00', party_size: 2, status: 'completed' }], error: null }),
};
var notesQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockResolvedValue({ data: [{ id: 'note-1', content: 'Window table' }], error: null }),
};
var mockSchemaFrom = jest.fn((table) => table === 'customer_ltv' ? customerQuery : notesQuery);
var mockPublicFrom = jest.fn(() => reservationsQuery);

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: jest.fn(() => ({ from: (...args) => mockSchemaFrom(...args) })),
    from: (...args) => mockPublicFrom(...args),
  },
}));
jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn().mockResolvedValue({ user: { restaurant_id: 'own-restaurant' } }) }));
jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: (_req, _res, next) => next(),
  requireFeature: () => (_req, _res, next) => next(),
}));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn() }));
jest.mock('../_services/customerMergeService', () => ({ findDuplicates: jest.fn(), mergeCustomers: jest.fn() }));

const handler = require('../customers');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  customerResult = {
    data: { customer_id: 'crm-uuid', customer_name: 'Beatriz', customer_phone: '+5511999888777', total_visits: 3 },
    error: null,
  };
});

test('loads visit history using the owned customer phone, not the CRM identifier', async () => {
  const res = response();
  await handler({ method: 'GET', query: { action: 'detail', customer_id: 'crm-uuid' } }, res);

  expect(customerQuery.eq).toHaveBeenCalledWith('customer_id', 'crm-uuid');
  expect(customerQuery.eq).toHaveBeenCalledWith('restaurant_id', 'own-restaurant');
  expect(reservationsQuery.eq).toHaveBeenCalledWith('customer_phone', '+5511999888777');
  expect(reservationsQuery.eq).toHaveBeenCalledWith('restaurant_id', 'own-restaurant');
  expect(notesQuery.eq).toHaveBeenCalledWith('restaurant_id', 'own-restaurant');
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: expect.objectContaining({
      customer: expect.objectContaining({ customer_name: 'Beatriz' }),
      reservations: [expect.objectContaining({ id: 'reservation-1' })],
      notes: [expect.objectContaining({ id: 'note-1' })],
    }),
  });
});

test('does not query visits or notes for a customer outside this restaurant', async () => {
  customerResult = { data: null, error: { code: 'PGRST116' } };
  const res = response();
  await handler({ method: 'GET', query: { action: 'detail', customer_id: 'foreign-uuid' } }, res);

  expect(res.status).toHaveBeenCalledWith(404);
  expect(mockPublicFrom).not.toHaveBeenCalled();
  expect(mockSchemaFrom).toHaveBeenCalledTimes(1);
});

test('a customer without a phone still opens without querying reservations by null', async () => {
  customerResult.data.customer_phone = null;
  const res = response();
  await handler({ method: 'GET', query: { action: 'detail', customer_id: 'crm-uuid' } }, res);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(mockPublicFrom).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ reservations: [] }),
  }));
});
