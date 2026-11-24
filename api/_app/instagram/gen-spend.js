/**
 * GET /api/instagram/gen-spend
 *
 * Returns this restaurant's AI generation spend for the current
 * calendar month + an all-time tally + the 10 most recent events.
 * Used by the small spend pill in the drafter (C.22) so restaurant
 * owners see what they're burning before it shows up on a bill.
 *
 * Response:
 *   {
 *     ok: true,
 *     month: { total_cents, by_kind: { image, video }, gen_count },
 *     all_time: { total_cents, gen_count },
 *     recent: [{ kind, provider, model, cost_cents, asset_url, created_at }]
 *   }
 *
 * Numbers come straight from ai_generation_events — no estimation,
 * no rounding. cost_cents is the snapshot recorded at write time so
 * historical accuracy survives pricing changes.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');

const logger = createSecureLogger('instagram-gen-spend');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setInternalCors(req, res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  let user;
  try {
    user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('No restaurant_id in token');
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const limited = await checkAndApplyRateLimit(req, res, {
    key: `instagram-gen-spend:${user.id}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (limited) return;

  // First of the current month (local server time — fine for a spend
  // pill; if a restaurant wants to argue about timezone boundaries we
  // can switch to their restaurant_config.timezone later).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Pull all events for this restaurant since month start. For a
  // typical restaurant this is <100 rows even at heavy use — we sum
  // in-process rather than via an RPC to keep the surface area small.
  const { data: monthEvents, error: monthErr } = await supabaseAdmin
    .schema('restaurant')
    .from('ai_generation_events')
    .select('kind, cost_cents')
    .eq('restaurant_id', user.restaurant_id)
    .gte('created_at', monthStart);

  if (monthErr) {
    logger.error('month query failed', { err: monthErr.message });
    return res.status(500).json({ ok: false, error: 'Database error' });
  }

  // All-time tallies via a count() aggregate would need RPC; we just
  // sum a separate select with no date filter. Same trade-off as month.
  const { data: allEvents, error: allErr } = await supabaseAdmin
    .schema('restaurant')
    .from('ai_generation_events')
    .select('cost_cents')
    .eq('restaurant_id', user.restaurant_id);

  if (allErr) {
    logger.error('all-time query failed', { err: allErr.message });
    return res.status(500).json({ ok: false, error: 'Database error' });
  }

  const { data: recent, error: recentErr } = await supabaseAdmin
    .schema('restaurant')
    .from('ai_generation_events')
    .select('kind, provider, model, cost_cents, asset_url, created_at')
    .eq('restaurant_id', user.restaurant_id)
    .order('created_at', { ascending: false })
    .limit(10);

  if (recentErr) {
    logger.error('recent query failed', { err: recentErr.message });
    return res.status(500).json({ ok: false, error: 'Database error' });
  }

  const monthByKind = { image: 0, video: 0 };
  let monthTotal = 0;
  for (const e of monthEvents || []) {
    const c = Number(e.cost_cents) || 0;
    monthTotal += c;
    if (e.kind === 'image' || e.kind === 'video') monthByKind[e.kind] += c;
  }
  const allTotal = (allEvents || []).reduce((s, e) => s + (Number(e.cost_cents) || 0), 0);

  return res.status(200).json({
    ok: true,
    month: {
      total_cents: monthTotal,
      by_kind: monthByKind,
      gen_count: (monthEvents || []).length,
    },
    all_time: {
      total_cents: allTotal,
      gen_count: (allEvents || []).length,
    },
    recent: recent || [],
  });
};
