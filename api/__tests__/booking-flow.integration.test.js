/**
 * Booking Flow Integration Tests
 *
 * Covers the end-to-end ML lifecycle:
 *   1. Reservation creation (POST /api/reservations?action=create)
 *   2. Host check-in      (POST /api/host-dashboard?action=check-in)
 *   3. Outcome recording  (POST /api/ml-outcomes?action=record-outcome)
 *   4. ROI summary        (GET  /api/ml-outcomes?action=roi-summary)
 *
 * Uses the same mock pattern as host-dashboard.test.js and
 * reservations.test.js: jest.mock for all deps, chainable Supabase mock,
 * mockReqRes helper.
 */

// ---------------------------------------------------------------------------
// Fake environment
// ---------------------------------------------------------------------------
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon-key';

const RESTAURANT_ID = 'rest-integration-001';
const RESERVATION_ID = 'RES-FLOW-001';
const SERVICE_ID = 'SRV-FLOW-001';
const INTERVENTION_ID = 'INT-FLOW-001';
const CUSTOMER_PHONE = '+34600000001';

// ---------------------------------------------------------------------------
// Shared state threaded through tests
// ---------------------------------------------------------------------------
let createdReservationId = RESERVATION_ID;

// ---------------------------------------------------------------------------
// ─── RESERVATIONS handler mocks ───────────────────────────────────────────
// ---------------------------------------------------------------------------
const mockCreateReservation = jest.fn(() =>
  Promise.resolve({
    success: true,
    data: { id: 'rec-001', fields: { 'Reservation ID': RESERVATION_ID } },
  })
);
const mockGenerateReservationId = jest.fn(() => RESERVATION_ID);
const mockFindReservationForResHandler = jest.fn(() =>
  Promise.resolve({
    success: true,
    reservation: {
      reservation_id: RESERVATION_ID,
      customer_name: 'Integration Test',
      party_size: 4,
      reservation_time: '19:00',
      status: 'confirmed',
      special_requests: '',
    },
  })
);
const mockUpdateReservationForResHandler = jest.fn(() => Promise.resolve({ success: true }));
const mockCancelReservation = jest.fn(() => Promise.resolve({ success: true }));
const mockGetReservations = jest.fn(() =>
  Promise.resolve({ success: true, data: { records: [] } })
);
const mockSchemaFromSingle = jest.fn(() =>
  Promise.resolve({
    data: { whatsapp_enabled: false, restaurant_name: 'Test Restaurant', agent_language: 'en' },
    error: null,
  })
);

// ---------------------------------------------------------------------------
// ─── HOST-DASHBOARD handler mocks ─────────────────────────────────────────
// ---------------------------------------------------------------------------
const mockGetAllTables = jest.fn(() =>
  Promise.resolve({
    success: true,
    tables: [
      { id: 't1', table_number: 1, capacity: 4, location: 'Main', status: 'available', is_fixed: false, is_joinable: true, shape: 'square' },
    ],
  })
);
const mockGetActiveServiceRecords = jest.fn(() =>
  Promise.resolve({ success: true, service_records: [] })
);
const mockGetUpcomingReservations = jest.fn(() =>
  Promise.resolve({
    success: true,
    reservations: [
      { reservation_id: RESERVATION_ID, customer_name: 'Integration Test', party_size: 4, time: '19:00', date: '2026-03-15' },
    ],
  })
);
const mockFindReservationForDashboard = jest.fn(() =>
  Promise.resolve({
    success: true,
    reservation: {
      reservation_id: RESERVATION_ID,
      customer_name: 'Integration Test',
      party_size: 4,
    },
  })
);
const mockUpdateReservationForDashboard = jest.fn(() => Promise.resolve({ success: true }));
const mockCreateServiceRecord = jest.fn(() => Promise.resolve({ success: true }));
const mockUpdateServiceRecord = jest.fn(() =>
  Promise.resolve({
    success: true,
    service_record: { reservation_id: RESERVATION_ID, table_ids: 't1', seated_at: new Date().toISOString() },
  })
);
const mockDeleteServiceRecord = jest.fn(() => Promise.resolve({ success: true }));
const mockUpdateTable = jest.fn(() =>
  Promise.resolve({ success: true, data: { fields: { 'Table Number': 1 } } })
);
const mockGenerateServiceId = jest.fn(() => SERVICE_ID);
const mockFindBestTableCombination = jest.fn(() => [
  { tables: [{ id: 't1', table_number: 1, capacity: 4 }], totalCapacity: 4, waste: 0 },
]);
const mockCanAccommodateParty = jest.fn(() => true);
const mockCreateTable = jest.fn(() =>
  Promise.resolve({ success: true, table: { id: 't1', table_number: 1 } })
);
const mockUpdateTableConfig = jest.fn(() => Promise.resolve({ success: true, table: {} }));
const mockDeleteTable = jest.fn(() => Promise.resolve({ success: true, table_number: 1 }));
const mockLinkTables = jest.fn(() => Promise.resolve({ success: true }));
const mockUnlinkTables = jest.fn(() => Promise.resolve({ success: true }));
const mockGetTableById = jest.fn(() =>
  Promise.resolve({ success: true, table: { id: 't1', table_number: 1, status: 'available' } })
);

// ---------------------------------------------------------------------------
// ─── ML-OUTCOMES handler mocks (supabaseAdmin direct) ────────────────────
// ---------------------------------------------------------------------------

// Reservation fetched by ml-outcomes — includes ml_risk_score
const ML_RESERVATION = {
  reservation_id: RESERVATION_ID,
  restaurant_id: RESTAURANT_ID,
  customer_phone: CUSTOMER_PHONE,
  party_size: 4,
  ml_risk_score: 0.78,
  ml_risk_level: 'high',
};

// Intervention record inserted by handleRecordOutcome
const ML_INTERVENTION = {
  intervention_id: INTERVENTION_ID,
  reservation_id: RESERVATION_ID,
  ml_risk_score: 0.78,
  ml_risk_level: 'high',
  intervention_type: 'call',
  action_taken: true,
  actual_outcome: 'showed_up',
  cost_of_intervention: 2.5,
  value_saved: 50,
  created_at: new Date().toISOString(),
};

// Controls what supabaseAdmin.from('...') query chains return
let mockMlOutcomesSupabaseFrom;

function buildMlOutcomesSupabaseMock() {
  const chainable = (resolvedValue) => {
    const obj = {};
    const methods = ['select', 'insert', 'update', 'eq', 'not', 'gt', 'limit', 'single', 'order'];
    methods.forEach((m) => {
      obj[m] = jest.fn((..._args) => chainable(resolvedValue));
    });
    // Make it thenable so await works
    obj.then = (resolve) => resolve(resolvedValue);
    return obj;
  };

  mockMlOutcomesSupabaseFrom = jest.fn((table) => {
    if (table === 'reservations') {
      return chainable({ data: ML_RESERVATION, error: null });
    }
    if (table === 'service_records') {
      return chainable({ data: [{ total_bill: 50 }], error: null });
    }
    if (table === 'ml_interventions') {
      return chainable({ data: ML_INTERVENTION, error: null });
    }
    if (table === 'customer_history') {
      // Return null (no existing record) so the insert branch runs
      return chainable({ data: null, error: { code: 'PGRST116' } });
    }
    return chainable({ data: null, error: null });
  });
}

// ---------------------------------------------------------------------------
// ─── jest.mock registrations ──────────────────────────────────────────────
// NOTE: jest.mock calls are hoisted to file top; factory functions run lazily.
// ---------------------------------------------------------------------------

jest.mock('../_lib/supabase', () => {
  // Reservations handler needs named exports + supabaseAdmin shape
  // Dashboard handler also uses named exports from this module
  // ml-outcomes requires supabaseAdmin directly from this module
  return {
    // Named exports used by reservations.js
    createReservation: (...args) => mockCreateReservation(...args),
    generateReservationId: (...args) => mockGenerateReservationId(...args),
    findReservation: (...args) => mockFindReservationForDashboard(...args),
    updateReservation: (...args) => mockUpdateReservationForDashboard(...args),
    cancelReservation: (...args) => mockCancelReservation(...args),
    getReservations: (...args) => mockGetReservations(...args),
    // Named exports used by host-dashboard.js
    getAllTables: (...args) => mockGetAllTables(...args),
    getActiveServiceRecords: (...args) => mockGetActiveServiceRecords(...args),
    getUpcomingReservations: (...args) => mockGetUpcomingReservations(...args),
    createServiceRecord: (...args) => mockCreateServiceRecord(...args),
    updateServiceRecord: (...args) => mockUpdateServiceRecord(...args),
    deleteServiceRecord: (...args) => mockDeleteServiceRecord(...args),
    updateTable: (...args) => mockUpdateTable(...args),
    generateServiceId: (...args) => mockGenerateServiceId(...args),
    findBestTableCombination: (...args) => mockFindBestTableCombination(...args),
    canAccommodateParty: (...args) => mockCanAccommodateParty(...args),
    createTable: (...args) => mockCreateTable(...args),
    updateTableConfig: (...args) => mockUpdateTableConfig(...args),
    deleteTable: (...args) => mockDeleteTable(...args),
    linkTables: (...args) => mockLinkTables(...args),
    unlinkTables: (...args) => mockUnlinkTables(...args),
    getTableById: (...args) => mockGetTableById(...args),
    query: {
      schema: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn(() => Promise.resolve({ data: { slug: 'test-restaurant' }, error: null })),
        })),
      })),
    },
    // supabaseAdmin used directly by ml-outcomes.js
    supabaseAdmin: {
      get from() { return mockMlOutcomesSupabaseFrom; },
      schema: () => ({
        from: () => {
          const chainable = {
            select: () => chainable,
            eq: () => chainable,
            single: () => mockSchemaFromSingle(),
          };
          return chainable;
        },
      }),
    },
  };
});

jest.mock('../_lib/auth', () => ({
  verifyAuth: jest.fn(() =>
    Promise.resolve({
      user: { id: 'user-1', restaurant_id: RESTAURANT_ID, timezone: 'UTC' },
    })
  ),
}));

jest.mock('../_lib/rate-limit', () => ({
  checkAndApplyRateLimit: jest.fn(() => Promise.resolve(false)),
  rejectOversizedBody: jest.fn(() => false),
}));

jest.mock('../_lib/cors', () => ({
  setInternalCors: jest.fn(),
  setWebhookCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

jest.mock('../_lib/sentry', () => ({
  initSentry: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('../_lib/validation', () => ({
  validateServiceRecord: jest.fn(() => ({ valid: true, errors: [] })),
  validateWaitlistEntry: jest.fn(() => ({ valid: true, errors: [] })),
  sanitizeInput: jest.fn((v) => v),
}));

jest.mock('../_lib/constants', () => ({
  getDiningDuration: jest.fn(() => 90),
  DEFAULT_DINING_DURATION_MINUTES: 90,
}));

jest.mock('../_lib/whatsapp-sender', () => ({
  isWhatsAppConfigured: jest.fn(() => false),
  sendReservationConfirmation: jest.fn(() => Promise.resolve({ success: true })),
}));

jest.mock('../_lib/customer-history', () => ({
  findOrCreateCustomer: jest.fn(() => Promise.resolve({ id: 'cust-001' })),
  updateCustomerHistory: jest.fn(() => Promise.resolve()),
  getCustomerStats: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('../ml/data-logger', () => ({
  logCustomerShowedUp: jest.fn(() => Promise.resolve()),
  logCustomerCancelled: jest.fn(() => Promise.resolve()),
  logReservationCreated: jest.fn(() => Promise.resolve()),
}));

jest.mock('../services/mlRiskScoring', () => ({
  calculateRiskScore: jest.fn(() => Promise.resolve({
    riskScore: 78,
    riskLevel: 'high',
    confidence: 0.85,
    factors: [{ description: 'New customer' }],
    modelVersion: 'heuristic-v1',
  })),
  getRecommendedIntervention: jest.fn(() => ({ type: 'call', priority: 'high' })),
}));

jest.mock('../_lib/subscription-middleware', () => ({
  checkSubscription: jest.fn((_req, _res, next) => next()),
  checkReservationLimits: jest.fn((_req, _res, next) => next()),
}));

jest.mock('../_lib/usage-tracking', () => ({
  trackUsage: jest.fn(),
}));

jest.mock('../_lib/timezone', () => ({
  getLocalDate: jest.fn(() => '2026-03-15'),
}));

jest.mock('../services/guestMemory', () => ({
  createMemory: jest.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// ─── Require handlers (after all mocks registered) ────────────────────────
// ---------------------------------------------------------------------------
const reservationsHandler = require('../reservations');
const dashboardHandler = require('../host-dashboard');
const mlOutcomesHandler = require('../ml-outcomes');

// ---------------------------------------------------------------------------
// ─── Helpers ──────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------
function mockReqRes({ action, method = 'POST', body = {}, query = {} } = {}) {
  const req = {
    method,
    query: { action, ...query },
    body,
    headers: { authorization: 'Bearer test-token' },
    socket: { remoteAddress: '127.0.0.1' },
    ip: '127.0.0.1',
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
    end: jest.fn(),
  };
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
  buildMlOutcomesSupabaseMock();
});

// ===========================================================================
// STEP 1: Reservation creation
// ===========================================================================
describe('Step 1 — Create reservation', () => {
  test('creates a reservation and returns a reservation ID', async () => {
    const { req, res } = mockReqRes({
      action: 'create',
      method: 'POST',
      body: {
        customer_name: 'Integration Test',
        customer_phone: CUSTOMER_PHONE,
        party_size: 4,
        date: '2026-03-15',
        time: '19:00',
      },
    });

    await reservationsHandler(req, res);

    const statusCall = res.status.mock.calls[0]?.[0];
    const body = res.json.mock.calls[0]?.[0];

    expect([200, 201]).toContain(statusCall);
    expect(body).toBeDefined();
    expect(mockCreateReservation).toHaveBeenCalled();
  });

  test('returns 400 when required fields are missing', async () => {
    const { req, res } = mockReqRes({
      action: 'create',
      method: 'POST',
      body: { customer_name: 'No Phone' }, // missing phone + party_size + date/time
    });

    await reservationsHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ===========================================================================
// STEP 2: Host check-in
// ===========================================================================
describe('Step 2 — Host check-in', () => {
  test('checks in a reservation and creates service record', async () => {
    const { req, res } = mockReqRes({
      action: 'check-in',
      method: 'POST',
      body: { reservation_id: RESERVATION_ID },
    });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockFindReservationForDashboard).toHaveBeenCalled();

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
  });

  test('returns table recommendations after check-in', async () => {
    const { req, res } = mockReqRes({
      action: 'check-in',
      method: 'POST',
      body: { reservation_id: RESERVATION_ID },
    });

    await dashboardHandler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.recommendation).toBeDefined();
  });

  test('check-in fails when reservation not found', async () => {
    mockFindReservationForDashboard.mockResolvedValueOnce({
      success: false,
      error: 'Reservation not found',
    });

    const { req, res } = mockReqRes({
      action: 'check-in',
      method: 'POST',
      body: { reservation_id: 'RES-NONEXISTENT' },
    });

    await dashboardHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ===========================================================================
// STEP 3: Outcome recording — showed_up with intervention
// ===========================================================================
describe('Step 3a — Record outcome: showed_up + intervention', () => {
  test('records showed_up outcome and calculates positive ROI', async () => {
    const { req, res } = mockReqRes({
      action: 'record-outcome',
      method: 'POST',
      body: {
        reservation_id: RESERVATION_ID,
        actual_outcome: 'showed_up',
        intervention_taken: true,
        intervention_type: 'call',
        intervention_cost: 2.5,
        notes: 'Called customer to confirm',
      },
    });

    await mlOutcomesHandler(req, res);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.actual_outcome).toBe('showed_up');
    expect(body.data.value_saved).toBeGreaterThan(0);
    expect(body.data.ml_risk_score).toBe(0.78);
    expect(body.data.ml_risk_level).toBe('high');
  });

  test('ROI multiplier is positive when intervention prevented no-show', async () => {
    const { req, res } = mockReqRes({
      action: 'record-outcome',
      method: 'POST',
      body: {
        reservation_id: RESERVATION_ID,
        actual_outcome: 'showed_up',
        intervention_taken: true,
        intervention_type: 'call',
        intervention_cost: 2.5,
      },
    });

    await mlOutcomesHandler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.roi_multiplier).toBeDefined();
    // e.g. "(50-2.5)/2.5*100 = 1900%"
    const roiPct = parseFloat(body.data.roi_multiplier);
    expect(roiPct).toBeGreaterThan(0);
  });
});

// ===========================================================================
// STEP 3b: Outcome recording — no_show (missed opportunity)
// ===========================================================================
describe('Step 3b — Record outcome: no_show without intervention', () => {
  test('records no_show with 0 value_saved', async () => {
    const { req, res } = mockReqRes({
      action: 'record-outcome',
      method: 'POST',
      body: {
        reservation_id: RESERVATION_ID,
        actual_outcome: 'no_show',
        intervention_taken: false,
      },
    });

    await mlOutcomesHandler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.value_saved).toBe(0);
  });
});

// ===========================================================================
// STEP 3c: Outcome recording — validation errors
// ===========================================================================
describe('Step 3c — Outcome recording validation', () => {
  test('returns 400 when reservation_id is missing', async () => {
    const { req, res } = mockReqRes({
      action: 'record-outcome',
      method: 'POST',
      body: { actual_outcome: 'showed_up' },
    });

    await mlOutcomesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toMatch(/reservation_id/);
  });

  test('returns 400 when actual_outcome is invalid', async () => {
    const { req, res } = mockReqRes({
      action: 'record-outcome',
      method: 'POST',
      body: { reservation_id: RESERVATION_ID, actual_outcome: 'maybe' },
    });

    await mlOutcomesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 400 when reservation has no ml_risk_score', async () => {
    // Override: return reservation without ml_risk_score
    mockMlOutcomesSupabaseFrom = jest.fn((table) => {
      const chainable = (val) => {
        const obj = {};
        ['select', 'insert', 'update', 'eq', 'not', 'gt', 'limit', 'single', 'order'].forEach(
          (m) => { obj[m] = jest.fn(() => chainable(val)); }
        );
        obj.then = (resolve) => resolve(val);
        return obj;
      };
      if (table === 'reservations') {
        return chainable({
          data: { ...ML_RESERVATION, ml_risk_score: null, ml_risk_level: null },
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });

    const { req, res } = mockReqRes({
      action: 'record-outcome',
      method: 'POST',
      body: { reservation_id: RESERVATION_ID, actual_outcome: 'showed_up' },
    });

    await mlOutcomesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toMatch(/ML risk score/i);
  });

  test('returns 404 when reservation does not exist', async () => {
    mockMlOutcomesSupabaseFrom = jest.fn((table) => {
      const chainable = (val) => {
        const obj = {};
        ['select', 'insert', 'update', 'eq', 'not', 'gt', 'limit', 'single', 'order'].forEach(
          (m) => { obj[m] = jest.fn(() => chainable(val)); }
        );
        obj.then = (resolve) => resolve(val);
        return obj;
      };
      if (table === 'reservations') {
        return chainable({ data: null, error: { message: 'Row not found', code: 'PGRST116' } });
      }
      return chainable({ data: null, error: null });
    });

    const { req, res } = mockReqRes({
      action: 'record-outcome',
      method: 'POST',
      body: { reservation_id: 'RES-GHOST', actual_outcome: 'showed_up' },
    });

    await mlOutcomesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ===========================================================================
// STEP 4: ROI Summary
// ===========================================================================
describe('Step 4 — ROI Summary', () => {
  beforeEach(() => {
    // Override ml_interventions to return seeded records
    mockMlOutcomesSupabaseFrom = jest.fn((table) => {
      const chainable = (val) => {
        const obj = {};
        ['select', 'insert', 'update', 'eq', 'not', 'gt', 'limit', 'single', 'order'].forEach(
          (m) => { obj[m] = jest.fn(() => chainable(val)); }
        );
        obj.then = (resolve) => resolve(val);
        return obj;
      };
      if (table === 'ml_interventions') {
        return chainable({
          data: [
            {
              intervention_id: 'INT-001',
              reservation_id: 'RES-001',
              ml_risk_level: 'high',
              actual_outcome: 'showed_up',
              action_taken: true,
              cost_of_intervention: 2.5,
              value_saved: 50,
              created_at: new Date().toISOString(),
            },
            {
              intervention_id: 'INT-002',
              reservation_id: 'RES-002',
              ml_risk_level: 'medium',
              actual_outcome: 'no_show',
              action_taken: false,
              cost_of_intervention: 0,
              value_saved: 0,
              created_at: new Date().toISOString(),
            },
          ],
          error: null,
        });
      }
      return chainable({ data: null, error: null });
    });
  });

  test('returns aggregate ROI metrics', async () => {
    const { req, res } = mockReqRes({ action: 'roi-summary', method: 'GET' });

    await mlOutcomesHandler(req, res);

    expect(res.json).toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.summary).toBeDefined();
    expect(body.data.summary.total_interventions).toBe(2);
  });

  test('outcome counts sum correctly', async () => {
    const { req, res } = mockReqRes({ action: 'roi-summary', method: 'GET' });

    await mlOutcomesHandler(req, res);

    const { outcomes } = res.json.mock.calls[0][0].data;
    expect(outcomes.showed_up).toBe(1);
    expect(outcomes.no_show).toBe(1);
    expect(outcomes.cancelled).toBe(0);
  });

  test('intervention effectiveness reports correct success rate', async () => {
    const { req, res } = mockReqRes({ action: 'roi-summary', method: 'GET' });

    await mlOutcomesHandler(req, res);

    const { intervention_effectiveness } = res.json.mock.calls[0][0].data;
    // Only INT-001 has action_taken=true and showed_up → 100%
    expect(intervention_effectiveness.interventions_with_action).toBe(1);
    expect(intervention_effectiveness.successful_interventions).toBe(1);
    expect(intervention_effectiveness.success_rate).toBe('100.0%');
  });

  test('total value saved matches sum of individual records', async () => {
    const { req, res } = mockReqRes({ action: 'roi-summary', method: 'GET' });

    await mlOutcomesHandler(req, res);

    const { summary } = res.json.mock.calls[0][0].data;
    expect(parseFloat(summary.total_value_saved)).toBe(50);
    expect(parseFloat(summary.total_cost)).toBe(2.5);
  });

  test('returns recent_interventions list', async () => {
    const { req, res } = mockReqRes({ action: 'roi-summary', method: 'GET' });

    await mlOutcomesHandler(req, res);

    const { recent_interventions } = res.json.mock.calls[0][0].data;
    expect(Array.isArray(recent_interventions)).toBe(true);
    expect(recent_interventions.length).toBe(2);
    expect(recent_interventions[0]).toHaveProperty('intervention_id');
    expect(recent_interventions[0]).toHaveProperty('outcome');
    expect(recent_interventions[0]).toHaveProperty('roi');
  });
});

// ===========================================================================
// Edge cases: mark-action-taken
// ===========================================================================
describe('mark-action-taken action', () => {
  test('marks intervention action taken on a reservation', async () => {
    mockMlOutcomesSupabaseFrom = jest.fn((table) => {
      const chainable = (val) => {
        const obj = {};
        ['select', 'insert', 'update', 'eq', 'not', 'gt', 'limit', 'single', 'order'].forEach(
          (m) => { obj[m] = jest.fn(() => chainable(val)); }
        );
        obj.then = (resolve) => resolve(val);
        return obj;
      };
      if (table === 'reservations') {
        return chainable({ data: ML_RESERVATION, error: null });
      }
      if (table === 'ml_interventions') {
        return chainable({ data: { intervention_id: INTERVENTION_ID }, error: null });
      }
      return chainable({ data: null, error: null });
    });

    const { req, res } = mockReqRes({
      action: 'mark-action-taken',
      method: 'PATCH',
      body: {
        reservation_id: RESERVATION_ID,
        intervention_type: 'phone_call',
        staff_name: 'Carlos',
        notes: 'Confirmed by phone',
      },
    });

    await mlOutcomesHandler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.reservation_id).toBe(RESERVATION_ID);
    expect(body.data.intervention_type).toBe('phone_call');
  });

  test('maps legacy confirmation_call to phone_call', async () => {
    mockMlOutcomesSupabaseFrom = jest.fn((table) => {
      const chainable = (val) => {
        const obj = {};
        ['select', 'insert', 'update', 'eq', 'not', 'gt', 'limit', 'single', 'order'].forEach(
          (m) => { obj[m] = jest.fn(() => chainable(val)); }
        );
        obj.then = (resolve) => resolve(val);
        return obj;
      };
      if (table === 'reservations') return chainable({ data: ML_RESERVATION, error: null });
      if (table === 'ml_interventions') return chainable({ data: null, error: null });
      return chainable({ data: null, error: null });
    });

    const { req, res } = mockReqRes({
      action: 'mark-action-taken',
      method: 'PATCH',
      body: {
        reservation_id: RESERVATION_ID,
        intervention_type: 'confirmation_call', // legacy type
      },
    });

    await mlOutcomesHandler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.intervention_type).toBe('phone_call');
  });

  test('returns 400 when reservation_id is missing', async () => {
    const { req, res } = mockReqRes({
      action: 'mark-action-taken',
      method: 'PATCH',
      body: { intervention_type: 'phone_call' },
    });

    await mlOutcomesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ===========================================================================
// Auth guard
// ===========================================================================
describe('Auth guard', () => {
  test('ml-outcomes returns 401 when auth fails', async () => {
    const { verifyAuth } = require('../_lib/auth');
    verifyAuth.mockResolvedValueOnce({ error: 'Unauthorized', status: 401 });

    const { req, res } = mockReqRes({
      action: 'roi-summary',
      method: 'GET',
    });

    await mlOutcomesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('ml-outcomes returns 400 for unknown action', async () => {
    const { req, res } = mockReqRes({
      action: 'unknown-action',
      method: 'GET',
    });

    await mlOutcomesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
