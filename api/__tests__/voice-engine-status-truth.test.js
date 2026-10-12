'use strict';

var mockConfigResult;
var mockConfigQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(() => Promise.resolve(mockConfigResult)),
};

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: jest.fn(() => ({ from: jest.fn(() => mockConfigQuery) })) },
}));
jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn().mockResolvedValue({ user: { restaurant_id: 'own-restaurant' } }) }));
jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: (_req, _res, next) => next(),
  requireFeature: () => (_req, _res, next) => next(),
}));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn() }));

const handler = require('../voice-engine-settings');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfigResult = {
    data: { voice_engine: 'openai_realtime', voice_engine_status: null, openai_voice_id: 'alloy', elevenlabs_agent_id: null },
    error: null,
  };
});

test('missing stored status is unknown, not active', async () => {
  const res = response();
  await handler({ method: 'GET' }, res);
  expect(mockConfigQuery.eq).toHaveBeenCalledWith('id', 'own-restaurant');
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: expect.objectContaining({ voice_engine_status: 'unknown' }),
  });
});

test('an explicitly active stored engine keeps its configuration status', async () => {
  mockConfigResult.data.voice_engine_status = 'active';
  const res = response();
  await handler({ method: 'GET' }, res);
  expect(res.json).toHaveBeenCalledWith({
    success: true,
    data: expect.objectContaining({ voice_engine_status: 'active' }),
  });
});
