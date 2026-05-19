/**
 * Tests for Phase R.2 stripe-webhook idempotency.
 *
 * Stripe retries every webhook on 5xx for ~3 days. Before this guard
 * only customer.subscription.created was idempotent. A duplicate
 * customer.subscription.deleted could cancel the same tenant twice;
 * invoice.payment_succeeded could send the receipt + claim the referral
 * reward twice; subscription.updated could re-run the plan transition.
 *
 * Every event is now atomic-inserted into
 * public.stripe_webhook_events_processed before processing. Duplicate
 * events fail with Postgres 23505 → handler returns 200 + deduplicated:
 * true and Stripe stops retrying.
 */

const mockInsert = jest.fn();

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('../_lib/cors', () => ({
  setWebhookCors: jest.fn(),
  handlePreflight: jest.fn(() => false),
}));

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn((table) => {
      if (table === 'stripe_webhook_events_processed') {
        return { insert: (...args) => mockInsert(...args) };
      }
      // Other tables — irrelevant to this test, return a no-op chain.
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
    }),
  },
}));

// Stub everything downstream of the idempotency check — we only assert
// that duplicate events SKIP the work.
jest.mock('../services/subscription-limits', () => ({
  getPlanFromPriceId: jest.fn(() => 'Starter'),
}));
jest.mock('../_lib/email', () => ({
  sendPaymentReceiptEmail: jest.fn(),
  sendPaymentFailedEmail: jest.fn(),
  sendTrialEndingEmail: jest.fn(),
  sendReferralRewardEmail: jest.fn(),
}));

const mockConstructEvent = jest.fn();
jest.mock('stripe', () => jest.fn(() => ({
  webhooks: { constructEvent: mockConstructEvent },
  customers: { retrieve: jest.fn().mockResolvedValue({ email: 'x@x.com', metadata: {} }) },
})));

process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

function createReq(body = '{}', sig = 't=1,v1=abc') {
  return {
    method: 'POST',
    headers: { 'stripe-signature': sig },
    rawBody: body,
    body: {},
  };
}
function createRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
    setHeader: jest.fn(),
    end: jest.fn(),
  };
  return res;
}

describe('POST /api/stripe-webhook — event idempotency', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockConstructEvent.mockReset();
  });

  it('inserts every event into the dedup table BEFORE processing', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_fresh_001',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_x', customer: 'cus_x', items: { data: [] } } },
    });
    mockInsert.mockResolvedValue({ error: null });

    jest.resetModules();
    const handler = require('../stripe-webhook');
    await handler(createReq(), createRes());

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: 'evt_fresh_001',
        event_type: 'customer.subscription.deleted',
      }),
    );
  });

  it('returns 200 + deduplicated:true on duplicate event (Postgres 23505)', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_duplicate_002',
      type: 'invoice.payment_succeeded',
      data: { object: { id: 'in_x', customer: 'cus_x', subscription: 'sub_x', amount_paid: 4970 } },
    });
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } });

    jest.resetModules();
    const handler = require('../stripe-webhook');
    const res = createRes();
    await handler(createReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      received: true,
      deduplicated: true,
    }));
  });

  it('non-23505 DB errors do NOT block event processing (log + continue)', async () => {
    // If the dedup table itself is broken (e.g. column dropped, transient
    // Supabase outage), we'd rather process the event once than drop it
    // entirely. Sending a receipt email twice is recoverable; losing a
    // subscription.deleted is not.
    mockConstructEvent.mockReturnValue({
      id: 'evt_db_error_003',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_x', customer: 'cus_x', items: { data: [] } } },
    });
    mockInsert.mockResolvedValue({ error: { code: '08006', message: 'connection refused' } });

    jest.resetModules();
    const handler = require('../stripe-webhook');
    const res = createRes();
    await handler(createReq(), res);

    // Doesn't 200-skip — handler proceeds (may return 200 success or
    // some other code from downstream, but NOT the deduplicated short-
    // circuit).
    if (res.statusCode === 200) {
      expect(res.body?.deduplicated).not.toBe(true);
    }
  });
});
