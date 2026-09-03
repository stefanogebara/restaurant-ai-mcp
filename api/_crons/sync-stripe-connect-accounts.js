/**
 * Daily reconcile of restaurant.stripe_connect_accounts against Stripe.
 *
 * The Connect webhook (api/stripe-connect-webhook.js) is the primary path
 * for keeping these rows fresh — it fires on account.updated and friends
 * within seconds of any change. This cron is *defence in depth* for the
 * cases where the webhook is silently dropped:
 *   - Stripe delivery fails (we 5xx, then they give up after ~3 days)
 *   - Our handler 5xx'd and the retry window expired
 *   - The webhook endpoint was rotated mid-flight (we just rotated once
 *     this week — exactly the failure mode this cron catches)
 *
 * Schedule: daily 04:30 UTC (off-peak; well below the every-15min floor
 * in CLAUDE.md). One Stripe.accounts.retrieve call per non-revoked row.
 *
 * Auth: CRON_SECRET Bearer (matches all other crons in this project).
 *
 * Side effects: only writes when a field changed; emits one structured
 * log per drift so we can alarm on "drifts went up suddenly" later.
 */

const Stripe = require('stripe');
const { supabaseAdmin } = require('../_lib/supabase');
const { logCronRun } = require('../_lib/cron-tracker');
const { isCronEnabled } = require('../_lib/cron-config');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('CronSyncStripeConnect');

let stripe;
function getStripe() {
  if (!stripe) stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

/**
 * Mirror api/stripe-connect-webhook.js computeStatus() so any drift uses
 * the same status mapping the webhook would have produced.
 */
function computeStatus(acct) {
  if (acct.charges_enabled && acct.details_submitted) return 'active';
  if (acct.details_submitted) return 'restricted';
  return 'pending';
}

module.exports = async (req, res) => {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!cronSecret || authHeader !== cronSecret) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!(await isCronEnabled('sync-stripe-connect-accounts'))) {
    logger.warn('sync-stripe-connect-accounts disabled by ops, skipping run');
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    logger.error('STRIPE_SECRET_KEY not configured — cannot run');
    return res.status(503).json({ error: 'stripe_not_configured' });
  }

  const startedAt = Date.now();

  try {
    // Revoked rows can't flip back — Stripe doesn't restore deauthorized
    // accounts. Skipping them shaves one API call per dead connection.
    const { data: rows, error: selErr } = await supabaseAdmin
      .schema('restaurant')
      .from('stripe_connect_accounts')
      .select('id, restaurant_id, stripe_account_id, status, charges_enabled, payouts_enabled, details_submitted, default_currency')
      .neq('status', 'revoked');

    if (selErr) {
      logger.error('Row fetch failed', { error: selErr.message });
      await logCronRun('sync-stripe-connect-accounts', { ok: false, error: selErr.message });
      return res.status(500).json({ error: 'db_error' });
    }

    let checked = 0;
    let drifted = 0;
    let updated = 0;
    let errors = 0;
    const driftDetails = [];

    for (const row of rows || []) {
      checked++;
      let acct;
      try {
        acct = await getStripe().accounts.retrieve(row.stripe_account_id);
      } catch (err) {
        errors++;
        logger.warn('accounts.retrieve failed', {
          stripe_account_id: row.stripe_account_id,
          restaurant_id: row.restaurant_id,
          error: err.message,
        });
        continue;
      }

      const remoteStatus = computeStatus(acct);
      const remoteCurrency = acct.default_currency || null;
      const drift = {};
      if (!!acct.charges_enabled !== !!row.charges_enabled) {
        drift.charges_enabled = { local: !!row.charges_enabled, remote: !!acct.charges_enabled };
      }
      if (!!acct.payouts_enabled !== !!row.payouts_enabled) {
        drift.payouts_enabled = { local: !!row.payouts_enabled, remote: !!acct.payouts_enabled };
      }
      if (!!acct.details_submitted !== !!row.details_submitted) {
        drift.details_submitted = { local: !!row.details_submitted, remote: !!acct.details_submitted };
      }
      if (remoteStatus !== row.status) {
        drift.status = { local: row.status, remote: remoteStatus };
      }
      if (remoteCurrency !== row.default_currency) {
        drift.default_currency = { local: row.default_currency, remote: remoteCurrency };
      }

      if (Object.keys(drift).length === 0) continue;

      drifted++;
      driftDetails.push({
        stripe_account_id: row.stripe_account_id,
        restaurant_id: row.restaurant_id,
        drift,
      });
      logger.info('Connect account drift detected', {
        metric: 'connect_account_drift',
        stripe_account_id: row.stripe_account_id,
        restaurant_id: row.restaurant_id,
        drift,
      });

      const { error: updErr } = await supabaseAdmin
        .schema('restaurant')
        .from('stripe_connect_accounts')
        .update({
          charges_enabled: !!acct.charges_enabled,
          payouts_enabled: !!acct.payouts_enabled,
          details_submitted: !!acct.details_submitted,
          status: remoteStatus,
          default_currency: remoteCurrency,
        })
        .eq('id', row.id);

      if (updErr) {
        errors++;
        logger.error('Drift update failed', {
          stripe_account_id: row.stripe_account_id,
          error: updErr.message,
        });
        continue;
      }
      updated++;
    }

    const duration_ms = Date.now() - startedAt;
    logger.info('Sync complete', { checked, drifted, updated, errors, duration_ms });
    await logCronRun('sync-stripe-connect-accounts', {
      checked, drifted, updated, errors, duration_ms,
    });

    return res.status(200).json({
      success: true,
      checked,
      drifted,
      updated,
      errors,
      duration_ms,
      // First few drift entries help on-call check what changed without
      // re-running the cron. Full audit trail goes to logger.info above.
      drift_sample: driftDetails.slice(0, 10),
    });
  } catch (err) {
    logger.error('Sync cron failed', { error: err.message });
    await logCronRun('sync-stripe-connect-accounts', { ok: false, error: err.message });
    return res.status(500).json({ error: 'sync_failed' });
  }
};
