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

// ============================================================
// resolveRestaurantId - email lookup path (lines 47-52)
// ============================================================
describe('StripeWebhook: resolveRestaurantId via email lookup', () => {
  test('resolves restaurant_id from email when metadata has no restaurant_id (lines 47-49)', async () => {
    // Subscription event without restaurant_id in metadata → triggers email lookup
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_email_test',
          customer: 'cus_email',
          items: { data: [{ price: { id: 'price_test_123' } }] },
          metadata: {}, // No restaurant_id → falls through to email lookup
          status: 'active',
          current_period_start: 1700000000,
          current_period_end: 1702688400,
          trial_end: null,
        },
      },
    });
    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'restaurant@example.com' });
    // Default supabase query mock returns { data: { id: 'rest-1' }, error: null }

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('logs warning when email lookup throws and falls through (lines 51-52)', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_catch_test',
          customer: 'cus_catch',
          items: { data: [{ price: { id: 'price_test_123' } }] },
          metadata: {}, // No restaurant_id → email lookup path
          status: 'active',
          current_period_start: 1700000000,
          current_period_end: 1702688400,
          trial_end: null,
        },
      },
    });
    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'bad@example.com' });

    // Make the supabase schema call throw to trigger the catch in resolveRestaurantId
    const { query: supabase } = require('../_lib/supabase');
    supabase.schema.mockImplementationOnce(() => { throw new Error('DB unreachable'); });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    // resolveRestaurantId returns null → subscription.created breaks early → still 200
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// subscription.created - DB failure paths (lines 132, 140)
// ============================================================
describe('StripeWebhook: subscription.created DB failure paths', () => {
  function makeCreatedEvent() {
    return {
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_fail_test',
          customer: 'cus_test',
          items: { data: [{ price: { id: 'price_test_123' } }] },
          metadata: { restaurant_id: 'rest-1' },
          status: 'active',
          current_period_start: 1700000000,
          current_period_end: 1702688400,
          trial_end: null,
        },
      },
    };
  }

  test('logs error when createSubscription fails (line 132)', async () => {
    mockConstructEvent.mockReturnValueOnce(makeCreatedEvent());
    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });
    createSubscription.mockResolvedValueOnce({ success: false, message: 'DB write failed' });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('logs error when updateRestaurantPlan fails (line 140)', async () => {
    mockConstructEvent.mockReturnValueOnce(makeCreatedEvent());
    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });
    // createSubscription succeeds (default), updateRestaurantPlan fails
    updateRestaurantPlan.mockResolvedValueOnce({ success: false, message: 'Plan update failed' });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// subscription.updated - failure paths (lines 159-160, 173)
// ============================================================
describe('StripeWebhook: subscription.updated failure paths', () => {
  function makeUpdatedEvent(hasRestaurantId = true) {
    return {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_updated_test',
          customer: 'cus_updated',
          items: { data: [{ price: { id: 'price_test_123' } }] },
          metadata: hasRestaurantId ? { restaurant_id: 'rest-1' } : {},
          status: 'active',
          current_period_start: 1700000000,
          current_period_end: 1702688400,
          trial_end: null,
        },
      },
    };
  }

  test('breaks early when restaurant_id cannot be resolved (lines 159-160)', async () => {
    mockConstructEvent.mockReturnValueOnce(makeUpdatedEvent(false));
    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'unknown@example.com' });

    // Override email lookup to return no data
    const { query: supabase } = require('../_lib/supabase');
    supabase.schema.mockImplementationOnce(() => ({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
            }),
          }),
        }),
      }),
    }));

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateSubscription).not.toHaveBeenCalled();
  });

  test('logs error when updateSubscription fails (line 173)', async () => {
    mockConstructEvent.mockReturnValueOnce(makeUpdatedEvent(true));
    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });
    updateSubscription.mockResolvedValueOnce({ success: false, message: 'update failed' });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// subscription.deleted - failure paths (lines 193-194, 204)
// ============================================================
describe('StripeWebhook: subscription.deleted failure paths', () => {
  function makeDeletedEvent(hasRestaurantId = true) {
    return {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_deleted_test',
          customer: 'cus_deleted',
          metadata: hasRestaurantId ? { restaurant_id: 'rest-1' } : {},
          status: 'canceled',
        },
      },
    };
  }

  test('breaks early when restaurant_id cannot be resolved (lines 193-194)', async () => {
    mockConstructEvent.mockReturnValueOnce(makeDeletedEvent(false));
    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'unknown@example.com' });

    const { query: supabase } = require('../_lib/supabase');
    supabase.schema.mockImplementationOnce(() => ({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
            }),
          }),
        }),
      }),
    }));

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateSubscription).not.toHaveBeenCalled();
  });

  test('logs error when updateSubscription (cancel) fails (line 204)', async () => {
    mockConstructEvent.mockReturnValueOnce(makeDeletedEvent(true));
    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });
    updateSubscription.mockResolvedValueOnce({ success: false, message: 'cancel failed' });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// Email catch blocks (lines 233, 257, 277)
// ============================================================
describe('StripeWebhook: email error catch blocks', () => {
  test('logs error when payment receipt email throws (line 233)', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'inv_receipt_fail',
          customer: 'cus_test',
          amount_paid: 9900,
          currency: 'usd',
        },
      },
    });
    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });
    sendPaymentReceiptEmail.mockRejectedValueOnce(new Error('Email service down'));

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('logs error when payment failed email throws (line 257)', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'inv_fail_email_fail',
          customer: 'cus_test',
          amount_due: 9900,
          currency: 'usd',
        },
      },
    });
    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });
    sendPaymentFailedEmail.mockRejectedValueOnce(new Error('Email service down'));

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('logs error when trial ending email throws (line 277)', async () => {
    const trialEnd = Math.floor(Date.now() / 1000) + 3 * 86400;
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.trial_will_end',
      data: {
        object: {
          id: 'sub_trial_fail',
          customer: 'cus_test',
          trial_end: trialEnd,
        },
      },
    });
    mockCustomersRetrieve.mockResolvedValueOnce({ email: 'test@restaurant.com' });
    sendTrialEndingEmail.mockRejectedValueOnce(new Error('Email service down'));

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// Top-level catch block (lines 289-290)
// ============================================================
describe('StripeWebhook: top-level catch block', () => {
  test('returns 500 when processing throws unexpectedly (lines 289-290)', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_throw_test',
          customer: 'cus_test',
          items: { data: [{ price: { id: 'price_test_123' } }] },
          metadata: { restaurant_id: 'rest-1' },
          status: 'active',
          current_period_start: 1700000000,
          current_period_end: 1702688400,
          trial_end: null,
        },
      },
    });
    // Make customers.retrieve throw inside the try block → caught by outer catch
    mockCustomersRetrieve.mockRejectedValueOnce(new Error('Stripe API unreachable'));

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Webhook processing failed',
    }));
  });
});
