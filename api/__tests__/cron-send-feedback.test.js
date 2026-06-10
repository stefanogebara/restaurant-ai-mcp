var mockSendPendingFeedback = jest.fn();
var mockExpireOldFeedback = jest.fn();

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_services/feedbackService', () => ({
  sendPendingFeedback: (...a) => mockSendPendingFeedback(...a),
  expireOldFeedback: (...a) => mockExpireOldFeedback(...a),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

const handler = require('../cron/send-feedback');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/send-feedback', () => {
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

  test('returns 200 with sent and expired counts', async () => {
    mockSendPendingFeedback.mockResolvedValue(3);
    mockExpireOldFeedback.mockResolvedValue(1);

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, sent: 3, expired: 1 });
  });

  test('returns 200 with zero counts when nothing to process', async () => {
    mockSendPendingFeedback.mockResolvedValue(0);
    mockExpireOldFeedback.mockResolvedValue(0);

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith({ success: true, sent: 0, expired: 0 });
  });

  test('returns 500 when service throws', async () => {
    mockSendPendingFeedback.mockRejectedValue(new Error('Service failure'));
    mockExpireOldFeedback.mockResolvedValue(0);

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
