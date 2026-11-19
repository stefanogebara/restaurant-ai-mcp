/**
 * Stripe Connect (platform-side) webhook
 * POST /api/stripe-connect-webhook
 *
 * Stripe Connect events fire on the *platform* (Seatable) account
 * when something changes on a connected restaurant's account. These
 * are a separate webhook endpoint from the regular Stripe webhook
 * (api/stripe-webhook.js) and use STRIPE_CONNECT_WEBHOOK_SECRET
 * (NOT STRIPE_WEBHOOK_SECRET).
 *
 * Events handled:
 *   account.updated                  — sync charges/payouts/details flags
 *   account.application.deauthorized — restaurant uninstalled the platform
 *   capability.updated               — log only (informational)
 *
 * Idempotency: reuses public.stripe_webhook_events_processed
 * (event_id PK). Receipts are recorded after successful processing.
 */

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { createSecureLogger } = require('./_lib/secure-logger');
const { supabaseAdmin } = require('./_lib/supabase');
const { setWebhookCors } = require('./_lib/cors');
const { ACCOUNT_SYNC_FIELDS, connectAccounts, refreshConnectAccount } = require('./_lib/stripe-connect-account');

const logger = createSecureLogger('StripeConnectWebhook');
const endpointSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!endpointSecret) {
    logger.error('STRIPE_CONNECT_WEBHOOK_SECRET not configured');
    return res.status(503).json({ error: 'Webhook not configured' });
  }

  // 1. Raw-body signature verify. Stripe HMAC is over the exact wire bytes;
  // bodyParser:false (below) tells Vercel not to consume the stream, so we
  // read it ourselves into a UTF-8 string. Mirrors api/square-webhook.js.
  let bodyForVerify;
  try {
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', (c) => chunks.push(c));
      req.on('end', resolve);
      req.on('error', reject);
    });
    bodyForVerify = Buffer.concat(chunks).toString('utf8');
  } catch (err) {
    logger.error('Webhook rejected: raw-body read failed', { error: err.message });
    return res.status(400).json({ error: 'Invalid webhook request', reason: 'raw_body_read_failed' });
  }
  if (!bodyForVerify) {
    logger.error('Webhook rejected: empty body');
    return res.status(400).json({ error: 'Invalid webhook request', reason: 'no_raw_body' });
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(bodyForVerify, sig, endpointSecret);
  } catch (err) {
    // Stripe's StripeSignatureVerificationError lumps two distinct failures
    // under one exception type. Distinguish them in the response so the
    // next "bad signature" doesn't burn six hours of debugging:
    //   - "Timestamp outside the tolerance zone" → caller's clock drifted
    //     past the 5-min window (likely an unsynced machine running the
    //     signed-test script, not a real Stripe delivery — Stripe's
    //     infra is NTP-synced).
    //   - anything else → genuine secret/body mismatch.
    const isClockSkew = /tolerance zone/i.test(err.message || '');
    logger.error('Signature verification failed', { error: err.message, clock_skew: isClockSkew });
    return res.status(400).json({
      error: 'Invalid webhook request',
      reason: isClockSkew ? 'clock_skew' : 'bad_signature',
    });
  }

  // Mirror updates are idempotent. Record the receipt only after they succeed,
  // so a retry after a database failure still reaches the update.
  try {
    const receipts = supabaseAdmin.from('stripe_webhook_events_processed');
    const { data: receipt, error: readError } = await receipts.select('event_id')
      .eq('event_id', event.id).maybeSingle();
    if (readError) throw readError;
    if (receipt) return res.status(200).json({ received: true, deduplicated: true });

    switch (event.type) {
      case 'account.updated': {
        const stripeAccountId = event.data.object.id;
        const { data: row, error } = await connectAccounts()
          .select(ACCOUNT_SYNC_FIELDS).eq('stripe_account_id', stripeAccountId).maybeSingle();
        if (error) throw error;
        if (!row || row.status === 'revoked') break;

        // Webhooks can arrive out of order. The event identifies the account,
        // while Stripe's current account flags decide how new deposits route.
        const state = await refreshConnectAccount(row);
        if (!state) throw new Error('Connect account changed during refresh');
        logger.info('Connect account refreshed', { stripe_account_id: stripeAccountId, status: state.status });
        break;
      }

      case 'account.application.deauthorized': {
        // event.account is the connected account ID Stripe is notifying about.
        const stripeAccountId = event.account;
        logger.info('Connect account deauthorized', { stripe_account_id: stripeAccountId });

        const { error: updErr } = await supabaseAdmin
          .schema('restaurant')
          .from('stripe_connect_accounts')
          .update({ status: 'revoked', charges_enabled: false, payouts_enabled: false })
          .eq('stripe_account_id', stripeAccountId);

        if (updErr) {
          logger.error('Failed to mark account revoked', { stripe_account_id: stripeAccountId, error: updErr.message });
          throw updErr;
        }
        break;
      }

      case 'capability.updated': {
        // Informational for now — a follow-up sub-step will surface
        // capability requirements (e.g., "additional ID verification needed")
        // in the dashboard UI.
        const cap = event.data.object;
        logger.info('Connect capability updated', {
          stripe_account_id: event.account,
          capability: cap.id,
          status: cap.status,
          requested: cap.requested,
        });
        break;
      }

      default:
        logger.info('Unhandled Connect event type', { type: event.type });
    }

    const { error: insertError } = await receipts.insert({ event_id: event.id, event_type: event.type });
    if (insertError && insertError.code !== '23505') throw insertError;
    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Connect webhook processing failed', { event_id: event.id, type: event.type, error: err.message });
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Disable Vercel's auto JSON body parser so we can read the raw bytes for
// Stripe HMAC verification. Mirrors api/square-webhook.js.
module.exports.config = { api: { bodyParser: false } };

