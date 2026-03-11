'use strict';

// All mocks must use factory functions so supabaseAdmin is defined correctly
jest.mock('busboy');
jest.mock('../_lib/auth', () => ({ verifyJWT: jest.fn() }));
jest.mock('../services/managerMemory', () => ({ writeMemory: jest.fn() }));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    schema: jest.fn(),
    from: jest.fn(),
  },
}));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const { EventEmitter } = require('events');
const Busboy = require('busboy');
const { verifyJWT } = require('../_lib/auth');
const { supabaseAdmin } = require('../_lib/supabase');
const { writeMemory } = require('../services/managerMemory');
const handler = require('../import-history');

/**
 * Mock busboy to emit a CSV file on next tick.
 */
function mockBusboyWithCSV(csvContent) {
  const busboyInstance = new EventEmitter();
  busboyInstance.pipe = jest.fn();
  Busboy.mockImplementation(() => busboyInstance);

  process.nextTick(() => {
    const fileStream = new EventEmitter();
    busboyInstance.emit('file', 'file', fileStream, { filename: 'test.csv', mimeType: 'text/csv' });
    fileStream.emit('data', Buffer.from(csvContent));
    fileStream.emit('end');
    busboyInstance.emit('finish');
  });
}

describe('POST /api/import-history', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data', authorization: 'Bearer token' },
      pipe: jest.fn(),
    };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    verifyJWT.mockReturnValue({ restaurant_id: 'rest-123' });
    writeMemory.mockResolvedValue(undefined);

    // Default LTV mock (schema chain)
    const upsertChain = { upsert: jest.fn().mockResolvedValue({ data: [], error: null }) };
    supabaseAdmin.schema.mockReturnValue({ from: jest.fn().mockReturnValue(upsertChain) });
    // Default service_records mock
    supabaseAdmin.from.mockReturnValue({ insert: jest.fn().mockResolvedValue({ error: null }) });
  });

  test('returns 405 for non-POST', async () => {
    req.method = 'GET';
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ error: 'Method not allowed' });
  });

  test('returns 401 if JWT invalid', async () => {
    verifyJWT.mockImplementation(() => { throw new Error('UNAUTHORIZED'); });
    mockBusboyWithCSV('name,phone\nJohn,+1\n');
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 400 for CSV with no valid rows (all missing phone)', async () => {
    mockBusboyWithCSV('name,email\nJohn,j@test.com\nMaria,m@test.com\n');
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('upserts LTV records and returns summary', async () => {
    const csv = 'name,phone,visits,last_visit,avg_spend\nJohn,+353861234567,5,2025-12-01,45\nMaria,+353861111111,3,2025-10-01,35\n';
    mockBusboyWithCSV(csv);
    await handler(req, res);

    expect(supabaseAdmin.schema).toHaveBeenCalledWith('restaurant');
    expect(writeMemory).toHaveBeenCalledWith(
      'rest-123',
      'fact',
      'customer_intelligence',
      expect.stringContaining('2'),
      'csv_import',
      7
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ imported: 2, skipped: 0 }));
  });

  test('counts skipped rows (missing phone)', async () => {
    const csv = 'name,phone\nJohn,+1\n,\nNoPhone,\n';
    mockBusboyWithCSV(csv);
    await handler(req, res);

    const result = res.json.mock.calls[0][0];
    expect(result.imported).toBe(1);
    expect(result.skipped).toBeGreaterThanOrEqual(1); // empty rows filtered by parseCSVBuffer; NoPhone row counted as skipped
  });

  test('seeds service_records when avg_spend is present', async () => {
    const csv = 'name,phone,avg_spend\nJohn,+1,50\n';
    mockBusboyWithCSV(csv);
    await handler(req, res);

    expect(supabaseAdmin.from).toHaveBeenCalledWith('service_records');
  });

  test('skips service_records insert when no avg_spend', async () => {
    const csv = 'name,phone\nJohn,+1\n';
    mockBusboyWithCSV(csv);
    await handler(req, res);

    expect(supabaseAdmin.from).not.toHaveBeenCalledWith('service_records');
  });
});
