process.env.CRON_SECRET = 'test-cron-secret';
process.env.WHATSAPP_ACCESS_TOKEN = 'fake-token';
process.env.HEALTH_ALERT_PHONE = '+5511999999999';

// Mock global fetch so we control what debug_token returns per test.
const mockFetch = jest.fn();
global.fetch = (...args) => mockFetch(...args);

const mockSendWhatsApp = jest.fn();
const mockIsConfigured = jest.fn(() => true);
jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: (...args) => mockSendWhatsApp(...args),
  isWhatsAppConfigured: () => mockIsConfigured(),
}));

const mockLogCronRun = jest.fn();
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: (...args) => mockLogCronRun(...args),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));

jest.mock('../_lib/cron-config', () => ({
  isCronEnabled: jest.fn(async () => true),
}));

const handler = require('../cron/check-meta-token-expiry');
const { inspectToken, buildAlertMessage, ALERT_THRESHOLD_DAYS } = handler;

function makeReq(overrides = {}) {
  return {
    headers: { authorization: 'Bearer test-cron-secret', ...overrides.headers },
    ...overrides,
  };
}
function makeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

const NOW_SEC = 1_780_000_000;
beforeAll(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW_SEC * 1000);
});
afterAll(() => {
  Date.now.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockReset();
  mockIsConfigured.mockReturnValue(true);
  mockSendWhatsApp.mockResolvedValue({ success: true });
});

function mockDebugTokenResponse({ isValid = true, expiresAt = NOW_SEC + 60 * 86400, scopes = ['whatsapp_business_messaging'], app = 'Seatable Reservations' } = {}) {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { is_valid: isValid, expires_at: expiresAt, scopes, application: app, type: 'SYSTEM_USER' } }),
  });
}

describe('check-meta-token-expiry', () => {
  test('rejects requests without CRON_SECRET', async () => {
    const req = makeReq({ headers: { authorization: 'Bearer wrong' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('healthy: no alert when 60 days remain', async () => {
    mockDebugTokenResponse({ expiresAt: NOW_SEC + 60 * 86400 });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ is_valid: true, alerted: false }));
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
  });

  test('expiring soon: alert when exactly at threshold', async () => {
    mockDebugTokenResponse({ expiresAt: NOW_SEC + ALERT_THRESHOLD_DAYS * 86400 });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alerted: true, whatsapp_sent: true }));
    expect(mockSendWhatsApp).toHaveBeenCalledTimes(1);
    const [, msg] = mockSendWhatsApp.mock.calls[0];
    expect(msg).toMatch(/expiring soon/i);
    expect(msg).toMatch(/business\.facebook\.com/);
  });

  test('expired: alert with EXPIRED message when is_valid=false', async () => {
    mockDebugTokenResponse({ isValid: false, expiresAt: NOW_SEC - 10 * 86400 });
    const res = makeRes();
    await handler(makeReq(), res);
    const [, msg] = mockSendWhatsApp.mock.calls[0];
    expect(msg).toMatch(/EXPIRED/);
    expect(msg).toMatch(/All WhatsApp flows are currently broken/);
  });

  test('no alert phone configured: logs but does not fail', async () => {
    delete process.env.HEALTH_ALERT_PHONE;
    mockDebugTokenResponse({ expiresAt: NOW_SEC + 5 * 86400 });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alerted: true, whatsapp_sent: false }));
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
    process.env.HEALTH_ALERT_PHONE = '+5511999999999';
  });

  test('debug_token network error: skipped, not alerted', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ skipped: 'inspect_failed' }));
    expect(mockSendWhatsApp).not.toHaveBeenCalled();
  });

  test('never-expires token (expires_at=0): no alert', async () => {
    mockDebugTokenResponse({ expiresAt: 0 });
    const res = makeRes();
    await handler(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ alerted: false }));
  });

  test('inspectToken computes daysUntilExpiry correctly', async () => {
    mockDebugTokenResponse({ expiresAt: NOW_SEC + 30 * 86400 });
    const result = await inspectToken('any');
    expect(result.ok).toBe(true);
    expect(result.daysUntilExpiry).toBe(30);
  });

  test('buildAlertMessage includes rotation steps', () => {
    const msg = buildAlertMessage({ isValid: true, daysUntilExpiry: 5, expiresAt: NOW_SEC + 5 * 86400, app: 'Seatable Reservations' });
    expect(msg).toMatch(/5 days left/);
    expect(msg).toMatch(/whatsapp_business_messaging \+ whatsapp_business_management/);
    expect(msg).toMatch(/Update WHATSAPP_ACCESS_TOKEN in Vercel/);
  });
});
