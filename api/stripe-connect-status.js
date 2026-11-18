/** Read the Connect mirror, or refresh it from Stripe on an owner's request. */
const { verifyJWT } = require('./_lib/auth');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { ACCOUNT_FIELDS, connectAccounts, connectAccountState, connectStripe } = require('./_lib/stripe-connect-account');

const logger = createSecureLogger('stripe-connect-status');

async function readAccount(restaurantId) {
  const { data, error } = await connectAccounts()
    .select(ACCOUNT_FIELDS).eq('restaurant_id', restaurantId).maybeSingle();
  if (error) throw error;
  return data;
}

module.exports = async (req, res) => {
  const refresh = req.method === 'POST';
  if (!refresh && req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const user = await verifyJWT(req.headers.authorization?.replace(/^Bearer /, '')).catch(() => null);
  if (!user?.restaurant_id) return res.status(401).json({ success: false, error: 'Unauthorized' });
  if (refresh && user.role !== 'owner') return res.status(403).json({ success: false, error: 'owner_required' });

  try {
    let row = await readAccount(user.restaurant_id);
    if (refresh && row && row.status !== 'revoked') {
      try {
        const stripe = connectStripe();
        if (!stripe) throw new Error('Stripe configuration unavailable');
        const account = await stripe.accounts.retrieve(row.stripe_account_id);
        const state = connectAccountState(account);
        if (Object.keys(state).some(key => state[key] !== row[key])) {
          const { data, error } = await connectAccounts().update(state)
            .eq('restaurant_id', user.restaurant_id)
            .eq('stripe_account_id', row.stripe_account_id)
            .neq('status', 'revoked')
            .select(ACCOUNT_FIELDS)
            .maybeSingle();
          if (error) throw error;
          row = data || await readAccount(user.restaurant_id);
        }
      } catch (error) {
        logger.warn('Could not refresh Connect status', { code: error.code, type: error.type });
        return res.status(503).json({ success: false, error: 'stripe_unavailable' });
      }
    }

    if (!row) return res.json({ success: true, connected: false });
    const { stripe_account_id, ...state } = row;
    return res.json({
      success: true,
      connected: true,
      account_id: stripe_account_id,
      ...state,
      charges_enabled: Boolean(row.charges_enabled),
      payouts_enabled: Boolean(row.payouts_enabled),
      details_submitted: Boolean(row.details_submitted),
    });
  } catch (error) {
    logger.error('Status lookup failed', { error: error.message });
    return res.status(500).json({ success: false, error: 'db_error' });
  }
};
