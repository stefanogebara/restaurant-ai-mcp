// ---- Mocks ----
const mockSendWhatsAppMessage = jest.fn();
const mockIsWhatsAppConfigured = jest.fn();
const mockLogCronRun = jest.fn();

jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: (...args) => mockSendWhatsAppMessage(...args),
  isWhatsAppConfigured: () => mockIsWhatsAppConfigured(),
}));

jest.mock('../_lib/upsell-generator', () => ({
  generateUpsellMessage: jest.fn().mockResolvedValue('AI generated message'),
  buildFallbackMessage: jest.fn().mockReturnValue('Fallback message'),
}));

jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: (...args) => mockLogCronRun(...args),
}));

jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Supabase mock — everything must be self-contained inside the factory
// because jest.mock hoists and disallows out-of-scope variable references
// (except those prefixed with 'mock')
const mockFrom = jest.fn();
const mockSchema = jest.fn();

jest.mock('../_lib/supabase', () => {
  const mockAdmin = { from: mockFrom, schema: mockSchema };
  mockSchema.mockReturnValue(mockAdmin);
  return { supabaseAdmin: mockAdmin };
});

// Table-based mock routing — set up in beforeEach
const tableDataMap = {};

function setTableData(tableName, data, error = null) {
  tableDataMap[tableName] = { data, error };
}

function createQueryBuilder(resolveData, resolveError = null) {
  const result = { data: resolveData, error: resolveError };
  const self = {};
  self.select = jest.fn().mockReturnValue(self);
  self.eq = jest.fn().mockReturnValue(self);
  self.gte = jest.fn().mockReturnValue(self);
  self.lte = jest.fn().mockReturnValue(self);
  self.not = jest.fn().mockReturnValue(self);
  self.in = jest.fn().mockReturnValue(self);
  self.limit = jest.fn().mockResolvedValue(result);
  self.order = jest.fn().mockReturnValue(self);
  self.single = jest.fn().mockResolvedValue(result);
  self.upsert = jest.fn().mockResolvedValue({ data: null, error: null });
  self.then = (resolve) => resolve(result);
  // order().limit() chain
  self.order.mockReturnValue({ ...self, limit: jest.fn().mockResolvedValue(result) });
  return self;
}

// Must require AFTER all jest.mock calls
const handler = require('../_crons/pre-reservation-upsell');

// ---- Helpers ----
function mockReq(authHeader) {
  return { headers: { authorization: authHeader } };
}

function mockRes() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  return res;
}

// ---- Tests ----
describe('pre-reservation-upsell cron', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV, CRON_SECRET: 'test-secret', ANTHROPIC_API_KEY: 'test-key' };
    mockIsWhatsAppConfigured.mockReturnValue(true);
    mockSendWhatsAppMessage.mockResolvedValue({ success: true, messageId: 'msg-123' });

    // Wire mockFrom to use table-based routing
    mockFrom.mockImplementation((tableName) => {
      const entry = tableDataMap[tableName] || { data: [], error: null };
      return createQueryBuilder(entry.data, entry.error);
    });

    // Re-wire schema mock (cleared by clearAllMocks)
    const { supabaseAdmin } = require('../_lib/supabase');
    mockSchema.mockReturnValue(supabaseAdmin);

    // Clear table data
    Object.keys(tableDataMap).forEach((k) => delete tableDataMap[k]);
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('returns 401 when auth header is missing', async () => {
    const req = mockReq(undefined);
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when auth header is wrong', async () => {
    const req = mockReq('Bearer wrong-secret');
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 200 with skip when WhatsApp not configured', async () => {
    mockIsWhatsAppConfigured.mockReturnValue(false);
    const req = mockReq('Bearer test-secret');
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ skipped: true }));
  });

  it('returns 500 when CRON_SECRET is not set', async () => {
    delete process.env.CRON_SECRET;
    const req = mockReq('Bearer test-secret');
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('returns 200 with sent: 0 when no restaurants have upsell enabled', async () => {
    setTableData('restaurant_config', [
      { id: 'r1', restaurant_name: 'Test', restaurant_profile: {}, notification_preferences: {} },
    ]);

    const req = mockReq('Bearer test-secret');
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: 0 }));
  });

  it('processes reservations for opted-in restaurants', async () => {
    setTableData('restaurant_config', [
      {
        id: 'r1',
        restaurant_name: 'Bella Italia',
        restaurant_profile: { signature_dishes: [{ name: 'Pasta', description: 'Fresh' }] },
        notification_preferences: { pre_reservation_upsell: true },
      },
    ]);
    setTableData('reservations', [
      { id: '1', reservation_id: 'res-001', customer_name: 'Alice', customer_phone: '+1555000001', date: '2026-03-15', time: '20:00', party_size: 2 },
    ]);
    setTableData('upsell_messages_log', []);
    setTableData('customer_history', []);
    setTableData('customer_ltv', []);
    setTableData('manager_memory', []);

    const req = mockReq('Bearer test-secret');
    const res = mockRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith('+1555000001', expect.any(String));
  });

  it('skips reservations that were already sent (dedup)', async () => {
    setTableData('restaurant_config', [
      {
        id: 'r1',
        restaurant_name: 'Test',
        restaurant_profile: { signature_dishes: [{ name: 'Dish', description: 'Good' }] },
        notification_preferences: { pre_reservation_upsell: true },
      },
    ]);
    setTableData('reservations', [
      { id: '1', reservation_id: 'res-already', customer_name: 'Bob', customer_phone: '+1555000002', date: '2026-03-15', time: '19:00', party_size: 3 },
    ]);
    setTableData('upsell_messages_log', [{ reservation_id: 'res-already' }]);

    const req = mockReq('Bearer test-secret');
    const res = mockRes();
    await handler(req, res);

    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('logs to cron tracker on success', async () => {
    setTableData('restaurant_config', []);

    const req = mockReq('Bearer test-secret');
    const res = mockRes();
    await handler(req, res);

    expect(mockLogCronRun).toHaveBeenCalledWith('pre-reservation-upsell', true, expect.any(Object));
  });
});
