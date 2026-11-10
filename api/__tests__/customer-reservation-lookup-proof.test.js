'use strict';

const CODE = 'RES-20261110-aB_cD-eF12_X';
const PHONE = '+15550001234';
let mockReads;
let mockReadError;
let mockBrandReads;
const mockRows = [
  { reservation_id: CODE, customer_phone: PHONE, customer_name: 'Private Guest',
    customer_email: 'private@example.test', restaurant_id: 'rest-a', status: 'confirmed' },
  { reservation_id: 'RES-20261110-OtherGuest12', customer_phone: '+15559999999',
    customer_name: 'Other Guest', restaurant_id: 'rest-b' },
];

jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ info() {}, warn() {}, error() {} }) }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: jest.fn(async () => false) }));
jest.mock('../_lib/cors', () => ({ setWebhookCors() {}, handlePreflight: () => false }));
jest.mock('../_lib/supabase', () => ({ supabaseAdmin: {
  from: table => {
    if (table !== 'reservations') throw Error('Unexpected table');
    const filters = [];
    mockReads.push(filters);
    const query = {
      select: () => query,
      eq: (field, value) => { filters.push([field, value]); return query; },
      order: () => query, limit: () => query,
      single: async () => ({ data: mockRows.find(row => filters.every(([key, value]) => row[key] === value)) || null, error: mockReadError }),
      update: () => { throw Error('Lookup must never write'); },
    };
    return query;
  },
  schema: () => ({ from: () => {
    mockBrandReads++;
    const query = { select: () => query, eq: () => query,
      single: async () => ({ data: { restaurant_name: 'Verified Restaurant' }, error: null }) };
    return query;
  } }),
} }));
const handler = require('../customer-reservation');
async function lookup(query = {}, method = 'GET') {
  const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  await handler({ method, query: { action: 'lookup', ...query }, headers: {} }, res);
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0], res };
}
beforeEach(() => { mockReads = []; mockReadError = null; mockBrandReads = 0; });

test.each([
  {}, { customer_phone: PHONE }, { customer_phone: PHONE, restaurant_id: 'rest-a' },
  { reservation_id: CODE }, { customer_name: 'Private Guest', customer_phone: PHONE },
  { reservation_id: [CODE], customer_phone: PHONE }, { reservation_id: CODE, customer_phone: [PHONE] },
  { reservation_id: '   ', customer_phone: PHONE },
])('incomplete or non-scalar proof never queries or reveals a booking: %j', async query => {
  const result = await lookup(query);
  expect(result.status).toBe(400);
  expect(result.body).not.toHaveProperty('reservation');
  expect(mockReads).toHaveLength(0);
  expect(mockBrandReads).toBe(0);
});

test('the complete pair matches both exact columns before returning details', async () => {
  const { status, body, res } = await lookup({ reservation_id: CODE, customer_phone: PHONE });
  expect(status).toBe(200);
  expect(mockReads).toEqual([[['reservation_id', CODE], ['customer_phone', PHONE]]]);
  expect(body.reservation).toMatchObject({ reservation_id: CODE, customer_name: 'Private Guest', restaurant_name: 'Verified Restaurant' });
  expect(body.reservation).not.toHaveProperty('restaurant_id');
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
});

test.each([
  { reservation_id: CODE, customer_phone: '+15559999999' },
  { reservation_id: CODE.toUpperCase(), customer_phone: PHONE },
  { reservation_id: CODE.replace('_', '-'), customer_phone: PHONE },
  { reservation_id: CODE.slice(0, -1), customer_phone: PHONE },
  { reservation_id: 'RES-NOT-FOUND', customer_phone: PHONE },
  { reservation_id: CODE, customer_phone: PHONE, restaurant_id: 'rest-b' },
])('wrong proof produces the same generic denial without details: %j', async query => {
  const { status, body } = await lookup(query);
  expect(status).toBe(404);
  expect(body).toEqual({ success: false, error: 'Reservation not found' });
  expect(mockBrandReads).toBe(0);
});

test('surrounding paste whitespace is removed without changing the opaque suffix', async () => {
  expect(await lookup({ reservation_id: ` ${CODE} `, customer_phone: ` ${PHONE} ` })).toMatchObject({ status: 200 });
  expect(mockReads[0]).toContainEqual(['reservation_id', CODE]);
});

test('a database read failure does not disclose whether the code exists', async () => {
  mockReadError = { message: 'private database detail' };
  expect(await lookup({ reservation_id: CODE, customer_phone: PHONE })).toMatchObject({
    status: 404, body: { success: false, error: 'Reservation not found' },
  });
});
