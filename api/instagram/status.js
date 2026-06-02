/**
 * GET /api/instagram/status
 *
 * Tells the dashboard whether the user has a healthy Instagram connection
 * and gives back the IG handle / picture / follower count for display so we
 * don't have to round-trip to Meta on every page paint.
 *
 * Response shape:
 *   {
 *     success: true,
 *     connected: boolean,
 *     status: 'active' | 'expired' | 'revoked' | 'restricted' | null,
 *     username: string | null,
 *     profile_picture_url: string | null,
 *     followers_count: number | null,
 *     last_sync_at: string | null,
 *     last_error: string | null,
 *     token_expires_at: string | null,
 *     tone_profile_ready: boolean,  // true once C2 has populated restaurant_config.instagram_tone_profile
 *   }
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');

const logger = createSecureLogger('instagram-status');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setInternalCors(req, res);

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let user;
  try {
    user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    if (!user?.restaurant_id) throw new Error('No restaurant_id in token');
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    // The partial-unique index on instagram_connections(restaurant_id) WHERE
    // status IN ('active','restricted') guarantees ≤1 such row, so the
    // chained .order().limit().maybeSingle() the v1 code used was both
    // redundant AND was failing in supabase-js 2.x when combined with .in()
    // (the combination produced "Cannot coerce the result to a single JSON
    // object" because PostgREST returned 2 rows when 'expired' was also
    // included). Splitting the lookups + dropping the order/limit fixes it.
    const { data: active, error: activeErr } = await supabaseAdmin
      .schema('restaurant')
      .from('instagram_connections')
      .select('status, ig_username, ig_profile_picture_url, ig_followers_count, last_sync_at, last_error, token_expires_at')
      .eq('restaurant_id', user.restaurant_id)
      .in('status', ['active', 'restricted'])
      .maybeSingle();

    if (activeErr) {
      logger.error('active connection query failed', { err: activeErr.message });
      return res.status(500).json({ success: false, error: 'Status query failed' });
    }

    // If no active/restricted row exists, look up the latest expired/revoked
    // one so the UI can still surface "your IG connection expired — reconnect".
    let conn = active;
    if (!conn) {
      const { data: stale } = await supabaseAdmin
        .schema('restaurant')
        .from('instagram_connections')
        .select('status, ig_username, ig_profile_picture_url, ig_followers_count, last_sync_at, last_error, token_expires_at, updated_at')
        .eq('restaurant_id', user.restaurant_id)
        .order('updated_at', { ascending: false })
        .limit(1);
      conn = Array.isArray(stale) && stale.length ? stale[0] : null;
    }

    const { data: rest } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('instagram_tone_profile')
      .eq('id', user.restaurant_id)
      .maybeSingle();

    if (!conn) {
      return res.json({
        success: true,
        connected: false,
        status: null,
        username: null,
        profile_picture_url: null,
        followers_count: null,
        last_sync_at: null,
        last_error: null,
        token_expires_at: null,
        tone_profile_ready: false,
      });
    }

    return res.json({
      success: true,
      connected: conn.status === 'active',
      status: conn.status,
      username: conn.ig_username,
      profile_picture_url: conn.ig_profile_picture_url,
      followers_count: conn.ig_followers_count,
      last_sync_at: conn.last_sync_at,
      last_error: conn.last_error,
      token_expires_at: conn.token_expires_at,
      tone_profile_ready: !!rest?.instagram_tone_profile,
    });
  } catch (err) {
    logger.error('status handler failed', { err: err.message });
    return res.status(500).json({ success: false, error: 'Status check failed' });
  }
};
