/**
 * Tests for api/stripe-webhook.js
 * Stripe payment webhook handler
 */

// --- Mock dependencies ---
const mockCustomersRetrieve = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    customers: {
      retrieve: mockCustomersRetrieve,
    },
  }));
});

jest.mock('../_lib/supabase', () => ({
  createSubscription: jest.fn().mockResolvedValue({ success: true }),
  updateSubscription: jest.fn().mockResolvedValue({ success: true }),
  getSubscriptionByCustomerId: jest.fn().mockResolvedValue(null),
  updateRestaurantPlan: jest.fn().mockResolvedValue({ success: true }),
  query: {
    schema: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: { id: 'rest-1' }, error: null }),
            }),
          }),
        }),
      }),
    }),
  },
}));

jest.mock('../services/subscription-limits', () => ({
  getPlanFromPriceId: jest.fn().mockReturnValue('growth'),
}));

jest.mock('../_lib/email', () => ({
  sendPaymentReceiptEmail: jest.fn().mockResolvedValue({}),
  sendPaymentFailedEmail: jest.fn().mockResolvedValue({}),
  sendTrialEndingEmail: jest.fn().mockResolvedValue({}),
}));

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const handler = require('../stripe-webhook');
const { createSubscription, updateSubscription, updateRestaurantPlan } = require('../_lib/supabase');
const { sendPaymentReceiptEmail, sendPaymentFailedEmail, sendTrialEndingEmail } = require('../_lib/email');

function createMockReqRes(overrides = {}) {
  const req = {
    method: overrides.method || 'POST',
    headers: overrides.headers || { 'stripe-signature': 'sig_test' },
    body: overrides.body || 'raw-body',
    query: overrides.query || {},
    ...overrides,
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    end: jest.fn(),
    setHeader: jest.fn(),
  };
  return { req, res };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// Method checks
// ============================================================
describe('StripeWebhook: Method checks', () => {
  test('handles OPTIONS', async () => {
    const { req, res } = createMockReqRes({ method: 'OPTIONS' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('rejects GET method', async () => {
    const { req, res } = createMockReqRes({ method: 'GET' });
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

// ============================================================
// Signature verification
// ============================================================
describe('StripeWebhook: Signature verification', () => {
  test('returns 400 for invalid signature', async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error('Invalid signature');
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Webhook Error'));
  });
});

// ============================================================
// checkout.session.completed
// ============================================================
describe('StripeWebhook: checkout.session.completed', () => {
  test('logs checkout session without error', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          customer: 'cus_test',
          subscription: 'sub_test',
          customer_details: { email: 'test@test.com' },
          metadata: { restaurant_id: 'rest-1' },
        },
      },
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});

// ============================================================
// customer.subscription.created
// ============================================================
describe('StripeWebhook: customer.subscription.created', () => {
  test('creates subscription in database', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test_123',
          customer: 'cus_test',
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          trial_end: null,
          metadata: { restaurant_id: 'rest-1' },
          items: {
            data: [{ price: { id: 'price_growth' } }],
          },
        },
      },
    });

    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(createSubscription).toHaveBeenCalledWith('rest-1', expect.objectContaining({
      'Subscription ID': 'sub_test_123',
      'Plan Name': 'growth',
      'Status': 'active',
    }));
    expect(updateRestaurantPlan).toHaveBeenCalledWith('rest-1', 'growth', 'test@restaurant.com');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('skips when restaurant_id cannot be resolved', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_test_456',
          customer: 'cus_test',
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          trial_end: null,
          metadata: {},
          items: { data: [{ price: { id: 'price_growth' } }] },
        },
      },
    });

    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'unknown@test.com' });

    // Override supabase query to return no match
    const supabase = require('../_lib/supabase');
    supabase.query.schema.mockReturnValueOnce({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
            }),
          }),
        }),
      }),
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(createSubscription).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// customer.subscription.updated
// ============================================================
describe('StripeWebhook: customer.subscription.updated', () => {
  test('updates subscription in database', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test_789',
          customer: 'cus_test',
          status: 'active',
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
          trial_end: null,
          metadata: { restaurant_id: 'rest-1' },
          items: { data: [{ price: { id: 'price_scale' } }] },
        },
      },
    });

    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(updateSubscription).toHaveBeenCalledWith('rest-1', 'sub_test_789', expect.objectContaining({
      'Status': 'active',
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// customer.subscription.deleted
// ============================================================
describe('StripeWebhook: customer.subscription.deleted', () => {
  test('cancels subscription and downgrades plan', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_del_123',
          customer: 'cus_test',
          metadata: { restaurant_id: 'rest-1' },
          items: { data: [{ price: { id: 'price_growth' } }] },
        },
      },
    });

    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(updateSubscription).toHaveBeenCalledWith('rest-1', 'sub_del_123', expect.objectContaining({
      'Status': 'canceled',
    }));
    expect(updateRestaurantPlan).toHaveBeenCalledWith('rest-1', 'Starter');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// invoice.payment_succeeded
// ============================================================
describe('StripeWebhook: invoice.payment_succeeded', () => {
  test('sends receipt email on payment success', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'inv_123',
          customer: 'cus_test',
          amount_paid: 9900,
          currency: 'eur',
        },
      },
    });

    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(sendPaymentReceiptEmail).toHaveBeenCalledWith(expect.objectContaining({
      customerEmail: 'test@restaurant.com',
      amount: '99.00',
      currency: 'EUR',
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// invoice.payment_failed
// ============================================================
describe('StripeWebhook: invoice.payment_failed', () => {
  test('sends failure email on payment failure', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'inv_fail_123',
          customer: 'cus_test',
          amount_due: 9900,
          currency: 'eur',
        },
      },
    });

    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(sendPaymentFailedEmail).toHaveBeenCalledWith(expect.objectContaining({
      customerEmail: 'test@restaurant.com',
      amount: '99.00',
      currency: 'EUR',
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// customer.subscription.trial_will_end
// ============================================================
describe('StripeWebhook: customer.subscription.trial_will_end', () => {
  test('sends trial ending email', async () => {
    const trialEnd = Math.floor(Date.now() / 1000) + 3 * 86400;
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.trial_will_end',
      data: {
        object: {
          id: 'sub_trial_123',
          customer: 'cus_test',
          trial_end: trialEnd,
        },
      },
    });

    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });

    const { req, res } = createMockReqRes();
    await handler(req, res);

    expect(sendTrialEndingEmail).toHaveBeenCalledWith(expect.objectContaining({
      customerEmail: 'test@restaurant.com',
    }));
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// Unhandled event type
// ============================================================
describe('StripeWebhook: Unhandled events', () => {
  test('returns 200 for unhandled event types', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'some.unknown.event',
      data: { object: {} },
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});
