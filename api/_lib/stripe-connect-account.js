const Stripe = require('stripe');
const { supabaseAdmin } = require('./supabase');

const ACCOUNT_FIELDS = 'stripe_account_id, status, charges_enabled, payouts_enabled, details_submitted, default_currency, country';
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

module.exports = { ACCOUNT_FIELDS, connectStripe, connectAccounts, connectAccountState };
