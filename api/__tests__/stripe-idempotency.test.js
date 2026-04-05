process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
process.env.SUPABASE_ANON_KEY = 'fake-anon';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';

const mockCreateSubscription = jest.fn(() => Promise.resolve({ success: true }));
const mockUpdateRestaurantPlan = jest.fn(() => Promise.resolve({ success: true }));

jest.mock('../_lib/supabase', () => ({
  createSubscription: mockCreateSubscription,
  updateSubscription: jest.fn(() => Promise.resolve({ success: true })),
  getSubscriptionByCustomerId: jest.fn(() => Promise.resolve({ success: false })),
  updateRestaurantPlan: mockUpdateRestaurantPlan,
  query: {
    schema: jest.fn(() => ({
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn(() => Promise.resolve({ data: { id: 'rest-001' }, error: null })),
      })),
    })),
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnValue({
        single: jest.fn(() => Promise.resolve({ data: null, error: { message: 'not found' } })),
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      }),
    })),
  },
}));

jest.mock('../services/subscription-limits', () => ({
  getPlanFromPriceId: jest.fn(() => 'growth'),
}));

jest.mock('../_lib/email', () => ({
  sendPaymentReceiptEmail: jest.fn(() => Promise.resolve()),
  sendPaymentFailedEmail: jest.fn(() => Promise.resolve()),
  sendTrialEndingEmail: jest.fn(() => Promise.resolve()),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
}));

jest.mock('stripe', () => jest.fn(() => ({
  customers: { retrieve: jest.fn(() => Promise.resolve({ email: 'owner@test.com' })) },
  webhooks: {
    constructEvent: jest.fn(() => ({
      id: 'evt_test_123',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test_abc',
          customer: 'cus_test_xyz',
          status: 'active',
          items: { data: [{ price: { id: 'price_growth_monthly' } }] },
          current_period_start: 1700000000,
          current_period_end: 1702592000,
          trial_end: null,
          metadata: { restaurant_id: 'rest-001' },
        },
      },
    })),
  },
})));

const handler = require('../stripe-webhook');

function mockReq() {
  return {
    method: 'POST',
    headers: { 'stripe-signature': 'fake-sig' },
    body: Buffer.from('{}'),
  };
}
function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), end: jest.fn(), send: jest.fn() };
}

beforeEach(() => jest.clearAllMocks());

describe('Stripe webhook idempotency', () => {
  test('createSubscription receives idempotency_key derived from event.id', async () => {
    await handler(mockReq(), mockRes());
    expect(mockCreateSubscription).toHaveBeenCalledWith(
      'rest-001',
      expect.objectContaining({ 'Subscription ID': 'sub_test_abc' }),
      expect.objectContaining({ idempotency_key: 'stripe-event-evt_test_123' })
    );
  });

  test('same event twice passes identical idempotency_key both times', async () => {
    await handler(mockReq(), mockRes());
    await handler(mockReq(), mockRes());
    const key1 = mockCreateSubscription.mock.calls[0][2].idempotency_key;
    const key2 = mockCreateSubscription.mock.calls[1][2].idempotency_key;
    expect(key1).toBe(key2);
    expect(key1).toBe('stripe-event-evt_test_123');
  });
});
