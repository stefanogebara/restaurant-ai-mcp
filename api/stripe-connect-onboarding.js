/**
 * Stripe Connect (Standard) onboarding
 * POST /api/stripe/connect/onboarding
 *
 * Returns a Stripe-hosted AccountLink URL the restaurant can redirect
 * to. On first call we create a Stripe Standard Account for the
 * restaurant (country=BR, BRL) and persist it in
 * restaurant.stripe_connect_accounts. Subsequent calls reuse the
 * existing account_id and just mint a fresh AccountLink (they're
 * single-use and expire after a few minutes).
 *
 * Why Standard (not Express/Custom): lowest compliance burden for
 * Seatable — Stripe handles KYC, dashboards, and disputes; the
 * restaurant owns its account end-to-end. Seatable can still take an
 * application_fee_amount on each payment in Phase 3.
 *
 * Body:
 *   {
 *     return_url:  string  // where Stripe sends the restaurant after onboarding
 *     refresh_url: string  // where Stripe sends them if the link expires
 *     country?:    string  // ISO code, defaults to "BR"
 *   }
 *
 * Returns:
 *   { success: true, url, account_id, status }
 */

const Stripe = require('stripe');
const { verifyJWT } = require('../../_lib/auth');
const { supabaseAdmin } = require('../../_lib/supabase');
const { createSecureLogger } = require('../../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../../_lib/rate-limit');

const logger = createSecureLogger('stripe-connect-onboarding');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const CLIENT_URL = process.env.CLIENT_URL || 'https://seatable.one';

const stripe = STRIPE_SECRET_KEY ? Stripe(STRIPE_SECRET_KEY) : null;

const DEFAULT_RETURN_URL = `${CLIENT_URL}/host-dashboard/voice-settings?stripe_connect=ok`;
const DEFAULT_REFRESH_URL = `${CLIENT_URL}/host-dashboard/voice-settings?stripe_connect=refresh`;

module.exports = async (req, res) => {
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!stripe) {
    logger.error('STRIPE_SECRET_KEY not configured');
    return res.status(503).json({
      success: false,
      error: 'Stripe integration not configured.',
    });
  }

  // Auth
  let user;
  try {
    user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('No restaurant_id in token');
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const restaurantId = user.restaurant_id;
  const body = req.body || {};
  const returnUrl = body.return_url || DEFAULT_RETURN_URL;
  const refreshUrl = body.refresh_url || DEFAULT_REFRESH_URL;
  const country = (body.country || 'BR').toUpperCase();

  try {
    // 1. Find or create our row + Stripe Account
    const { data: existing, error: selErr } = await supabaseAdmin
      .schema('restaurant').from('stripe_connect_accounts')
      .select('id, stripe_account_id, status')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (selErr) {
      logger.error('Lookup failed', { error: selErr.message });
      return res.status(500).json({ success: false, error: 'db_error' });
    }

    let stripeAccountId;
    if (existing?.stripe_account_id) {
      stripeAccountId = existing.stripe_account_id;
      logger.info('Reusing existing connected account', { restaurantId });
    } else {
      // Create Standard Connect account. Stripe will derive most fields
      // during onboarding — we just stake the country + currency.
      const account = await stripe.accounts.create({
        type: 'standard',
        country,
        default_currency: country === 'BR' ? 'brl' : undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { restaurant_id: restaurantId },
      });
      stripeAccountId = account.id;
      logger.info('Created Stripe Standard account', { restaurantId, accountId: stripeAccountId });

      const { error: insErr } = await supabaseAdmin
        .schema('restaurant').from('stripe_connect_accounts')
        .insert({
          restaurant_id: restaurantId,
          stripe_account_id: stripeAccountId,
          status: 'pending',
          country: account.country || country,
          default_currency: account.default_currency || null,
          charges_enabled: !!account.charges_enabled,
          payouts_enabled: !!account.payouts_enabled,
          details_submitted: !!account.details_submitted,
        });
      if (insErr) {
        // If the row materialized between our SELECT and INSERT, fall
        // back to UPDATE-by-restaurant_id rather than failing.
        logger.warn('Insert race; falling back to update', { error: insErr.message });
        await supabaseAdmin
          .schema('restaurant').from('stripe_connect_accounts')
          .update({ stripe_account_id: stripeAccountId, status: 'pending' })
          .eq('restaurant_id', restaurantId);
      }
    }

    // 2. Always mint a fresh AccountLink — they're single-use + expire
    const link = await stripe.accountLinks.create({
      account: stripeAccountId,
      return_url: returnUrl,
      refresh_url: refreshUrl,
      type: 'account_onboarding',
      collect: 'eventually_due',
    });

    return res.json({
      success: true,
      url: link.url,
      account_id: stripeAccountId,
      status: existing?.status || 'pending',
    });
  } catch (err) {
    logger.error('Onboarding error', { error: err.message, type: err.type });
    return res.status(500).json({
      success: false,
      error: err.type === 'StripeInvalidRequestError' ? err.message : 'server_error',
    });
  }
};
