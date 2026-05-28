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
 * (event_id PK). Stripe retries every webhook on 5xx for ~3 days, so
 * a unique-violation on insert means we've already processed it.
 */

const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { createSecureLogger } = require('./_lib/secure-logger');
const { supabaseAdmin } = require('./_lib/supabase');
const { setWebhookCors } = require('./_lib/cors');

const logger = createSecureLogger('StripeConnectWebhook');
const endpointSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

/**
 * Map Stripe Account flags to our row's status.
 *   active     — restaurant has finished onboarding AND can charge
 *   restricted — onboarding done but charges blocked (capability/KYC issue)
 *   pending    — restaurant hasn't finished the hosted onboarding yet
 *
 * `revoked` is set elsewhere (deauthorize handler), not from these flags.
 */
function computeStatus(acct) {
  if (acct.charges_enabled && acct.details_submitted) return 'active';
  if (acct.details_submitted) return 'restricted';
  return 'pending';
}

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
    logger.error('Signature verification failed', { error: err.message });
    return res.status(400).json({ error: 'Invalid webhook request', reason: 'bad_signature' });
  }

  // 2. Idempotency guard. Atomic insert into stripe_webhook_events_processed;
  // 23505 unique-violation means we already processed this event.id.
  try {
    const { error: idempErr } = await supabaseAdmin
      .from('stripe_webhook_events_processed')
      .insert({ event_id: event.id, event_type: event.type });
    if (idempErr) {
      if (idempErr.code === '23505') {
        logger.info('Connect webhook event already processed, skipping', { event_id: event.id, type: event.type });
        return res.status(200).json({ received: true, deduplicated: true });
      }
      // Non-fatal — better to process once than lose the event entirely.
      logger.error('Idempotency insert failed (continuing)', { event_id: event.id, error: idempErr.message });
    }
  } catch (e) {
    logger.error('Idempotency insert threw (continuing)', { event_id: event.id, error: e?.message });
  }

  // 3. Dispatch
  try {
    switch (event.type) {
      case 'account.updated': {
        const acct = event.data.object; // Stripe Account
        const stripeAccountId = acct.id;
        const status = computeStatus(acct);
        logger.info('Connect account updated', {
          stripe_account_id: stripeAccountId,
          charges_enabled: acct.charges_enabled,
          payouts_enabled: acct.payouts_enabled,
          details_submitted: acct.details_submitted,
          new_status: status,
        });

        const { data: updated, error: updErr } = await supabaseAdmin
          .schema('restaurant')
          .from('stripe_connect_accounts')
          .update({
            charges_enabled: !!acct.charges_enabled,
            payouts_enabled: !!acct.payouts_enabled,
            details_submitted: !!acct.details_submitted,
            status,
            default_currency: acct.default_currency || null,
          })
          .eq('stripe_account_id', stripeAccountId)
          .select('id');

        if (updErr) {
          logger.error('Failed to update stripe_connect_accounts', { stripe_account_id: stripeAccountId, error: updErr.message });
          throw updErr; // 500 → Stripe retries
        }
        if (!updated || updated.length === 0) {
          // No matching row. Could be a race (onboarding insert lost), or an
          // account we don't own. Surface but don't fail — Stripe retries
          // wouldn't help, the row will never materialize for an event we
          // can't attribute.
          logger.warn('No stripe_connect_accounts row matched account.updated', { stripe_account_id: stripeAccountId });
        }
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

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error('Connect webhook processing failed', { event_id: event.id, type: event.type, error: err.message });
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Disable Vercel's auto JSON body parser so we can read the raw bytes for
// Stripe HMAC verification. Mirrors api/square-webhook.js.
module.exports.config = { api: { bodyParser: false } };

