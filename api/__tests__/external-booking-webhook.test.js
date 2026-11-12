'use strict';

// Partner booking webhook (OpenTable, Resy, ...): key check and import.
// Live behaviour against Postgres: scripts/auditoria-reservas/r5-google-parceiros.cjs.
const RESTAURANT = '0761e937-6eec-44be-b1d7-34b4209c7f30';
const mockVerify = jest.fn();
const mockInsert = jest.fn();

jest.mock('../_lib/api-key-auth', () => ({
  verifyApiKey: (...args) => mockVerify(...args),
  hasPermission: jest.requireActual('../_lib/api-key-auth').hasPermission,
}));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: () => {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        insert: (row) => { mockInsert(row); return chain; },
        single: () => Promise.resolve({ data: { id: 'row-1' }, error: null }),
      };
      return chain;
    },
  },
}));

const handler = require('../external-booking-webhook');
const body = { source: 'opentable', external_id: 'OT-1', guest_name: 'Olga Table', guest_phone: '+5511980000001',
  party_size: 4, reservation_date: '2026-11-19', reservation_time: '19:00' };

function call(headers = { 'x-api-key': 'sk_test' }) {
  return new Promise(resolve => {
    const res = {
      statusCode: 200, body: undefined, setHeader() {}, getHeader() {}, end() { resolve(this); },
      status(code) { this.statusCode = code; return this; },
      json(obj) { this.body = obj; resolve(this); return this; },
    };
    handler({ method: 'POST', headers, body }, res);
  });
}

beforeEach(() => { mockVerify.mockReset(); mockInsert.mockReset(); });

test('a key the hashed lookup rejects is refused with its status', async () => {
  mockVerify.mockRejectedValue(Object.assign(new Error('Invalid API key'), { status: 401 }));
  const res = await call();
  expect(res.statusCode).toBe(401);
  expect(mockInsert).not.toHaveBeenCalled();
});

test('a key without the import permission is refused', async () => {
  mockVerify.mockResolvedValue({ restaurant_id: RESTAURANT, permissions: ['pos:table_status'] });
  const res = await call();
  expect(res.statusCode).toBe(403);
  expect(mockInsert).not.toHaveBeenCalled();
});

test.each([[['reservations:import']], [['*']]])('a key with %p imports into its own restaurant, with a reservation code', async permissions => {
  mockVerify.mockResolvedValue({ restaurant_id: RESTAURANT, permissions });
  const res = await call();
  expect(res.statusCode).toBe(201);
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
    restaurant_id: RESTAURANT, source: 'opentable', external_id: 'OT-1', party_size: 4, date: '2026-11-19', time: '19:00',
    reservation_id: expect.stringMatching(/^RES-\d{8}-/),
  }));
});
