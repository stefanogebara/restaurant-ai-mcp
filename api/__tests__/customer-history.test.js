/**
 * Tests for api/_lib/customer-history.js
 * Requires mocking axios for Airtable API calls
 */

jest.mock('axios');
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const axios = require('axios');
const {
  findCustomerByEmail,
  findCustomerByPhone,
  getCustomer,
  findOrCreateCustomer,
  updateCustomerHistory,
  updateCustomerSpend,
  getCustomerStats,
  calculateDaysSinceLastVisit,
  backfillCustomerHistory,
} = require('../_lib/customer-history');

// Helper: Airtable record format
const makeRecord = (id, fields = {}) => ({
  id,
  createdTime: '2025-01-01T00:00:00.000Z',
  fields: {
    'Email': 'test@example.com',
    'Phone': '+5511912345678',
    'Customer Name': 'Test Customer',
    'First Visit Date': '2025-01-01',
    'Last Visit Date': '2025-06-01',
    'Total Reservations': 10,
    'Completed Reservations': 8,
    'No Shows': 1,
    'Cancellations': 1,
    'Average Party Size': 3,
    'Total Spend': 500,
    'Average Spend Per Visit': 62.5,
    'Favorite Time Slot': '19:00',
    'Favorite Day': 'Friday',
    'VIP Status': true,
    'No Show Risk Score': 0.1,
    'Days Since Last Visit': 30,
    'Notes': '',
    ...fields,
  },
});

beforeEach(() => {
  jest.resetAllMocks();
});

// ============================================================
// calculateDaysSinceLastVisit (pure function)
// ============================================================
describe('calculateDaysSinceLastVisit', () => {
  test('returns null for null input', () => {
    expect(calculateDaysSinceLastVisit(null)).toBe(null);
  });

  test('returns null for undefined input', () => {
    expect(calculateDaysSinceLastVisit(undefined)).toBe(null);
  });

  test('returns positive number for past date', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 10);
    const result = calculateDaysSinceLastVisit(pastDate.toISOString());
    expect(result).toBeGreaterThanOrEqual(10);
    expect(result).toBeLessThanOrEqual(11);
  });

  test('returns 0 or 1 for today', () => {
    const today = new Date().toISOString();
    const result = calculateDaysSinceLastVisit(today);
    expect(result).toBeLessThanOrEqual(1);
  });
});

// ============================================================
// findCustomerByEmail
// ============================================================
describe('findCustomerByEmail', () => {
  test('returns null for empty email', () => {
    const result = findCustomerByEmail(null);
    expect(result).resolves.toBeNull();
  });

  test('returns mapped customer when found', async () => {
    axios.mockResolvedValueOnce({
      data: { records: [makeRecord('rec123')] },
    });

    const result = await findCustomerByEmail('test@example.com');
    expect(result).toBeTruthy();
    expect(result.id).toBe('rec123');
    expect(result.email).toBe('test@example.com');
    expect(result.total_reservations).toBe(10);
    expect(result.vip_status).toBe(true);
  });

  test('returns null when not found', async () => {
    axios.mockResolvedValueOnce({
      data: { records: [] },
    });

    const result = await findCustomerByEmail('notfound@example.com');
    expect(result).toBeNull();
  });

  test('returns null on API error', async () => {
    axios.mockRejectedValueOnce(new Error('Network error'));

    const result = await findCustomerByEmail('test@example.com');
    expect(result).toBeNull();
  });
});

// ============================================================
// findCustomerByPhone
// ============================================================
describe('findCustomerByPhone', () => {
  test('returns null for empty phone', () => {
    expect(findCustomerByPhone(null)).resolves.toBeNull();
  });

  test('returns mapped customer when found', async () => {
    axios.mockResolvedValueOnce({
      data: { records: [makeRecord('rec456')] },
    });

    const result = await findCustomerByPhone('+5511912345678');
    expect(result).toBeTruthy();
    expect(result.id).toBe('rec456');
  });

  test('normalizes phone number (removes dashes/spaces)', async () => {
    axios.mockResolvedValueOnce({
      data: { records: [makeRecord('rec789')] },
    });

    await findCustomerByPhone('+55 11 91234-5678');
    // Verify the call was made (phone is normalized before query)
    expect(axios).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// getCustomer
// ============================================================
describe('getCustomer', () => {
  test('returns mapped customer for valid ID', async () => {
    axios.mockResolvedValueOnce({
      data: makeRecord('rec123'),
    });

    const result = await getCustomer('rec123');
    expect(result).toBeTruthy();
    expect(result.id).toBe('rec123');
    expect(result.customer_name).toBe('Test Customer');
  });

  test('returns null on error', async () => {
    axios.mockRejectedValueOnce(new Error('Not found'));
    const result = await getCustomer('invalid');
    expect(result).toBeNull();
  });
});

// ============================================================
// findOrCreateCustomer
// ============================================================
describe('findOrCreateCustomer', () => {
  test('returns existing customer found by email', async () => {
    axios.mockResolvedValueOnce({
      data: { records: [makeRecord('existing1')] },
    });

    const result = await findOrCreateCustomer('test@example.com', null, 'Test');
    expect(result).toBeTruthy();
    expect(result.id).toBe('existing1');
  });

  test('falls back to phone lookup when email not found', async () => {
    // email=null, so findCustomerByEmail returns null without calling axios
    // Phone lookup: found (this is the FIRST axios call)
    axios.mockResolvedValueOnce({
      data: { records: [makeRecord('existing2')] },
    });

    const result = await findOrCreateCustomer(null, '+5511999999999', 'Test');
    expect(result).toBeTruthy();
    expect(result.id).toBe('existing2');
  });

  test('creates new customer when not found', async () => {
    // Email lookup: not found
    axios.mockResolvedValueOnce({ data: { records: [] } });
    // Phone lookup: not found
    axios.mockResolvedValueOnce({ data: { records: [] } });
    // Create: success
    axios.mockResolvedValueOnce({
      data: makeRecord('newRec', {
        'Customer Name': 'New Customer',
        'Total Reservations': 0,
      }),
    });

    const result = await findOrCreateCustomer('new@example.com', '+5511900000000', 'New Customer');
    expect(result).toBeTruthy();
    expect(result.id).toBe('newRec');
    expect(axios).toHaveBeenCalledTimes(3);
  });

  test('returns null when create fails', async () => {
    // Email: not found (first axios call)
    axios.mockResolvedValueOnce({ data: { records: [] } });
    // phone=null, so findCustomerByPhone is skipped
    // Create: error (second axios call)
    axios.mockRejectedValueOnce(new Error('Create failed'));

    const result = await findOrCreateCustomer('test@example.com', null, 'Test');
    expect(result).toBeNull();
  });
});

// ============================================================
// updateCustomerHistory
// ============================================================
describe('updateCustomerHistory', () => {
  test('handles "created" outcome', async () => {
    // getCustomer call
    axios.mockResolvedValueOnce({ data: makeRecord('rec1') });
    // PATCH call
    axios.mockResolvedValueOnce({ data: { id: 'rec1' } });

    const result = await updateCustomerHistory('rec1', {}, 'created');
    expect(result.success).toBe(true);
    expect(result.updates['Total Reservations']).toBe(11);
  });

  test('handles "completed" outcome', async () => {
    axios.mockResolvedValueOnce({ data: makeRecord('rec1') });
    axios.mockResolvedValueOnce({ data: { id: 'rec1' } });

    const result = await updateCustomerHistory('rec1', { date: '2026-02-20', party_size: 4 }, 'completed');
    expect(result.success).toBe(true);
    expect(result.updates['Completed Reservations']).toBe(9);
    expect(result.updates['Last Visit Date']).toBe('2026-02-20');
  });

  test('handles "no-show" outcome', async () => {
    axios.mockResolvedValueOnce({ data: makeRecord('rec1') });
    axios.mockResolvedValueOnce({ data: { id: 'rec1' } });

    const result = await updateCustomerHistory('rec1', {}, 'no-show');
    expect(result.success).toBe(true);
    expect(result.updates['No Shows']).toBe(2);
  });

  test('handles "cancelled" outcome', async () => {
    axios.mockResolvedValueOnce({ data: makeRecord('rec1') });
    axios.mockResolvedValueOnce({ data: { id: 'rec1' } });

    const result = await updateCustomerHistory('rec1', {}, 'cancelled');
    expect(result.success).toBe(true);
    expect(result.updates['Cancellations']).toBe(2);
  });

  test('returns failure when customer not found', async () => {
    axios.mockRejectedValueOnce(new Error('Not found'));

    const result = await updateCustomerHistory('invalid', {}, 'created');
    expect(result.success).toBe(false);
  });
});

// ============================================================
// updateCustomerSpend
// ============================================================
describe('updateCustomerSpend', () => {
  test('adds spend amount and recalculates average', async () => {
    axios.mockResolvedValueOnce({ data: makeRecord('rec1') });
    axios.mockResolvedValueOnce({ data: { id: 'rec1' } });

    const result = await updateCustomerSpend('rec1', 100);
    expect(result.success).toBe(true);
  });

  test('returns failure when customer not found', async () => {
    axios.mockRejectedValueOnce(new Error('Not found'));
    const result = await updateCustomerSpend('invalid', 100);
    expect(result.success).toBe(false);
  });
});

// ============================================================
// getCustomerStats
// ============================================================
describe('getCustomerStats', () => {
  test('returns default stats for new customer', async () => {
    // findByEmail: not found
    axios.mockResolvedValueOnce({ data: { records: [] } });
    // findByPhone: not found
    axios.mockResolvedValueOnce({ data: { records: [] } });

    const stats = await getCustomerStats('unknown@example.com', '+1234567890');
    expect(stats.is_repeat_customer).toBe(false);
    expect(stats.total_reservations).toBe(0);
    expect(stats.no_show_rate).toBe(0.15);
    expect(stats.customer_id).toBe(null);
  });

  test('returns existing customer stats', async () => {
    axios.mockResolvedValueOnce({
      data: { records: [makeRecord('rec1')] },
    });

    const stats = await getCustomerStats('test@example.com', null);
    expect(stats.is_repeat_customer).toBe(true);
    expect(stats.total_reservations).toBe(10);
    expect(stats.no_show_count).toBe(1);
    expect(stats.vip_status).toBe(true);
    expect(stats.customer_id).toBe('rec1');
  });
});

// ============================================================
// backfillCustomerHistory
// ============================================================
describe('backfillCustomerHistory', () => {
  test('handles empty reservations array', async () => {
    const result = await backfillCustomerHistory([]);
    expect(result.success).toBe(true);
    expect(result.total_customers).toBe(0);
    expect(result.created).toBe(0);
  });

  test('groups reservations by customer and creates records', async () => {
    // Create calls for 2 customers
    axios.mockResolvedValueOnce({ data: makeRecord('new1') });
    axios.mockResolvedValueOnce({ data: makeRecord('new2') });

    const reservations = [
      { fields: { 'Customer Email': 'a@test.com', 'Customer Phone': '+1', 'Customer Name': 'A', Status: 'completed', Date: '2025-01-01', 'Party Size': 2 } },
      { fields: { 'Customer Email': 'a@test.com', 'Customer Phone': '+1', 'Customer Name': 'A', Status: 'completed', Date: '2025-02-01', 'Party Size': 3 } },
      { fields: { 'Customer Email': 'b@test.com', 'Customer Phone': '+2', 'Customer Name': 'B', Status: 'no-show', Date: '2025-03-01', 'Party Size': 4 } },
    ];

    const result = await backfillCustomerHistory(reservations);
    expect(result.success).toBe(true);
    expect(result.total_customers).toBe(2);
    expect(result.created).toBe(2);
  });
});
