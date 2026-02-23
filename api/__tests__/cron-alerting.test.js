process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.CRON_SECRET = 'test-cron-secret';

const mockCaptureMessage = jest.fn();

jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
  captureMessage: (...args) => mockCaptureMessage(...args),
  captureException: jest.fn(),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));

let mockUpdateShouldFail = false;
jest.mock('../_lib/supabase', () => {
  return {
    supabaseAdmin: {
      from: jest.fn((table) => {
        if (table === 'reservations') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn().mockReturnThis(),
              lte: jest.fn().mockReturnThis(),
              is: jest.fn(() => Promise.resolve({
                data: [{
                  id: 'rec-001', reservation_id: 'RES-LATE-001',
                  customer_name: 'Test', time: '18:00', table_ids: [],
                }],
                error: null,
              })),
            })),
            update: jest.fn(() => ({
              eq: jest.fn(() => Promise.resolve({
                data: null,
                error: mockUpdateShouldFail ? { message: 'DB error' } : null,
              })),
            })),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve) => resolve({ data: null, error: null }),
        };
      }),
    },
  };
});

const handler = require('../cron/check-late-reservations');

function mockReqRes() {
  return {
    req: { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } },
    res: { status: jest.fn().mockReturnThis(), json: jest.fn() },
  };
}

beforeEach(() => { jest.clearAllMocks(); mockUpdateShouldFail = false; });

describe('cron check-late-reservations alerting', () => {
  test('does NOT call captureMessage when no errors', async () => {
    const { req, res } = mockReqRes();
    await handler(req, res);
    expect(mockCaptureMessage).not.toHaveBeenCalled();
  });

  test('calls captureMessage warning when individual update fails', async () => {
    mockUpdateShouldFail = true;
    const { req, res } = mockReqRes();
    await handler(req, res);
    expect(mockCaptureMessage).toHaveBeenCalledWith(
      expect.stringContaining('CronLateReservations'),
      'warning',
      expect.objectContaining({ errors: expect.any(Array) })
    );
  });
});
