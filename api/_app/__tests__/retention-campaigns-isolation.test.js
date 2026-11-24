var mockVerifyAuth = jest.fn();
var mockGetCampaignStats = jest.fn();
var mockSendCampaignBatch = jest.fn();
var mockUpdateResult = { data: null, error: null };
var mockUpdateChain = {
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  maybeSingle: jest.fn(() => Promise.resolve(mockUpdateResult)),
};

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: jest.fn(() => ({ from: jest.fn(() => mockUpdateChain) })),
  },
}));
jest.mock('../_lib/auth', () => ({ verifyAuth: (...args) => mockVerifyAuth(...args) }));
jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: (_req, _res, next) => next(),
  requireFeature: () => (_req, _res, next) => next(),
}));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/email', () => ({ sendRetentionCampaignEmail: jest.fn() }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: jest.fn() }));
jest.mock('../_services/campaignService', () => ({
  createCampaign: jest.fn(),
  sendCampaignBatch: (...args) => mockSendCampaignBatch(...args),
  getCampaignStats: (...args) => mockGetCampaignStats(...args),
  getSegmentCustomers: jest.fn(),
}));

const handler = require('../retention-campaigns');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyAuth.mockResolvedValue({ user: { restaurant_id: 'own-restaurant' } });
  mockUpdateResult = { data: null, error: null };
});

test('delivery statistics are scoped to the authenticated restaurant', async () => {
  mockGetCampaignStats.mockResolvedValue(null);
  const res = response();

  await handler({ method: 'GET', query: { action: 'campaign_stats', campaign_id: 'foreign' } }, res);

  expect(mockGetCampaignStats).toHaveBeenCalledWith('foreign', 'own-restaurant');
  expect(res.status).toHaveBeenCalledWith(404);
});

test('a foreign campaign is never sent when the scoped update matches nothing', async () => {
  const res = response();

  await handler({ method: 'POST', query: { action: 'send' }, body: { campaign_id: 'foreign' } }, res);

  expect(mockUpdateChain.eq).toHaveBeenCalledWith('restaurant_id', 'own-restaurant');
  expect(res.status).toHaveBeenCalledWith(404);
  expect(mockSendCampaignBatch).not.toHaveBeenCalled();
});

test('an owned campaign is sent with its restaurant scope', async () => {
  mockUpdateResult = { data: { id: 'owned' }, error: null };
  mockSendCampaignBatch.mockResolvedValue(2);
  const res = response();

  await handler({ method: 'POST', query: { action: 'send' }, body: { campaign_id: 'owned' } }, res);

  expect(mockSendCampaignBatch).toHaveBeenCalledWith('owned', 10, 'own-restaurant');
  expect(res.json).toHaveBeenCalledWith({ success: true, sent: 2 });
});
