const mockCreateCheckout = jest.fn();
const mockListCheckout = jest.fn();
const mockListSubscriptions = jest.fn();
const mockRetrievePrice = jest.fn();
const mockRetrieveCustomer = jest.fn();
const mockSearchCustomers = jest.fn();
const mockCreateCustomer = jest.fn();

jest.mock('stripe', () => jest.fn(() => ({
  checkout: { sessions: { create: mockCreateCheckout, list: mockListCheckout } },
  subscriptions: { list: mockListSubscriptions },
  prices: { retrieve: mockRetrievePrice },
  customers: {
    retrieve: mockRetrieveCustomer,
    search: mockSearchCustomers,
    create: mockCreateCustomer,
  },
})));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: () => false }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));
jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn() }));
jest.mock('../_lib/stripe-usage-reporter', () => ({ getMeteredPriceMap: () => ({}) }));
jest.mock('../_lib/supabase', () => ({
  getSubscriptions: jest.fn(),
  supabaseAdmin: {
    from: () => ({
      select() { return this; },
      eq() { return this; },
      limit() { return this; },
      single: async () => ({ data: null, error: null }),
    }),
  },
}));

const { verifyAuth } = require('../_lib/auth');
const { getSubscriptions } = require('../_lib/supabase');
const handler = require('../create-checkout-session');
const owner = { restaurant_id: 'rest-1', sub: 'user-1', role: 'owner' };
const checkout = { id: 'cs_test_a', url: 'https://checkout.stripe.com/c/cs_test_a' };

function setRecords(...fields) {
  getSubscriptions.mockResolvedValue({ success: true, data: { records: fields.map(row => ({ fields: row })) } });
}

async function post(body) {
  const res = {
    statusCode: null,
    body: null,
    setHeader: jest.fn(),
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  await handler({
    method: 'POST', headers: { authorization: 'Bearer mocked', origin: 'https://seatable.one' }, body,
  }, res);
  return res;
}

const originalEnv = process.env;
beforeEach(() => {
  jest.resetAllMocks();
  process.env = {
    ...originalEnv,
    STRIPE_STARTER_PRICE_ID: 'price_starter',
    STRIPE_GROWTH_PRICE_ID: 'price_growth',
    STRIPE_SCALE_PRICE_ID: 'price_scale',
    BETA_CODE: 'test-beta',
  };
  verifyAuth.mockResolvedValue({ user: owner });
  setRecords();
  mockRetrievePrice.mockResolvedValue({ currency: 'brl' });
  mockListCheckout.mockReturnValue([]);
  mockListSubscriptions.mockReturnValue([]);
  mockSearchCustomers.mockReturnValue([]);
  mockCreateCustomer.mockResolvedValue({ id: 'cus_new', metadata: { restaurant_id: 'rest-1' } });
  mockRetrieveCustomer.mockImplementation(async id => ({ id, metadata: {} }));
  mockCreateCheckout.mockResolvedValue(checkout);
});
afterEach(() => { process.env = originalEnv; });

test.each([
  [{ priceId: 'price_unlisted' }],
  [{ priceId: '' }],
  [{ planName: 'ScalePlus' }],
  [{ planName: 'Growth', priceId: 'price_starter' }],
  [{ planName: 'constructor' }],
])('rejects an invalid or inconsistent plan %j before accessing billing data', async body => {
  expect((await post(body)).statusCode).toBe(400);
  expect(getSubscriptions).not.toHaveBeenCalled();
  expect(mockCreateCheckout).not.toHaveBeenCalled();
});

test.each([
  [{ planName: 'Growth', priceId: '' }, 'Growth', 'price_growth', 14],
  [{ priceId: 'price_growth' }, 'Growth', 'price_growth', 14],
  [{ priceId: 'price_growth', planName: '' }, 'Growth', 'price_growth', 14],
  [{ planName: 'Starter' }, 'Starter', 'price_starter', undefined],
  [{ priceId: 'price_scale', betaCode: 'test-beta' }, 'Scale', 'price_scale', 30],
])('derives the plan and trial from the price for %j', async (body, plan, price, trialDays) => {
  const res = await post(body);
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ sessionId: checkout.id, url: checkout.url });
  const [params, options] = mockCreateCheckout.mock.calls[0];
  expect(params.customer).toBe('cus_new');
  expect(params.cancel_url).toBe(`https://seatable.one/subscription/manage?plan=${plan.toLowerCase()}`);
  expect(params.line_items).toEqual([{ price, quantity: 1 }]);
  expect(params.metadata).toMatchObject({ restaurant_id: 'rest-1', plan_name: plan, plan_price_id: price });
  expect(params.subscription_data.metadata).toMatchObject({ restaurant_id: 'rest-1', plan_name: plan });
  expect(params.subscription_data.trial_period_days).toBe(trialDays);
  expect(options.idempotencyKey).toEqual(expect.any(String));
});

test('checks authenticated owner access before reading or writing Stripe data', async () => {
  verifyAuth.mockResolvedValue({ user: { ...owner, role: 'manager' } });
  expect((await post({ planName: 'Starter' })).statusCode).toBe(403);
  expect(getSubscriptions).not.toHaveBeenCalled();
  expect(mockSearchCustomers).not.toHaveBeenCalled();
  expect(mockCreateCheckout).not.toHaveBeenCalled();
});

test('keeps the onboarding response for an authenticated user without a restaurant', async () => {
  verifyAuth.mockResolvedValue({ user: { sub: owner.sub, role: 'authenticated' } });
  const res = await post({ planName: 'Starter' });
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/Restaurant setup required/);
});

test.each(['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete'])(
  'blocks Checkout for a Stripe subscription with status %s',
  async status => {
    setRecords(
      { 'Subscription ID': 'free_rest-1', 'Customer ID': 'synthetic' },
      { 'Subscription ID': 'sub_existing', 'Customer ID': 'cus_existing' },
    );
    mockListSubscriptions.mockReturnValue([{ id: 'sub_existing', status }]);
    const res = await post({ planName: 'Growth' });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SUBSCRIPTION_EXISTS');
    expect(mockListSubscriptions).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_existing' }));
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  },
);

test('reuses a verified legacy customer after the previous subscription has ended', async () => {
  setRecords({ 'Subscription ID': 'sub_old', 'Customer ID': 'cus_legacy', Status: 'active' });
  mockListSubscriptions.mockReturnValue([{ id: 'sub_old', status: 'canceled' }]);
  const res = await post({ planName: 'Starter', email: 'request@example.com' });
  expect(res.statusCode).toBe(200);
  expect(mockCreateCustomer).not.toHaveBeenCalled();
  const [params] = mockCreateCheckout.mock.calls[0];
  expect(params.customer).toBe('cus_legacy');
  expect(params).not.toHaveProperty('customer_email');
});

test('refuses a mapped customer when its Stripe metadata belongs to another tenant', async () => {
  setRecords({ 'Customer ID': 'cus_foreign' });
  mockRetrieveCustomer.mockResolvedValue({ id: 'cus_foreign', metadata: { restaurant_id: 'rest-2' } });
  expect((await post({ planName: 'Starter' })).statusCode).toBe(403);
  expect(mockCreateCustomer).not.toHaveBeenCalled();
  expect(mockCreateCheckout).not.toHaveBeenCalled();
});

test('uses stable tenant-scoped keys for concurrent attempts, including different plans', async () => {
  await Promise.all([post({ planName: 'Starter' }), post({ planName: 'Scale' })]);
  const [firstCustomer, secondCustomer] = mockCreateCustomer.mock.calls;
  const [firstCheckout, secondCheckout] = mockCreateCheckout.mock.calls;
  expect(firstCustomer[1].idempotencyKey).toBe(secondCustomer[1].idempotencyKey);
  expect(firstCheckout[1].idempotencyKey).toBe(secondCheckout[1].idempotencyKey);
});

test('recovers a pending Stripe customer and resumes the existing matching checkout', async () => {
  mockSearchCustomers.mockReturnValue([{ id: 'cus_pending', metadata: { restaurant_id: 'rest-1' } }]);
  mockListCheckout.mockReturnValue([{
    ...checkout, mode: 'subscription', status: 'open',
    metadata: { restaurant_id: 'rest-1', plan_price_id: 'price_growth', trial_days: '14' },
  }]);
  expect((await post({ planName: 'Growth' })).body).toEqual({ sessionId: checkout.id, url: checkout.url });
  expect(mockCreateCustomer).not.toHaveBeenCalled();
  expect(mockCreateCheckout).not.toHaveBeenCalled();
});

test('does not start a different plan while a same-tenant checkout is open', async () => {
  mockListCheckout.mockReturnValue([{
    ...checkout, mode: 'subscription', status: 'open',
    metadata: { restaurant_id: 'rest-1', plan_price_id: 'price_starter', trial_days: '0' },
  }]);
  const res = await post({ planName: 'Scale' });
  expect(res.statusCode).toBe(409);
  expect(res.body.code).toBe('CHECKOUT_IN_PROGRESS');
  expect(mockCreateCheckout).not.toHaveBeenCalled();
});

test('uses a new idempotency key after Checkout expires', async () => {
  await post({ planName: 'Starter' });
  mockListCheckout.mockReturnValue([{
    ...checkout, mode: 'subscription', status: 'expired', metadata: { restaurant_id: 'rest-1' },
  }]);
  expect((await post({ planName: 'Starter' })).statusCode).toBe(200);
  expect(mockCreateCheckout.mock.calls[0][1].idempotencyKey)
    .not.toBe(mockCreateCheckout.mock.calls[1][1].idempotencyKey);
});

test('fails closed on billing lookup errors and hides provider details', async () => {
  setRecords({ 'Customer ID': 'cus_legacy' });
  mockRetrieveCustomer.mockRejectedValue(new Error('private@example.com'));
  const res = await post({ planName: 'Starter' });
  expect(res.statusCode).toBe(503);
  expect(JSON.stringify(res.body)).not.toContain('private@example.com');
  expect(mockCreateCheckout).not.toHaveBeenCalled();
});
