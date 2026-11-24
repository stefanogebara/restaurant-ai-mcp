'use strict';

// The prospecting preview created its restaurant without a timezone, so the
// row took the column default 'UTC' and every booking rule on the preview ran
// 3 hours off for a São Paulo restaurant. Since 2026-11-12 the column has no
// default: every creation path must send the zone explicitly.

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
}));

let mockLead;
const mockInsert = jest.fn(async () => ({ error: null }));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: mockLead, error: null }) };
      return chain;
    }),
    schema: jest.fn(() => ({ from: () => ({ insert: (...a) => mockInsert(...a) }) })),
  },
}));

const originalProduct = process.env.PROSPECTING_PRODUCT;
beforeAll(() => { process.env.PROSPECTING_PRODUCT = 'seatable'; });
afterAll(() => {
  if (originalProduct === undefined) delete process.env.PROSPECTING_PRODUCT; else process.env.PROSPECTING_PRODUCT = originalProduct;
});
beforeEach(() => {
  mockInsert.mockClear();
  global.fetch = jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
});
afterEach(() => { delete global.fetch; });

const { criarPreviaDemo } = require('../_lib/prospecting/prospect-demo');

test.each([
  ['São Paulo', 'America/Sao_Paulo'],
  ['', 'America/Sao_Paulo'],
  ['Manaus', 'America/Manaus'],
])('a preview for a restaurant in "%s" is created in %s, never UTC', async (city, zone) => {
  mockLead = { id: 'lead-1', name: 'Bar do Teste', city, sector: 'bar', phone: '+5511900000000' };
  const result = await criarPreviaDemo('lead-1');
  expect(result.ok).toBe(true);
  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect(mockInsert.mock.calls[0][0].timezone).toBe(zone);
  expect(mockInsert.mock.calls[0][0].agent_language).toBe('pt');
});
