const Stripe = require('stripe');
const { supabaseAdmin } = require('./supabase');

const ACCOUNT_FIELDS = 'stripe_account_id, status, charges_enabled, payouts_enabled, details_submitted, default_currency, country';
const ACCOUNT_SYNC_FIELDS = ACCOUNT_FIELDS + ', updated_at';
let stripe;

function connectStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
  }
  return stripe;
}

function connectAccounts() {
  return supabaseAdmin.schema('restaurant').from('stripe_connect_accounts');
}

function connectAccountState(account) {
  const transfers = account.capabilities?.transfers;
  const ready = account.charges_enabled && (!transfers || transfers === 'active');
  const status = !account.details_submitted ? 'pending' : ready ? 'active' : 'restricted';
  return {
    status,
    charges_enabled: Boolean(account.charges_enabled),
    payouts_enabled: Boolean(account.payouts_enabled),
    details_submitted: Boolean(account.details_submitted),
    default_currency: account.default_currency || null,
  };
}

async function refreshConnectAccount(row) {
  const client = connectStripe();
  if (!client) throw new Error('Stripe configuration unavailable');
  const account = await client.accounts.retrieve(row.stripe_account_id);
  // Protect against a slower Stripe read overwriting a refresh that already saved.
  // The table's update trigger advances updated_at even if the account flags match.
  const { data, error } = await connectAccounts()
    .update(connectAccountState(account))
    .eq('stripe_account_id', row.stripe_account_id)
    .eq('updated_at', row.updated_at)
    .neq('status', 'revoked')
    .select(ACCOUNT_SYNC_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data;
}

module.exports = { ACCOUNT_SYNC_FIELDS, connectStripe, connectAccounts, connectAccountState, refreshConnectAccount };
