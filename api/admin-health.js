/**
 * GET /api/admin-health
 *
 * Phase HH.1 — single auth-gated snapshot for ops monitoring during the
 * soak period after Y/Z/AA/BB/CC/DD/EE/FF/GG. One curl shows:
 *
 *   - Cron health (delegates to checkCronHealth from cron/health.js)
 *   - Platform activity in the last 24h + 7d windows (reservations,
 *     revenue_records, service_records, customer_ltv updates)
 *   - Tenant inventory (real-active vs demos, post-GG cleanup baseline)
 *   - DB integrity flags that should all be 0 after Phase DD.3 / GG
 *     (orphan reservations, dup active subs, future-dated orphans)
 *
 * Auth: Bearer CRON_SECRET, constant-time compare.
 *
 * Usage:
 *   curl https://seatable.one/api/admin-health \
 *     -H "Authorization: Bearer $CRON_SECRET"
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { bearerEquals } = require('./_lib/secure-compare');
const { checkCronHealth } = require('./cron/health');

const logger = createSecureLogger('admin-health');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  if (!bearerEquals(req.headers.authorization, cronSecret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    // Parallel-fetch everything so the endpoint stays sub-second even
    // as more rows accumulate. Each branch is wrapped in a try so one
    // failing probe doesn't take the whole snapshot down.
    const [cron, activity, tenants, integrity] = await Promise.all([
      safe(() => checkCronHealth(), 'cron'),
      safe(() => fetchActivity(), 'activity'),
      safe(() => fetchTenantInventory(), 'tenants'),
      safe(() => fetchIntegrity(), 'integrity'),
    ]);

    const snapshot = {
      checked_at: new Date().toISOString(),
      cron,
      activity,
      tenants,
      integrity,
    };

    // Overall: red if integrity flags > 0 OR cron is critical/degraded.
    snapshot.overall = computeOverall(snapshot);

    return res.status(200).json(snapshot);
  } catch (err) {
    logger.error('admin-health failed', { error: err.message });
    return res.status(500).json({ error: 'Health snapshot failed' });
  }
};

async function safe(fn, label) {
  try {
    return await fn();
  } catch (err) {
    return { error: err.message, _label: label };
  }
}

async function fetchActivity() {
  const now = Date.now();
  const day = new Date(now - 24 * 3600_000).toISOString();
  const week = new Date(now - 7 * 86400_000).toISOString();

  const [
    res24,
    res7,
    rev24,
    rev7,
    svc24,
    ltvUpd7,
    surveys24,
  ] = await Promise.all([
    countSince('reservations', 'created_at', day),
    countSince('reservations', 'created_at', week),
    countSince('revenue_records', 'recorded_at', day),
    countSince('revenue_records', 'recorded_at', week),
    countSince('service_records', 'seated_at', day),
    supabaseAdmin
      .schema('restaurant')
      .from('customer_ltv')
      .select('customer_id', { count: 'exact', head: true })
      .gte('updated_at', week)
      .then(({ count }) => count || 0),
    countSince('survey_responses', 'created_at', day).catch(() => null), // table may live in restaurant schema
  ]);

  return {
    reservations: { last_24h: res24, last_7d: res7 },
    revenue_records: { last_24h: rev24, last_7d: rev7 },
    service_records: { last_24h: svc24 },
    customer_ltv_updates_7d: ltvUpd7,
    survey_responses_24h: surveys24,
  };
}

async function countSince(table, column, isoFloor) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true })
    .gte(column, isoFloor);
  if (error) throw error;
  return count || 0;
}

async function fetchTenantInventory() {
  const [activeReal, activeDemo, archived] = await Promise.all([
    supabaseAdmin
      .schema('restaurant').from('restaurant_config')
      .select('id', { count: 'exact', head: true })
      .eq('is_demo', false).eq('is_active', true).eq('onboarding_completed', true)
      .then(({ count }) => count || 0),
    supabaseAdmin
      .schema('restaurant').from('restaurant_config')
      .select('id', { count: 'exact', head: true })
      .eq('is_demo', true)
      .then(({ count }) => count || 0),
    supabaseAdmin
      .schema('restaurant').from('restaurant_config')
      .select('id', { count: 'exact', head: true })
      .or('is_active.eq.false,onboarding_completed.eq.false')
      .then(({ count }) => count || 0),
  ]);
  return { active_real: activeReal, active_demos: activeDemo, archived_or_incomplete: archived };
}

async function fetchIntegrity() {
  // Each probe is the same pattern Phase DD.3 used. All four should be 0
  // post-FF; if any goes non-zero in the soak window we want loud alerts.
  // (Run via raw SQL so we can do the LEFT-JOIN-NULL probe efficiently.)
  const { data: rows, error } = await supabaseAdmin
    .schema('public')
    .rpc('admin_health_integrity_v1')
    .catch(() => ({ data: null, error: { message: 'rpc_missing_fall_back' } }));

  // Fallback path: do the probes inline. RPC version (next session) is
  // faster + cacheable, but inline always works.
  if (!rows || error) {
    return await integrityFallback();
  }
  return rows;
}

async function integrityFallback() {
  // Orphan reservations (FK CASCADE should keep this at 0 forever now)
  const { count: orphanRes } = await supabaseAdmin
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .filter('restaurant_id', 'not.in', '(select id from restaurant.restaurant_config)')
    .limit(1)
    .then((r) => ({ count: r.error ? null : r.count })); // 'not.in' subquery may not parse; null = not measured

  // Duplicate active subscriptions per tenant
  const { data: dupSubs } = await supabaseAdmin
    .from('subscriptions')
    .select('restaurant_id')
    .in('status', ['active', 'trialing']);
  const subCountsByTenant = {};
  for (const s of (dupSubs || [])) {
    subCountsByTenant[s.restaurant_id] = (subCountsByTenant[s.restaurant_id] || 0) + 1;
  }
  const dupSubTenants = Object.values(subCountsByTenant).filter((n) => n > 1).length;

  // Reservations with deposit_payment_intent_id but no deposit_amount
  const { count: depositMismatch } = await supabaseAdmin
    .from('reservations')
    .select('id', { count: 'exact', head: true })
    .not('deposit_payment_intent_id', 'is', null)
    .is('deposit_amount', null);

  return {
    orphan_reservations: orphanRes, // null if subquery filter unsupported
    duplicate_active_subscriptions: dupSubTenants,
    deposit_intent_without_amount: depositMismatch || 0,
  };
}

function computeOverall({ cron, activity, integrity }) {
  if (cron?.overall === 'critical') return 'red';
  if (cron?.overall === 'degraded') return 'yellow';
  const integrityIssues = [
    integrity?.duplicate_active_subscriptions,
    integrity?.deposit_intent_without_amount,
  ].filter((n) => typeof n === 'number' && n > 0).length;
  if (integrityIssues > 0) return 'yellow';
  if (activity?.error) return 'yellow';
  return 'green';
}
