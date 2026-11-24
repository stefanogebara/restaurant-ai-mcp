const mockRetrieveCustomer = jest.fn();
const mockCreatePortal = jest.fn();

jest.mock('stripe', () => jest.fn(() => ({
  customers: { retrieve: mockRetrieveCustomer },
  billingPortal: { sessions: { create: mockCreatePortal } },
})));
jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn() }));
jest.mock('../_lib/supabase', () => ({ getSubscriptions: jest.fn() }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: () => false }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), warn: jest.fn() }),
}));

const { verifyAuth } = require('../_lib/auth');
const { getSubscriptions } = require('../_lib/supabase');
const handler = require('../customer-portal');
const owner = { role: 'owner', restaurant_id: 'rest-1' };
const portalUrl = 'https://billing.stripe.com/p/session';

async function post() {
  const res = {
    statusCode: null, body: null, setHeader: jest.fn(),
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  await handler({
    method: 'POST', headers: { origin: 'https://seatable.one' }, body: { customerId: 'cus_untrusted' },
  }, res);
  return res;
}

beforeEach(() => {
  jest.resetAllMocks();
  verifyAuth.mockResolvedValue({ user: owner });
  getSubscriptions.mockResolvedValue({
    success: true,
    data: { records: [
      { fields: { 'Customer ID': 'synthetic-id', Status: 'active' } },
      { fields: { 'Customer ID': 'cus_canceled', Status: 'canceled' } },
      { fields: { 'Customer ID': 'cus_scoped', Status: 'past_due' } },
    ] },
  });
  mockRetrieveCustomer.mockResolvedValue({ id: 'cus_scoped', metadata: {} });
  mockCreatePortal.mockResolvedValue({ url: portalUrl });
});

test('opens billing for the tenant-scoped past-due legacy customer', async () => {
  const res = await post();
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ url: portalUrl });
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(getSubscriptions).toHaveBeenCalledWith('rest-1');
  expect(mockRetrieveCustomer).toHaveBeenCalledWith('cus_scoped');
  expect(mockCreatePortal).toHaveBeenCalledWith({
    customer: 'cus_scoped', return_url: 'https://seatable.one/subscription/manage',
  });
});

test('refuses non-owner team members before any billing lookup', async () => {
  verifyAuth.mockResolvedValue({ user: { ...owner, role: 'manager' } });
  expect((await post()).statusCode).toBe(403);
  expect(getSubscriptions).not.toHaveBeenCalled();
  expect(mockCreatePortal).not.toHaveBeenCalled();
});

test('refuses a Stripe customer with conflicting tenant metadata', async () => {
  mockRetrieveCustomer.mockResolvedValue({ id: 'cus_scoped', metadata: { restaurant_id: 'rest-2' } });
  expect((await post()).statusCode).toBe(403);
  expect(mockCreatePortal).not.toHaveBeenCalled();
});

test('fails closed on Stripe errors and does not expose provider details', async () => {
  mockRetrieveCustomer.mockRejectedValue(new Error('private@example.com'));
  const res = await post();
  expect(res.statusCode).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('private@example.com');
  expect(mockCreatePortal).not.toHaveBeenCalled();
});

test('does not open a billing portal for a deleted Stripe customer', async () => {
  mockRetrieveCustomer.mockResolvedValue({ id: 'cus_scoped', deleted: true });
  expect((await post()).statusCode).toBe(400);
  expect(mockCreatePortal).not.toHaveBeenCalled();
});
