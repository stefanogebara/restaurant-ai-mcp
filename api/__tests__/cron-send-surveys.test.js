var mockSchemaFrom = jest.fn();
var mockFrom = jest.fn();
var mockSupabaseAdmin = {
  from: mockFrom,
  schema: jest.fn().mockReturnValue({ from: mockSchemaFrom }),
};
var mockSendWhatsAppMessage = jest.fn();
var mockIsWhatsAppConfigured = jest.fn();

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
jest.mock('../_lib/whatsapp-sender', () => ({
  sendWhatsAppMessage: (...a) => mockSendWhatsAppMessage(...a),
  isWhatsAppConfigured: () => mockIsWhatsAppConfigured(),
}));
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

const handler = require('../cron/send-surveys');

function mockRes() {
  const r = {};
  r.status = jest.fn().mockReturnValue(r);
  r.json = jest.fn().mockReturnValue(r);
  return r;
}

beforeAll(() => { process.env.CRON_SECRET = 'test-cron-secret'; });
afterAll(() => { delete process.env.CRON_SECRET; });
beforeEach(() => jest.clearAllMocks());

describe('cron/send-surveys', () => {
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

  test('returns 200 with reason when WhatsApp not configured', async () => {
    mockIsWhatsAppConfigured.mockReturnValue(false);
    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, sent: 0, reason: 'whatsapp_not_configured' }));
  });

  test('returns 200 with sent=0 when no survey configs', async () => {
    mockIsWhatsAppConfigured.mockReturnValue(true);
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        not: jest.fn().mockResolvedValue({ data: [], error: null }),
      }),
    });

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, sent: 0 });
  });

  test('sends surveys and returns count on happy path', async () => {
    mockIsWhatsAppConfigured.mockReturnValue(true);
    mockSchemaFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        not: jest.fn().mockResolvedValue({
          data: [{ id: 'rest-1', survey_config: { enabled: true, delay_hours: 2 }, restaurant_name: 'Test' }],
          error: null,
        }),
      }),
    });
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            not: jest.fn().mockReturnValue({
              is: jest.fn().mockReturnValue({
                lte: jest.fn().mockReturnValue({
                  order: jest.fn().mockReturnValue({
                    limit: jest.fn().mockResolvedValue({
                      data: [{ id: 'svc-1', customer_phone: '+5511999001234', customer_name: 'Ana', reservation_id: 'res-1', actual_departure: '2026-01-01T10:00:00Z' }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });
    mockSendWhatsAppMessage.mockResolvedValue({ success: true });

    const req = { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } };
    const res = mockRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, sent: 1 });
    expect(mockSendWhatsAppMessage).toHaveBeenCalled();
  });
});
