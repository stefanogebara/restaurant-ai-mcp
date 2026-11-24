const mockRetrieve = jest.fn();
jest.mock('stripe', () => jest.fn(() => ({ checkout: { sessions: { retrieve: mockRetrieve } } })));
jest.mock('../_lib/auth', () => ({ verifyAuth: jest.fn() }));
jest.mock('../_lib/supabase', () => ({ getSubscriptions: jest.fn() }));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));
jest.mock('../_lib/cors', () => ({ setInternalCors: jest.fn(), handlePreflight: () => false }));
jest.mock('../_lib/secure-logger', () => ({ createSecureLogger: () => ({ error: jest.fn(), warn: jest.fn() }) }));

const { verifyAuth } = require('../_lib/auth');
const { getSubscriptions } = require('../_lib/supabase');
const handler = require('../verify-session');
const owner = { sub: 'user-1', role: 'owner', restaurant_id: 'rest-1', email: 'owner@example.com' };
const session = {
  mode: 'subscription',
  status: 'complete',
  payment_status: 'paid',
  customer: 'cus_1',
  customer_details: { email: owner.email },
  subscription: {
    id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { restaurant_id: 'rest-1' },
    items: { data: [{ price: { id: 'price_growth' } }] },
  },
  metadata: { restaurant_id: 'rest-1', plan_name: 'Scale' },
  line_items: { data: [{ price: { id: 'price_metered' } }, { price: { id: 'price_growth' } }] },
};

async function get(sessionId = 'cs_test_abc') {
  const response = {
    statusCode: null, body: null, setHeader: jest.fn(),
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  await handler({ method: 'GET', headers: {}, query: { session_id: sessionId } }, response);
  return response;
}

const originalEnv = process.env;
beforeEach(() => {
  jest.resetAllMocks();
  process.env = { ...originalEnv, STRIPE_GROWTH_PRICE_ID: 'price_growth', STRIPE_SCALE_PRICE_ID: 'price_scale' };
  verifyAuth.mockResolvedValue({ user: owner });
  mockRetrieve.mockResolvedValue(session);
  getSubscriptions.mockResolvedValue({ success: true, data: { records: [] } });
});
afterEach(() => { process.env = originalEnv; });

test('verifies the checkout tenant, derives the plan from the line items and omits customer data', async () => {
  const res = await get();
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({
    status: 'complete', payment_status: 'paid', subscription_status: 'active', is_trial: false, plan: 'Growth',
    access_confirmed: false,
  });
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  expect(getSubscriptions).toHaveBeenCalledWith('rest-1');
});

test('reports a Stripe trial separately from the payment state', async () => {
  mockRetrieve.mockResolvedValue({
    ...session, payment_status: 'no_payment_required', subscription: { ...session.subscription, status: 'trialing' },
  });
  expect((await get()).body).toMatchObject({
    status: 'complete', payment_status: 'no_payment_required', subscription_status: 'trialing', is_trial: true,
  });
});

test('does not infer a trial from a zero-total payment', async () => {
  mockRetrieve.mockResolvedValue({ ...session, payment_status: 'no_payment_required' });
  expect((await get()).body.is_trial).toBe(false);
});

test.each(['open', 'expired'])('cannot verify %s checkout even if no payment is required', async status => {
  mockRetrieve.mockResolvedValue({ ...session, status, payment_status: 'no_payment_required' });
  expect((await get()).statusCode).toBe(409);
});

test('treats unpaid complete Checkout as pending payment', async () => {
  mockRetrieve.mockResolvedValue({ ...session, payment_status: 'unpaid' });
  expect((await get()).statusCode).toBe(402);
});

test('rejects cross-tenant session metadata before returning status, even when email matches', async () => {
  mockRetrieve.mockResolvedValue({ ...session, status: 'open', metadata: { restaurant_id: 'rest-2' } });
  const res = await get();
  expect(res.statusCode).toBe(403);
  expect(res.body).toEqual({ error: 'Forbidden' });
  expect(getSubscriptions).not.toHaveBeenCalled();
});

test('rejects conflicting subscription metadata', async () => {
  mockRetrieve.mockResolvedValue({ ...session, subscription: { ...session.subscription, metadata: { restaurant_id: 'rest-2' } } });
  expect((await get()).statusCode).toBe(403);
});

test('accepts older Checkout only with a trusted exact tenant subscription and customer match', async () => {
  mockRetrieve.mockResolvedValue({ ...session, metadata: {}, subscription: { id: 'sub_1', status: 'active' } });
  expect((await get()).statusCode).toBe(403);
  getSubscriptions.mockResolvedValue({
    success: true, data: { records: [{ fields: { 'Subscription ID': 'sub_other', 'Customer ID': 'cus_1' } }] },
  });
  expect((await get()).statusCode).toBe(403);
  getSubscriptions.mockResolvedValue({
    success: true, data: { records: [{ fields: { 'Subscription ID': 'sub_1', 'Customer ID': 'cus_1' } }] },
  });
  expect((await get()).statusCode).toBe(200);
  expect(getSubscriptions).toHaveBeenCalledWith('rest-1');
});

test.each([
  { mode: 'payment' },
  { subscription: null },
  { line_items: { data: [{ price: { id: 'price_unknown' } }] } },
  { line_items: { data: [{ price: { id: 'price_growth' } }, { price: { id: 'price_scale' } }] } },
])('fails closed for an unverifiable subscription checkout %j', async overrides => {
  mockRetrieve.mockResolvedValue({ ...session, ...overrides });
  expect((await get()).statusCode).toBe(422);
});

test.each([
  [{ error: 'Unauthorized', status: 401 }, 401],
  [{ user: { ...owner, role: 'staff' } }, 403],
  [{ user: { sub: owner.sub, role: 'owner' } }, 403],
])('refuses a caller without owner access before contacting Stripe', async (auth, status) => {
  verifyAuth.mockResolvedValue(auth);
  expect((await get()).statusCode).toBe(status);
  expect(mockRetrieve).not.toHaveBeenCalled();
});

test('returns the same forbidden response for an unknown Stripe session', async () => {
  mockRetrieve.mockRejectedValue({ code: 'resource_missing', message: 'private@example.com' });
  expect((await get()).body).toEqual({ error: 'Forbidden' });
});

const currentBilling = {
  'Subscription ID': 'sub_1',
  'Customer ID': 'cus_1',
  'Plan Name': 'growth',
  Status: 'active',
};

function setLocalBilling(...rows) {
  getSubscriptions.mockResolvedValue({ success: true, data: { records: rows.map(fields => ({ fields })) } });
}

test('confirms dashboard access for the exact current tenant subscription', async () => {
  setLocalBilling(currentBilling);
  const res = await get();
  expect(res.statusCode).toBe(200);
  expect(res.body.access_confirmed).toBe(true);
  expect(getSubscriptions).toHaveBeenCalledWith('rest-1');
});

test('confirms access for a matching projected trial', async () => {
  mockRetrieve.mockResolvedValue({
    ...session, subscription: { ...session.subscription, status: 'trialing' },
  });
  setLocalBilling({ ...currentBilling, Status: 'trialing' });
  expect((await get()).body).toMatchObject({ is_trial: true, access_confirmed: true });
});

test.each([
  { 'Subscription ID': 'sub_different' },
  { 'Customer ID': 'cus_different' },
  { 'Plan Name': 'Scale' },
  { Status: 'trialing' },
  { Status: 'past_due' },
  { Status: 'canceled' },
])('reports confirmed Stripe payment while the current local row differs %j', async overrides => {
  setLocalBilling({ ...currentBilling, ...overrides }, currentBilling);
  const res = await get();
  expect(res.statusCode).toBe(200);
  expect(res.body).toMatchObject({ payment_status: 'paid', access_confirmed: false });
});

test('does not confirm new access for a matching past-due subscription', async () => {
  mockRetrieve.mockResolvedValue({
    ...session, subscription: { ...session.subscription, status: 'past_due' },
  });
  setLocalBilling({ ...currentBilling, Status: 'past_due' });
  expect((await get()).body).toMatchObject({ payment_status: 'paid', access_confirmed: false });
});

test('keeps Stripe verification available when the local projection read fails', async () => {
  getSubscriptions.mockRejectedValue(new Error('private@example.com'));
  const res = await get();
  expect(res.statusCode).toBe(200);
  expect(res.body).toMatchObject({ payment_status: 'paid', access_confirmed: false });
  expect(JSON.stringify(res.body)).not.toContain('private@example.com');
});

test('does not confirm current access when the Stripe subscription moved to a different plan', async () => {
  setLocalBilling(currentBilling);
  mockRetrieve.mockResolvedValue({
    ...session,
    subscription: {
      ...session.subscription, items: { data: [{ price: { id: 'price_scale' } }] },
    },
  });
  expect((await get()).body).toMatchObject({ plan: 'Growth', payment_status: 'paid', access_confirmed: false });
});

test('rejects a Checkout customer that differs from the expanded Stripe subscription customer', async () => {
  setLocalBilling(currentBilling);
  mockRetrieve.mockResolvedValue({ ...session, subscription: { ...session.subscription, customer: 'cus_other' } });
  expect((await get()).statusCode).toBe(403);
});
