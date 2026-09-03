var mockProcessActiveCampaigns = jest.fn();

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_services/campaignService', () => ({
  processActiveCampaigns: (...a) => mockProcessActiveCampaigns(...a),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

const handler = require('../_crons/send-campaigns');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/send-campaigns', () => {
  test('returns 401 for wrong CRON_SECRET', async () => {
    const req = { method: 'GET', headers: { authorization: 'Bearer wrong' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 405 for non-GET method', async () => {
    const req = { method: 'POST', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('returns 200 with sent count on happy path', async () => {
    mockProcessActiveCampaigns.mockResolvedValue(5);
    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, sent: 5 });
  });

  test('returns 200 with sent=0 when no campaigns', async () => {
    mockProcessActiveCampaigns.mockResolvedValue(0);
    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, sent: 0 });
  });

  test('returns 500 when processActiveCampaigns throws', async () => {
    mockProcessActiveCampaigns.mockRejectedValue(new Error('Campaign service down'));
    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
