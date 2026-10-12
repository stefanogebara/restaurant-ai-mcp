'use strict';

var callsResult;
var reservationsResult;
var ltvResult;

var mockCallsQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn(() => Promise.resolve(callsResult)),
};
var mockReservationsQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn(() => Promise.resolve(reservationsResult)),
};
var mockLtvQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(() => Promise.resolve(ltvResult)),
};

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn((table) => table === 'agent_conversations' ? mockCallsQuery : mockReservationsQuery),
    schema: jest.fn(() => ({ from: () => mockLtvQuery })),
  },
}));
jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn().mockResolvedValue({ user: { restaurant_id: 'own-restaurant' } }) }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn().mockResolvedValue(false) }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ error: jest.fn() }) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn() }));

const handler = require('../guest-profile');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  callsResult = { data: [], error: null };
  reservationsResult = { data: [], error: null };
  ltvResult = { data: null, error: null };
});

test('returns a genuine empty profile when all sources succeeded', async () => {
  const res = response();
  await handler({ method: 'GET', query: { phone: '+5511999888777' } }, res);

  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: true,
    profile: expect.objectContaining({ call_stats: expect.objectContaining({ total_calls: 0 }) }),
  }));
  expect(mockCallsQuery.eq).toHaveBeenCalledWith('restaurant_info_id', 'own-restaurant');
  expect(mockReservationsQuery.eq).toHaveBeenCalledWith('restaurant_id', 'own-restaurant');
  expect(mockLtvQuery.eq).toHaveBeenCalledWith('restaurant_id', 'own-restaurant');
});

test.each(['calls', 'reservations', 'ltv'])('does not disguise a %s query failure as an empty profile', async (source) => {
  const failure = { data: null, error: { message: 'database_unavailable' } };
  if (source === 'calls') callsResult = failure;
  if (source === 'reservations') reservationsResult = failure;
  if (source === 'ltv') ltvResult = failure;

  const res = response();
  await handler({ method: 'GET', query: { phone: '+5511999888777' } }, res);

  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Internal server error' });
});
