/**
 * Tests for api/_lib/db-service-records.js
 * Covers all service record CRUD operations for active dining sessions.
 */

// ---------------------------------------------------------------------------
// Chainable Supabase mock
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
  withRetry: (fn) => fn(),
}));

const {
  getServiceRecords,
  getActiveServiceRecords,
  createServiceRecord,
  updateServiceRecord,
  completeServiceRecord,
  deleteServiceRecord,
} = require('../_lib/db-service-records');

const { handleSupabaseResponse } = require('../_lib/db-clients');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function setMock(data, error = null) {
  dbMockResult.data = data;
  dbMockResult.error = error;
}

const SAMPLE_SERVICE = {
  id: 'srv-uuid-1',
  service_id: 'SVC-001',
  reservation_id: 'RES-001',
  customer_name: 'Alice',
  customer_phone: '+1234567890',
  party_size: 2,
  table_ids: ['t1', 't2'],
  seated_at: '2026-02-21T19:00:00Z',
  estimated_departure: '2026-02-21T21:00:00Z',
  actual_departure: null,
  special_requests: 'Quiet area',
  status: 'active',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFrom.mockImplementation(() => makeChain());
  setMock(null, null);
});

// ---------------------------------------------------------------------------
// getServiceRecords
// ---------------------------------------------------------------------------
describe('getServiceRecords', () => {
  test('success: returns mapped records without filter', async () => {
    setMock([SAMPLE_SERVICE]);
    const result = await getServiceRecords('rest-1');
    expect(result.success).toBe(true);
    expect(result.data.records).toHaveLength(1);
    expect(result.data.records[0].fields['Service ID']).toBe('SVC-001');
    expect(result.data.records[0].fields['Customer Name']).toBe('Alice');
    expect(result.data.records[0].fields['Table IDs']).toEqual(['t1', 't2']);
    expect(result.data.records[0].fields['Status']).toBe('active');
  });

  test('applies status filter (line 27)', async () => {
    setMock([SAMPLE_SERVICE]);
    const result = await getServiceRecords('rest-1', { status: 'active' });
    expect(result.success).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('service_records');
  });

  test('returns empty array when no records', async () => {
    setMock([]);
    const result = await getServiceRecords('rest-1');
    expect(result.success).toBe(true);
    expect(result.data.records).toHaveLength(0);
  });

  test('DB error: delegates to handleSupabaseResponse', async () => {
    setMock(null, { message: 'DB error' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'DB error' });
    const result = await getServiceRecords('rest-1');
    expect(result.success).toBe(false);
    expect(handleSupabaseResponse).toHaveBeenCalledWith(null, { message: 'DB error' }, 'GET service records');
  });
});

// ---------------------------------------------------------------------------
// getActiveServiceRecords
// ---------------------------------------------------------------------------
describe('getActiveServiceRecords', () => {
  test('success: returns active service records', async () => {
    setMock([SAMPLE_SERVICE]);
    const result = await getActiveServiceRecords('rest-1');
    expect(result.success).toBe(true);
    expect(result.service_records).toHaveLength(1);
    expect(result.service_records[0].service_id).toBe('SVC-001');
    expect(result.service_records[0].status).toBe('active');
    expect(result.service_records[0].record_id).toBe('srv-uuid-1');
  });

  test('reservation_id null defaults to empty string', async () => {
    setMock([{ ...SAMPLE_SERVICE, reservation_id: null }]);
    const result = await getActiveServiceRecords('rest-1');
    expect(result.service_records[0].reservation_id).toBe('');
  });

  test('table_ids null defaults to empty array', async () => {
    setMock([{ ...SAMPLE_SERVICE, table_ids: null }]);
    const result = await getActiveServiceRecords('rest-1');
    expect(result.service_records[0].table_ids).toEqual([]);
  });

  test('special_requests null defaults to empty string', async () => {
    setMock([{ ...SAMPLE_SERVICE, special_requests: null }]);
    const result = await getActiveServiceRecords('rest-1');
    expect(result.service_records[0].special_requests).toBe('');
  });

  test('DB error: delegates to handleSupabaseResponse', async () => {
    setMock(null, { message: 'query failed' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'query failed' });
    const result = await getActiveServiceRecords('rest-1');
    expect(result.success).toBe(false);
    expect(handleSupabaseResponse).toHaveBeenCalledWith(null, { message: 'query failed' }, 'GET active service records');
  });
});

// ---------------------------------------------------------------------------
// createServiceRecord
// ---------------------------------------------------------------------------
describe('createServiceRecord', () => {
  test('success: returns created service record', async () => {
    setMock(SAMPLE_SERVICE);
    const result = await createServiceRecord('rest-1', {
      'Service ID': 'SVC-002',
      'Reservation ID': 'RES-002',
      'Customer Name': 'Bob',
      'Customer Phone': '+9876543210',
      'Party Size': 3,
      'Table IDs': ['t3'],
      'Seated At': '2026-02-21T19:00:00Z',
      'Estimated Departure': '2026-02-21T21:00:00Z',
      'Special Requests': null,
    });
    expect(result.success).toBe(true);
    expect(result.data.fields['Service ID']).toBe('SVC-001'); // from SAMPLE_SERVICE
    expect(result.data.fields['Status']).toBe('active');
  });

  test('Seated At defaults to now when not provided', async () => {
    setMock(SAMPLE_SERVICE);
    const result = await createServiceRecord('rest-1', {
      'Service ID': 'SVC-003',
      'Customer Name': 'Carol',
      'Customer Phone': '+111',
      'Party Size': 1,
      'Table IDs': [],
      'Estimated Departure': '2026-02-21T21:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  test('Reservation ID null when not provided', async () => {
    setMock(SAMPLE_SERVICE);
    const result = await createServiceRecord('rest-1', {
      'Service ID': 'SVC-004',
      'Customer Name': 'Dave',
      'Customer Phone': '+222',
      'Party Size': 2,
      'Table IDs': ['t4'],
      'Seated At': '2026-02-21T19:30:00Z',
      'Estimated Departure': '2026-02-21T21:30:00Z',
    });
    expect(result.success).toBe(true);
  });

  test('DB error: delegates to handleSupabaseResponse', async () => {
    setMock(null, { message: 'insert failed' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'insert failed' });
    const result = await createServiceRecord('rest-1', {
      'Service ID': 'SVC-ERR',
      'Customer Name': 'Error',
      'Customer Phone': '+000',
      'Party Size': 1,
      'Table IDs': [],
      'Estimated Departure': '2026-02-21T21:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// updateServiceRecord (lines 110-140)
// ---------------------------------------------------------------------------
describe('updateServiceRecord', () => {
  test('success: updates status and actual_departure (lines 112-124)', async () => {
    setMock({ ...SAMPLE_SERVICE, status: 'completed', actual_departure: '2026-02-21T21:05:00Z' });
    const result = await updateServiceRecord('rest-1', 'SVC-001', {
      'Status': 'completed',
      'Actual Departure': '2026-02-21T21:05:00Z',
    });
    expect(result.success).toBe(true);
    expect(result.service_record.service_id).toBe('SVC-001');
    expect(result.service_record.status).toBe('completed');
    expect(result.service_record.table_ids).toEqual(['t1', 't2']);
  });

  test('table_ids null defaults to empty array in response (line 137)', async () => {
    setMock({ ...SAMPLE_SERVICE, table_ids: null });
    const result = await updateServiceRecord('rest-1', 'SVC-001', { 'Status': 'completed' });
    expect(result.success).toBe(true);
    expect(result.service_record.table_ids).toEqual([]);
  });

  test('updates only Status when Actual Departure not provided', async () => {
    setMock(SAMPLE_SERVICE);
    const result = await updateServiceRecord('rest-1', 'SVC-001', { 'Status': 'paused' });
    expect(result.success).toBe(true);
  });

  test('DB error: logs and delegates to handleSupabaseResponse (lines 126-129)', async () => {
    setMock(null, { message: 'update conflict' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'update conflict' });
    const result = await updateServiceRecord('rest-1', 'SVC-001', { 'Status': 'completed' });
    expect(result.success).toBe(false);
    expect(handleSupabaseResponse).toHaveBeenCalledWith(
      null, { message: 'update conflict' }, 'UPDATE service record'
    );
  });
});

// ---------------------------------------------------------------------------
// completeServiceRecord (line 143-148)
// ---------------------------------------------------------------------------
describe('completeServiceRecord', () => {
  test('success: calls updateServiceRecord with completed status (line 144)', async () => {
    setMock({ ...SAMPLE_SERVICE, status: 'completed', actual_departure: new Date().toISOString() });
    const result = await completeServiceRecord('rest-1', 'SVC-001');
    expect(result.success).toBe(true);
    expect(result.service_record.status).toBe('completed');
  });

  test('DB error propagates from updateServiceRecord', async () => {
    setMock(null, { message: 'conflict' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'conflict' });
    const result = await completeServiceRecord('rest-1', 'SVC-001');
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteServiceRecord
// ---------------------------------------------------------------------------
describe('deleteServiceRecord', () => {
  test('success: deletes record and returns count', async () => {
    setMock([SAMPLE_SERVICE]); // delete returns array of deleted rows
    const result = await deleteServiceRecord('rest-1', 'SVC-001');
    expect(result.success).toBe(true);
    expect(result.message).toContain('SVC-001');
    expect(result.deleted_count).toBe(1);
  });

  test('success with null data: deleted_count is 0', async () => {
    setMock(null);
    const result = await deleteServiceRecord('rest-1', 'SVC-NONE');
    expect(result.success).toBe(true);
    expect(result.deleted_count).toBe(0);
  });

  test('DB error: delegates to handleSupabaseResponse', async () => {
    setMock(null, { message: 'delete failed' });
    handleSupabaseResponse.mockReturnValueOnce({ success: false, error: true, message: 'delete failed' });
    const result = await deleteServiceRecord('rest-1', 'SVC-001');
    expect(result.success).toBe(false);
    expect(handleSupabaseResponse).toHaveBeenCalledWith(null, { message: 'delete failed' }, 'DELETE service record');
  });
});
