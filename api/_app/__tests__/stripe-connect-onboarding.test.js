const mockAuth = jest.fn();
const mockRead = jest.fn();
const mockCountry = jest.fn();
const mockInsert = jest.fn();
const mockCreate = jest.fn();
const mockLink = jest.fn();

jest.mock('../_lib/auth', () => ({ verifyJWT: (...args) => mockAuth(...args) }));
jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { schema: () => ({ from: (table) => {
    if (table === 'restaurant_config') {
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockCountry }) }) }) };
    }
    return {
      select: () => ({ eq: () => ({ maybeSingle: mockRead }) }),
      insert: mockInsert,
    };
  } }) },
}));
jest.mock('stripe', () => jest.fn(() => ({
  accounts: { create: mockCreate }, accountLinks: { create: mockLink },
})));
jest.mock('../_lib/rate-limit', () => ({ checkAndApplyRateLimit: async () => false }));

process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
process.env.CLIENT_URL = 'https://seatable.one';
const handler = require('../stripe-connect-onboarding');

function request(body = {}) {
  const res = {
    code: 200,
    status(code) { this.code = code; return this; },
    json(result) { this.result = result; return this; },
  };
  return handler({ method: 'POST', headers: { authorization: 'Bearer owner-token' }, body }, res).then(() => res);
}

beforeEach(() => {
  jest.resetAllMocks();
  require('stripe').mockImplementation(() => ({
    accounts: { create: mockCreate }, accountLinks: { create: mockLink },
  }));
  mockAuth.mockResolvedValue({ sub: 'user-a', restaurant_id: 'restaurant-a', role: 'owner' });
  mockRead.mockResolvedValue({ data: null });
  mockCountry.mockResolvedValue({ data: { country: 'Spain' } });
  mockInsert.mockResolvedValue({ error: null });
  mockCreate.mockResolvedValue({ id: 'acct_new', country: 'ES', default_currency: 'eur' });
  mockLink.mockResolvedValue({ url: 'https://connect.stripe.com/setup/s/test' });
});

test('binds the configured country and fixed return URLs to the verified owner', async () => {
  const res = await request({ country: 'BR', return_url: 'https://example.invalid/', refresh_url: 'https://example.invalid/' });
  expect(res.code).toBe(200);
  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining({ country: 'ES', metadata: { restaurant_id: 'restaurant-a' } }),
    { idempotencyKey: 'connect-onboarding:restaurant-a:ES:first' },
  );
  expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ stripe_account_id: 'acct_new', country: 'ES' }));
  expect(mockLink).toHaveBeenCalledWith(expect.objectContaining({
    account: 'acct_new',
    return_url: 'https://seatable.one/host-dashboard/integrations?stripe_connect=ok#integrations:payments',
    refresh_url: 'https://seatable.one/host-dashboard/integrations?stripe_connect=refresh#integrations:payments',
  }));
});

test('declines a team member or a missing country before creating anything in Stripe', async () => {
  mockAuth.mockResolvedValueOnce({ restaurant_id: 'restaurant-a', role: 'manager' });
  expect((await request()).code).toBe(403);
  mockCountry.mockResolvedValueOnce({ data: { country: null } });
  expect((await request()).code).toBe(422);
  expect(mockCreate).not.toHaveBeenCalled();
});

test('renews the same linked account without looking up the restaurant country', async () => {
  mockRead.mockResolvedValue({ data: { stripe_account_id: 'acct_pending', status: 'pending' } });
  expect((await request()).result.account_id).toBe('acct_pending');
  expect(mockCountry).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});

test('never issues a link to an account whose database write failed', async () => {
  mockInsert.mockResolvedValue({ error: { code: 'PGRST000' } });
  expect((await request()).code).toBe(503);
  expect(mockLink).not.toHaveBeenCalled();
});

test('uses the persisted binding if a parallel request wins the database insert', async () => {
  mockRead.mockResolvedValueOnce({ data: null })
    .mockResolvedValueOnce({ data: { stripe_account_id: 'acct_saved', status: 'pending' } });
  mockInsert.mockResolvedValue({ error: { code: '23505' } });
  expect((await request()).result.account_id).toBe('acct_saved');
  expect(mockLink).toHaveBeenCalledWith(expect.objectContaining({ account: 'acct_saved' }));
});
