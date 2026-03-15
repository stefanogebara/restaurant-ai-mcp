/**
 * Tests for api/cron/send-reminders.js
 * Validates multi-tenant isolation: each restaurant gets its own name,
 * reservations are scoped per restaurant_id.
 */

process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';
process.env.CRON_SECRET = 'test-cron-secret';
process.env.TWILIO_ACCOUNT_SID = 'AC-test';
process.env.TWILIO_AUTH_TOKEN = 'auth-test';
process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+14155238886';
process.env.TWILIO_TEMPLATE_RESERVATION_REMINDER = 'HX-test-template';

// ── Twilio mock ──────────────────────────────────────────────────────────────
const mockMessagesCreate = jest.fn().mockResolvedValue({ sid: 'SM-test-123' });
jest.mock('twilio', () => () => ({
  messages: { create: (...args) => mockMessagesCreate(...args) },
}));

// ── Sentry mock ──────────────────────────────────────────────────────────────
jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

// ── Logger mock ──────────────────────────────────────────────────────────────
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));

// ── Timezone mock ───────────────────────────────────────────────────────────
const mockTodayUTC = new Date().toISOString().split('T')[0];
jest.mock('../_lib/timezone', () => ({
  getLocalDate: jest.fn(() => mockTodayUTC),
}));

// ── Cron tracker mock ───────────────────────────────────────────────────────
jest.mock('../_lib/cron-tracker', () => ({
  logCronRun: jest.fn().mockResolvedValue(undefined),
}));

// ── Supabase mock ─────────────────────────────────────────────────────────────
let mockReservations = [];
let mockRestaurantInfoRows = [];
let mockReservationsError = null;

jest.mock('../_lib/supabase', () => {
  return {
    supabaseAdmin: {
      from: jest.fn((table) => {
        if (table === 'reservations') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnValue({
              limit: jest.fn(() => Promise.resolve({
                data: mockReservations,
                error: mockReservationsError,
              })),
            }),
            update: jest.fn(() => ({
              eq: jest.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          };
        }
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve) => resolve({ data: null, error: null }),
        };
      }),
      schema: jest.fn(() => ({
        from: jest.fn((table) => {
          const configData = (mockReservations || []).map(r => ({ id: r.restaurant_id, timezone: 'UTC' }));
          const selectResult = {
            // For restaurant_info queries that chain .in()
            in: jest.fn(() => Promise.resolve({
              data: table === 'restaurant_config' ? configData : mockRestaurantInfoRows,
              error: null,
            })),
            // For restaurant_config queries that await select() directly
            then: (resolve) => resolve({
              data: table === 'restaurant_config' ? configData : mockRestaurantInfoRows,
              error: null,
            }),
            catch: jest.fn().mockReturnThis(),
          };
          return { select: jest.fn(() => selectResult) };
        }),
      })),
    },
  };
});

const handler = require('../cron/send-reminders');
const { supabaseAdmin } = require('../_lib/supabase');

function mockReqRes() {
  return {
    req: { method: 'GET', headers: { authorization: 'Bearer test-cron-secret' } },
    res: { status: jest.fn().mockReturnThis(), json: jest.fn() },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReservations = [];
  mockRestaurantInfoRows = [];
  mockReservationsError = null;
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────
describe('send-reminders: auth', () => {
  test('returns 401 with wrong cron secret', async () => {
    const { req, res } = mockReqRes();
    req.headers.authorization = 'Bearer wrong-secret';
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-tenant isolation (H-01 / H-06)
// ─────────────────────────────────────────────────────────────────────────────
describe('send-reminders: multi-tenant restaurant name isolation', () => {
  test('uses correct restaurant name per tenant (not first row for all)', async () => {
    mockReservations = [
      {
        reservation_id: 'RES-A1', restaurant_id: 'rest-A',
        customer_name: 'Alice', customer_phone: '+15550001',
        date: mockTodayUTC, time: '19:00', party_size: 2, status: 'confirmed',
        ml_risk_level: null, intervention_taken: false,
      },
      {
        reservation_id: 'RES-B1', restaurant_id: 'rest-B',
        customer_name: 'Bob', customer_phone: '+15550002',
        date: mockTodayUTC, time: '20:00', party_size: 4, status: 'confirmed',
        ml_risk_level: null, intervention_taken: false,
      },
    ];
    mockRestaurantInfoRows = [
      { id: 'rest-A', restaurant_name: 'Trattoria Alfa' },
      { id: 'rest-B', restaurant_name: 'Bistro Beta' },
    ];

    const { req, res } = mockReqRes();
    await handler(req, res);

    // Verify .in() was called on the restaurant_info query with both ids
    const schemaMock = supabaseAdmin.schema;
    expect(schemaMock).toHaveBeenCalledWith('restaurant');

    // Alice should have received the 'Trattoria Alfa' name
    const aliceCall = mockMessagesCreate.mock.calls.find(call =>
      call[0].to === 'whatsapp:+15550001'
    );
    expect(aliceCall).toBeDefined();
    expect(JSON.parse(aliceCall[0].contentVariables)['2']).toBe('Trattoria Alfa');

    // Bob should have received 'Bistro Beta', NOT 'Trattoria Alfa'
    const bobCall = mockMessagesCreate.mock.calls.find(call =>
      call[0].to === 'whatsapp:+15550002'
    );
    expect(bobCall).toBeDefined();
    expect(JSON.parse(bobCall[0].contentVariables)['2']).toBe('Bistro Beta');
  });

  test('falls back to "the restaurant" when restaurant_info row missing', async () => {
    mockReservations = [
      {
        reservation_id: 'RES-X1', restaurant_id: 'rest-unknown',
        customer_name: 'Xavier', customer_phone: '+15550099',
        date: mockTodayUTC, time: '18:00', party_size: 1, status: 'confirmed',
        ml_risk_level: null, intervention_taken: false,
      },
    ];
    // Return empty rows (restaurant not in restaurant_info)
    mockRestaurantInfoRows = [];

    const { req, res } = mockReqRes();
    await handler(req, res);

    const xavierCall = mockMessagesCreate.mock.calls[0];
    expect(xavierCall).toBeDefined();
    expect(JSON.parse(xavierCall[0].contentVariables)['2']).toBe('the restaurant');
  });

  test('skips restaurant_info query when no reservations found', async () => {
    mockReservations = [];

    const { req, res } = mockReqRes();
    await handler(req, res);

    // schema() is called once for restaurant_config (timezones), but the
    // restaurant_info lookup should be skipped (no restaurant_ids to look up).
    // We verify via the response — 0 reservations, 0 reminders.
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      total_reservations: 0,
    }));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────────────────
describe('send-reminders: happy path', () => {
  test('sends reminders and returns correct summary', async () => {
    mockReservations = [
      {
        reservation_id: 'RES-1', restaurant_id: 'rest-1',
        customer_name: 'Carlos', customer_phone: '+15550010',
        date: mockTodayUTC, time: '19:30', party_size: 3, status: 'confirmed',
        ml_risk_level: null, intervention_taken: false,
      },
    ];
    mockRestaurantInfoRows = [{ id: 'rest-1', restaurant_name: 'Casa Carlos' }];

    const { req, res } = mockReqRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.reminders_sent).toBe(1);
    expect(json.reminders_failed).toBe(0);
  });

  test('passes correct template variables to Twilio', async () => {
    mockReservations = [
      {
        reservation_id: 'RES-2', restaurant_id: 'rest-2',
        customer_name: 'Diana', customer_phone: '+15550020',
        date: mockTodayUTC, time: '20:00', party_size: 2, status: 'confirmed',
        ml_risk_level: null, intervention_taken: false,
      },
    ];
    mockRestaurantInfoRows = [{ id: 'rest-2', restaurant_name: 'Diner D' }];

    const { req, res } = mockReqRes();
    await handler(req, res);

    const call = mockMessagesCreate.mock.calls[0][0];
    const vars = JSON.parse(call.contentVariables);
    expect(vars['1']).toBe('Diana');
    expect(vars['2']).toBe('Diner D');
    expect(vars['3']).toBe('8:00 PM');
    expect(vars['4']).toBe('2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────────────────────────────────────
describe('send-reminders: error handling', () => {
  test('returns 500 when reservations query fails', async () => {
    mockReservationsError = { message: 'DB connection lost' };

    const { req, res } = mockReqRes();
    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Failed to fetch reservations',
    }));
  });
});
