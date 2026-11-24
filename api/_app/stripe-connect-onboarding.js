/** Owner-only creation and renewal of hosted Stripe Connect onboarding links. */
const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { integrationReturnUrl } = require('./_lib/integration-redirects');
const { resolveCountryIso } = require('./_lib/country-locale');
const { connectAccounts, connectStripe, connectAccountState } = require('./_lib/stripe-connect-account');

const logger = createSecureLogger('stripe-connect-onboarding');

async function readAccount(restaurantId) {
  const { data, error } = await connectAccounts()
    .select('stripe_account_id, status')
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function startAccount(stripe, restaurantId, country, previous) {
  const previousId = previous?.stripe_account_id;
  const account = await stripe.accounts.create({
    country,
    controller: {
      stripe_dashboard: { type: 'full' },
      requirement_collection: 'stripe',
      fees: { payer: 'account' },
      losses: { payments: 'stripe' },
    },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { restaurant_id: restaurantId },
  }, { idempotencyKey: `connect-onboarding:${restaurantId}:${country}:${previousId || 'first'}` });

  const values = {
    restaurant_id: restaurantId,
    stripe_account_id: account.id,
    country: account.country,
    ...connectAccountState(account),
  };
  if (previousId) {
    // Only replace the specific revoked account. A retry must never overwrite a new binding.
    const { data, error } = await connectAccounts()
      .update(values)
      .eq('restaurant_id', restaurantId)
      .eq('stripe_account_id', previousId)
      .eq('status', 'revoked')
      .select('stripe_account_id, status')
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  } else {
    const { error } = await connectAccounts().insert(values);
    if (!error) return values;
    if (error.code !== '23505') throw error;
  }

  const winner = await readAccount(restaurantId);
  if (!winner || winner.status === 'revoked') throw new Error('Could not persist Stripe account binding');
  return winner;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'method_not_allowed' });
  if (await checkAndApplyRateLimit(req, res, 'api')) return;
  const user = await verifyJWT(req.headers.authorization?.replace(/^Bearer /, ''));
  if (!user?.restaurant_id) return res.status(401).json({ success: false, error: 'unauthorized' });
  if (user.role !== 'owner') return res.status(403).json({ success: false, error: 'owner_required' });

  const stripe = connectStripe();
  if (!stripe) return res.status(503).json({ success: false, error: 'stripe_unavailable' });
  const restaurantId = user.restaurant_id;

  try {
    let account = await readAccount(restaurantId);
    if (!account || account.status === 'revoked') {
      const { data: restaurant, error } = await supabaseAdmin.schema('restaurant').from('restaurant_config')
        .select('country').eq('id', restaurantId).eq('user_id', user.sub).maybeSingle();
      if (error) throw error;
      const country = resolveCountryIso(restaurant?.country);
      if (!country) return res.status(422).json({ success: false, error: 'country_required' });
      account = await startAccount(stripe, restaurantId, country, account);
    }

    const origin = process.env.CLIENT_URL || 'https://seatable.one';
    const link = await stripe.accountLinks.create({
      account: account.stripe_account_id,
      return_url: integrationReturnUrl(origin, 'payments', 'stripe_connect', 'ok'),
      refresh_url: integrationReturnUrl(origin, 'payments', 'stripe_connect', 'refresh'),
      type: 'account_onboarding',
      collection_options: { fields: 'currently_due' },
    });
    return res.json({ success: true, url: link.url, account_id: account.stripe_account_id, status: account.status });
  } catch (error) {
    logger.error('Could not create Connect onboarding link', { code: error.code, type: error.type, message: error.message });
    return res.status(503).json({ success: false, error: 'stripe_unavailable' });
  }
};
