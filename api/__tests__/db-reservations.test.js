/**
 * Tests for api/_lib/db-reservations.js
 * Covers all CRUD operations for reservations.
 */

// ---------------------------------------------------------------------------
// Chainable Supabase mock that resolves to a mutable result
// ---------------------------------------------------------------------------
const dbMockResult = { data: null, error: null };

function makeChain(result) {
  const res = result || dbMockResult;
  const proxy = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve(res);
      return () => proxy;
    },
  });
  return proxy;
}

const mockFrom = jest.fn(() => makeChain());

jest.mock('../_lib/db-clients', () => ({
  supabase: { from: (...args) => mockFrom(...args) },
  handleSupabaseResponse: jest.fn((data, error, _op) => {
    if (error) return { success: false, error: true, message: error.message || 'Database operation failed' };
    return { success: true, data };
  }),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../_lib/timezone', () => ({
  getLocalDate: jest.fn(() => '2026-02-21'),
  getLocalTime: jest.fn(() => '14:00'),
}));

const {
  getReservations,
  getReservationById,
  createReservation,
  updateReservation,
  findReservation,
  cancelReservation,
  markReservationAsNoShow,
  getUpcomingReservations,
} = require('../_lib/db-reservations');

const { handleSupabaseResponse } = require('../_lib/db-clients');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setMock(data, error = null) {
  dbMockResult.data = data;
  dbMockResult.error = error;
}

const SAMPLE_ROW = {
  id: 'uuid-1',
  reservation_id: 'RES-001',
  customer_name: 'Alice',
  customer_phone: '+1234567890',
  customer_email: 'alice@example.com',
  party_size: 2,
  date: '2026-02-21',
  time: '19:00',
  special_requests: 'Window seat',
  status: 'confirmed',
  table_ids: ['t1'],
  checked_in_at: null,
  notes: null,
  ml_risk_score: null,
  ml_risk_level: null,
  ml_confidence: null,
  ml_model_version: null,
  ml_prediction_timestamp: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  // Always reset mockFrom to its default implementation after each test
  mockFrom.mockImplementation(() => makeChain());
  setMock(null, null);
});

// ---------------------------------------------------------------------------
// getReservations
// ---------------------------------------------------------------------------
describe('getReservations', () => {
  test('success: returns mapped records', async () => {
    setMock([SAMPLE_ROW]);
    const result = await getReservations('rest-1');
    expect(result.success).toBe(true);
    expect(result.data.records).toHaveLength(1);
    expect(result.data.records[0].fields['Reservation ID']).toBe('RES-001');
    expect(result.data.records[0].fields['ML Risk Score']).toBeNull();
  });

  test('applies status filter', async () => {
    setMock([SAMPLE_ROW]);
    const result = await getReservations('rest-1', { status: 'confirmed' });
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('reservations');
  });

  test('applies date filter', async () => {
    setMock([SAMPLE_ROW]);
    const result = await getReservations('rest-1', { date: '2026-02-21' });
    expect(result.success).toBe(true);
  });

  test('applies customer_phone filter (line 25)', async () => {
    setMock([SAMPLE_ROW]);
    const result = await getReservations('rest-1', { customer_phone: '+1234567890' });
    expect(result.success).toBe(true);
  });

  test('applies all three filters together', async () => {
    setMock([SAMPLE_ROW]);
    const result = await getReservations('rest-1', {
      status: 'confirmed', date: '2026-02-21', customer_phone: '+1234567890',
    });
    expect(result.success).toBe(true);
  });

  test('error: delegates to handleSupabaseResponse', async () => {
    setMock(null, { message: 'DB error' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'DB error' });
    const result = await getReservations('rest-1');
    expect(result.success).toBe(false);
    expect(handleSupabaseResponse).toHaveBeenCalledWith(null, { message: 'DB error' }, 'GET reservations');
  });
});

// ---------------------------------------------------------------------------
// getReservationById
// ---------------------------------------------------------------------------
describe('getReservationById', () => {
  test('success: returns reservation fields', async () => {
    setMock(SAMPLE_ROW);
    const result = await getReservationById('rest-1', 'RES-001');
    expect(result.success).toBe(true);
    expect(result.data.fields['Customer Name']).toBe('Alice');
  });

  test('no data: returns not found', async () => {
    setMock(null);
    const result = await getReservationById('rest-1', 'RES-MISSING');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Reservation not found');
  });

  test('DB error: delegates to handleSupabaseResponse', async () => {
    setMock(null, { message: 'query failed' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'query failed' });
    const result = await getReservationById('rest-1', 'RES-001');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createReservation
// ---------------------------------------------------------------------------
describe('createReservation', () => {
  test('success: returns created reservation', async () => {
    setMock({ ...SAMPLE_ROW, status: 'pending' });
    const result = await createReservation('rest-1', {
      'Reservation ID': 'RES-002',
      'Customer Name': 'Bob',
      'Customer Phone': '+9876543210',
      'Customer Email': 'bob@example.com',
      'Party Size': 3,
      'Date': '2026-03-01',
      'Time': '20:00',
      'Special Requests': null,
      'Status': 'pending',
      'Table IDs': ['t2'],
      'Notes': null,
    });
    expect(result.success).toBe(true);
  });

  test('uses default status "pending" when Status not provided', async () => {
    setMock(SAMPLE_ROW);
    const result = await createReservation('rest-1', {
      'Reservation ID': 'RES-003',
      'Customer Name': 'Carol',
      'Customer Phone': '+111222333',
      'Party Size': 2,
      'Date': '2026-03-15',
      'Time': '18:00',
    });
    expect(result.success).toBe(true);
  });

  test('DB error: delegates to handleSupabaseResponse', async () => {
    setMock(null, { message: 'insert failed' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'insert failed' });
    const result = await createReservation('rest-1', {
      'Reservation ID': 'RES-ERR',
      'Customer Name': 'Error',
      'Customer Phone': '+000',
      'Party Size': 1,
      'Date': '2026-01-01',
      'Time': '12:00',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateReservation
// ---------------------------------------------------------------------------
describe('updateReservation', () => {
  test('success with UUID recordId (id column)', async () => {
    setMock(SAMPLE_ROW);
    const result = await updateReservation('rest-1', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', {
      'Status': 'confirmed',
    });
    expect(result.success).toBe(true);
    expect(result.data.fields['Status']).toBe('confirmed');
  });

  test('success with reservation_id string (not UUID)', async () => {
    setMock(SAMPLE_ROW);
    const result = await updateReservation('rest-1', 'RES-001', {
      'Date': '2026-03-01',
      'Time': '20:00',
      'Party Size': 4,
      'Status': 'confirmed',
      'Checked In At': '2026-02-21T18:55:00Z',
      'Table IDs': ['t1', 't2'],
      'Notes': 'VIP',
      'ML Risk Score': 0.3,
      'ML Risk Level': 'low',
      'ML Confidence': 0.9,
      'ML Model Version': 'v2',
      'ML Prediction Timestamp': '2026-02-21T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  test('special_requests undefined and Updated At/Customer History are included', async () => {
    setMock(SAMPLE_ROW);
    const result = await updateReservation('rest-1', 'RES-001', {
      'Special Requests': undefined,
      'Updated At': '2026-02-21T18:00:00Z',
      'Customer History': { visits: 3 },
    });
    expect(result.success).toBe(true);
  });

  test('DB error: delegates to handleSupabaseResponse', async () => {
    setMock(null, { message: 'update failed' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'update failed' });
    const result = await updateReservation('rest-1', 'RES-001', { 'Status': 'cancelled' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findReservation
// ---------------------------------------------------------------------------
describe('findReservation', () => {
  test('finds by reservation_id', async () => {
    setMock(SAMPLE_ROW);
    const result = await findReservation('rest-1', { reservation_id: 'RES-001' });
    expect(result.success).toBe(true);
    expect(result.reservation.reservation_id).toBe('RES-001');
    expect(result.reservation.customer_email).toBe('alice@example.com');
    expect(result.reservation.special_requests).toBe('Window seat');
  });

  test('finds by customer_phone (line 186)', async () => {
    setMock(SAMPLE_ROW);
    const result = await findReservation('rest-1', { customer_phone: '+1234567890' });
    expect(result.success).toBe(true);
    expect(result.reservation.customer_phone).toBe('+1234567890');
  });

  test('finds by customer_name ilike (lines 188-189)', async () => {
    setMock(SAMPLE_ROW);
    const result = await findReservation('rest-1', { customer_name: 'Alice' });
    expect(result.success).toBe(true);
    expect(result.reservation.customer_name).toBe('Alice');
  });

  test('no identifier: queries without extra filter', async () => {
    setMock(SAMPLE_ROW);
    const result = await findReservation('rest-1', {});
    expect(result.success).toBe(true);
  });

  test('error returns failure (line 195)', async () => {
    setMock(null, { message: 'no rows' });
    const result = await findReservation('rest-1', { reservation_id: 'RES-NONE' });
    expect(result.success).toBe(false);
    expect(result.message).toBe('Reservation not found');
  });

  test('null data with no error also returns failure (line 195)', async () => {
    setMock(null, null);
    const result = await findReservation('rest-1', { reservation_id: 'RES-NONE' });
    expect(result.success).toBe(false);
    expect(result.message).toBe('Reservation not found');
  });

  test('missing customer_email defaults to empty string', async () => {
    setMock({ ...SAMPLE_ROW, customer_email: null });
    const result = await findReservation('rest-1', { reservation_id: 'RES-001' });
    expect(result.success).toBe(true);
    expect(result.reservation.customer_email).toBe('');
  });

  test('missing special_requests defaults to empty string', async () => {
    setMock({ ...SAMPLE_ROW, special_requests: null });
    const result = await findReservation('rest-1', { reservation_id: 'RES-001' });
    expect(result.success).toBe(true);
    expect(result.reservation.special_requests).toBe('');
  });
});

// ---------------------------------------------------------------------------
// cancelReservation
// ---------------------------------------------------------------------------
describe('cancelReservation', () => {
  test('success: finds and cancels reservation (lines 219-237)', async () => {
    // cancelReservation calls findReservation (→ supabase.from once)
    // then updateReservation (→ supabase.from again)
    mockFrom
      .mockImplementationOnce(() => makeChain({ data: SAMPLE_ROW, error: null }))
      .mockImplementationOnce(() => makeChain({ data: { ...SAMPLE_ROW, status: 'cancelled' }, error: null }));

    const result = await cancelReservation('rest-1', 'RES-001');
    expect(result.success).toBe(true);
    expect(result.message).toContain('RES-001');
    expect(result.reservation.reservation_id).toBe('RES-001');
  });

  test('findReservation fails → returns early (lines 221-223)', async () => {
    // null data → findReservation returns { success: false }
    mockFrom.mockImplementationOnce(() => makeChain({ data: null, error: null }));

    const result = await cancelReservation('rest-1', 'RES-NONE');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Reservation not found');
  });

  test('updateReservation fails → returns early (lines 229-231)', async () => {
    // findReservation succeeds
    mockFrom.mockImplementationOnce(() => makeChain({ data: SAMPLE_ROW, error: null }));
    // updateReservation fails
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'update failed' });
    mockFrom.mockImplementationOnce(() => makeChain({ data: null, error: { message: 'update failed' } }));

    const result = await cancelReservation('rest-1', 'RES-001');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// markReservationAsNoShow
// ---------------------------------------------------------------------------
describe('markReservationAsNoShow', () => {
  test('success: marks reservation as no-show (lines 241-254)', async () => {
    setMock({ ...SAMPLE_ROW, status: 'no-show' });
    const result = await markReservationAsNoShow('rest-1', SAMPLE_ROW.id);
    expect(result.success).toBe(true);
    expect(result.message).toBe('Reservation marked as no-show');
    expect(result.record_id).toBe(SAMPLE_ROW.id);
  });

  test('DB error propagates from updateReservation', async () => {
    setMock(null, { message: 'update failed' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'update failed' });
    const result = await markReservationAsNoShow('rest-1', 'some-id');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getUpcomingReservations
// ---------------------------------------------------------------------------
describe('getUpcomingReservations', () => {
  test('success with timezone: uses local date/time', async () => {
    setMock([SAMPLE_ROW]);
    const result = await getUpcomingReservations('rest-1', 'America/Sao_Paulo');
    expect(result.success).toBe(true);
    expect(result.reservations).toHaveLength(1);
    expect(result.reservations[0].reservation_id).toBe('RES-001');
    expect(result.reservations[0].checked_in).toBe(false);
    expect(result.reservations[0].customer_email).toBe('alice@example.com');
    // ML legacy fields present
    expect(result.reservations[0].no_show_risk_score).toBeNull();
    expect(result.reservations[0].prediction_confidence).toBeNull();
  });

  test('success without timezone: uses JS Date', async () => {
    setMock([SAMPLE_ROW]);
    const result = await getUpcomingReservations('rest-1', null);
    expect(result.success).toBe(true);
    expect(result.reservations).toHaveLength(1);
  });

  test('checked_in_at present → checked_in is true', async () => {
    setMock([{ ...SAMPLE_ROW, checked_in_at: '2026-02-21T18:55:00Z' }]);
    const result = await getUpcomingReservations('rest-1', 'UTC');
    expect(result.reservations[0].checked_in).toBe(true);
    expect(result.reservations[0].checked_in_at).toBe('2026-02-21T18:55:00Z');
  });

  test('missing special_requests defaults to empty string', async () => {
    setMock([{ ...SAMPLE_ROW, special_requests: null }]);
    const result = await getUpcomingReservations('rest-1', 'UTC');
    expect(result.reservations[0].special_requests).toBe('');
  });

  test('missing customer_email defaults to empty string', async () => {
    setMock([{ ...SAMPLE_ROW, customer_email: null }]);
    const result = await getUpcomingReservations('rest-1', 'UTC');
    expect(result.reservations[0].customer_email).toBe('');
  });

  test('DB error: delegates to handleSupabaseResponse', async () => {
    setMock(null, { message: 'query error' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'query error' });
    const result = await getUpcomingReservations('rest-1', 'UTC');
    expect(result.success).toBe(false);
    expect(handleSupabaseResponse).toHaveBeenCalledWith(
      null, { message: 'query error' }, 'GET upcoming reservations'
    );
  });
});
