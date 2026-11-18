/**
 * Tests for api/stripe-webhook.js
 * Stripe payment webhook handler
 */

// Set Stripe price-ID env vars before requiring the handler — the
// PRICE_ID_TO_PLAN map is built at module load from process.env. Tests use
// these IDs in the webhook event fixtures.
process.env.STRIPE_STARTER_PRICE_ID = 'price_starter';
process.env.STRIPE_GROWTH_PRICE_ID = 'price_growth';
process.env.STRIPE_SCALE_PRICE_ID = 'price_scale';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

// --- Mock dependencies ---
const mockCustomersRetrieve = jest.fn();
const mockCustomersUpdate = jest.fn();
const mockConstructEvent = jest.fn();
const mockRetrieveSubscription = jest.fn();
const mockProject = jest.fn();
const mockLedgerInsert = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    subscriptions: { retrieve: mockRetrieveSubscription },
    customers: {
      retrieve: mockCustomersRetrieve,
      update: mockCustomersUpdate,
    },
  }));
});

// Build a mock chain for supabase queries.
// schema('restaurant').from().select().eq().limit().single() → email lookup (Method 4)
// from('subscriptions').select().eq().limit().single() → subscriptions table lookup (Method 3 in resolveRestaurantId)
// from('subscriptions').select().eq().limit().maybeSingle() → idempotency guard
const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
const mockSubscriptionsSingle = jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
const mockSubscriptionsLimit = jest.fn().mockReturnValue({
  single: mockSubscriptionsSingle,
  maybeSingle: mockMaybeSingle,
});
const mockSubscriptionsEq = jest.fn().mockReturnValue({
  limit: mockSubscriptionsLimit,
});
const mockSubscriptionsSelect = jest.fn().mockReturnValue({
  eq: mockSubscriptionsEq,
});

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    rpc: mockProject,
    from: jest.fn(table => table === 'stripe_webhook_events_processed'
      ? { insert: mockLedgerInsert }
      : { select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle }) }) }),
  },
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
    from: jest.fn().mockReturnValue({
      select: mockSubscriptionsSelect,
      // Source post-2026 also issues a defensive UPDATE that cancels the
      // synthetic onboarding 'Free' row when a real paid subscription gets
      // created (avoids both rows being active=true and manager-usage
      // picking nondeterministically). Chain: update().eq().eq().eq().neq()
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              neq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    }),
  },
}));

jest.mock('../_services/subscription-limits', () => ({
  getPlanFromPriceId: jest.fn(price => price === 'price_growth' ? 'growth' : null),
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
  test('passes the unmodified Vercel request stream to Stripe signature verification', async () => {
    const { Readable } = require('node:stream');
    const { res } = createMockReqRes();
    const text = '{ "type":  "unhandled.fixture" }';
    const req = Readable.from([Buffer.from(text.slice(0, 5)), Buffer.from(text.slice(5))]);
    req.method = 'POST';
    req.headers = { 'stripe-signature': 'sig_test' };
    mockConstructEvent.mockReturnValue({ id: 'evt_raw', type: 'unhandled.fixture', data: { object: {} } });

    await handler(req, res);

    expect(handler.config.api.bodyParser).toBe(false);
    expect(mockConstructEvent).toHaveBeenCalledWith(Buffer.from(text), 'sig_test', 'whsec_test');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test('returns 400 for invalid signature', async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error('Invalid signature');
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid webhook request' });
  });
});

// ============================================================
// checkout.session.completed
// ============================================================
describe('StripeWebhook: checkout.session.completed', () => {
  test('logs checkout session and propagates restaurant_id to customer metadata', async () => {
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
    mockCustomersUpdate.mockResolvedValueOnce({});

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
    // Verify restaurant_id was propagated to Stripe customer metadata
    expect(mockCustomersUpdate).toHaveBeenCalledWith('cus_test', {
      metadata: { restaurant_id: 'rest-1' },
    });
  });

  test('does not propagate metadata when restaurant_id is missing', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_no_meta',
          customer: 'cus_test',
          subscription: 'sub_test',
          customer_details: { email: 'test@test.com' },
          metadata: {},
        },
      },
    });

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockCustomersUpdate).not.toHaveBeenCalled();
  });

  test('handles customer update failure gracefully', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_fail',
          customer: 'cus_test',
          subscription: 'sub_test',
          customer_details: { email: 'test@test.com' },
          metadata: { restaurant_id: 'rest-1' },
        },
      },
    });
    mockCustomersUpdate.mockRejectedValueOnce(new Error('Stripe API error'));

    const { req, res } = createMockReqRes();
    await handler(req, res);
    // Should still return 200 — metadata propagation failure is non-fatal
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});

// ============================================================
// customer.subscription.created
// ============================================================
describe('StripeWebhook: subscription projection', () => {
  const subscription = {
    id: 'sub_audit', customer: { id: 'cus_audit', email: 'billing@example.test' },
    status: 'trialing', metadata: { restaurant_id: 'rest-1' }, trial_end: 1795600000,
    items: { data: [
      { price: { id: 'price_metered' } },
      { price: { id: 'price_growth' }, current_period_start: 1794300000, current_period_end: 1795600000 },
    ] },
  };
  const event = (type = 'customer.subscription.created', object = { id: subscription.id, status: 'incomplete' }) => ({
    id: 'evt_audit', type, data: { object },
  });
  async function deliver(notification) {
    mockConstructEvent.mockReturnValue(notification);
    const { req, res } = createMockReqRes();
    await handler(req, res);
    return res;
  }
  beforeEach(() => {
    mockRetrieveSubscription.mockResolvedValue(subscription);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockProject.mockResolvedValue({ data: 'applied', error: null });
  });

  test.each(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.resumed'])(
    'projects current Stripe state and item periods atomically for %s', async type => {
      const res = await deliver(event(type));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockRetrieveSubscription).toHaveBeenCalledWith(subscription.id, { expand: ['customer'] });
      expect(mockProject).toHaveBeenCalledWith('project_stripe_subscription', expect.objectContaining({
        p_event_id: 'evt_audit', p_event_type: type, p_restaurant_id: 'rest-1', p_price_id: 'price_growth',
        p_plan: 'Growth', p_status: 'trialing', p_customer_id: 'cus_audit', p_customer_email: 'billing@example.test',
        p_period_end: new Date(1795600000 * 1000).toISOString(),
      }));
      expect(mockLedgerInsert).not.toHaveBeenCalled();
    },
  );

  test('can activate from Checkout before subscription.created, with a current Stripe lookup', async () => {
    const res = await deliver(event('checkout.session.completed', {
      mode: 'subscription', customer: 'cus_audit', subscription: 'sub_audit', metadata: { restaurant_id: 'rest-1' },
    }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockProject).toHaveBeenCalledWith('project_stripe_subscription', expect.objectContaining({
      p_subscription_id: 'sub_audit',
    }));
  });

  test('returns 500 on database failure and a later delivery can apply the same event', async () => {
    mockProject.mockResolvedValueOnce({ error: { code: '23505' } });
    expect((await deliver(event())).status).toHaveBeenCalledWith(500);
    expect((await deliver(event())).status).toHaveBeenCalledWith(200);
    expect(mockProject).toHaveBeenCalledTimes(2);
    expect(mockLedgerInsert).not.toHaveBeenCalled();
  });

  test('only the transaction decides whether an event is already applied', async () => {
    mockProject.mockResolvedValue({ data: 'duplicate' });
    expect((await deliver(event())).json).toHaveBeenCalledWith({ received: true, deduplicated: true });
  });

  test('resolves a legacy subscription from its exact DB ID, and never guesses by email', async () => {
    mockRetrieveSubscription.mockResolvedValue({ ...subscription, metadata: {} });
    expect((await deliver(event())).status).toHaveBeenCalledWith(500);
    expect(mockProject).not.toHaveBeenCalled();
    mockMaybeSingle.mockResolvedValue({ data: { restaurant_id: 'rest-1' } });
    expect((await deliver(event())).status).toHaveBeenCalledWith(200);
  });

  test('rejects conflicting restaurant bindings', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { restaurant_id: 'different' } });
    expect((await deliver(event())).status).toHaveBeenCalledWith(500);
    expect(mockProject).not.toHaveBeenCalled();
  });

  test('a delayed update carries the current canceled status into the transaction', async () => {
    mockRetrieveSubscription.mockResolvedValue({ ...subscription, status: 'canceled', canceled_at: 1794500000 });
    const res = await deliver(event('customer.subscription.updated', { id: subscription.id, status: 'active' }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockProject.mock.calls[0][1]).toMatchObject({ p_status: 'canceled' });
  });
});

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
// resolveRestaurantId - fallback chain
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
  test('returns 500 when Stripe cannot supply the authoritative subscription', async () => {
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
    mockRetrieveSubscription.mockRejectedValueOnce(new Error('Stripe API unreachable'));

    const { req, res } = createMockReqRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'Webhook processing failed',
    }));
  });
});
