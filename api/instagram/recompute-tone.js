/**
 * POST /api/instagram/recompute-tone
 *
 * On-demand "refresh my tone profile" — pulls the last 30 IG posts via
 * Graph API, runs them through the tone extractor, writes the result to
 * restaurant.restaurant_config.instagram_tone_profile.
 *
 * Triggered by:
 *   - The "Refresh" button in InstagramPanel (after first connect, on
 *     significant new posts)
 *   - The weekly cron in api/cron/refresh-instagram-tones.js (not yet
 *     shipped — v2)
 *
 * Returns { ok: true, profile } so the UI can render the new state without
 * a second round-trip to /api/instagram/status.
 *
 * Cost: ~$0.001 per call (Haiku + 30 captions). Rate-limited 5/hour/user
 * to prevent a UI bug or curious user from running it in a loop.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { verifyJWT } = require('../_lib/auth');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { fetchRecentMedia, TokenInvalidError } = require('./_lib/fetch-recent-media');
const { extractToneProfile } = require('./_lib/extract-tone-profile');

const logger = createSecureLogger('instagram-recompute-tone');

module.exports = async (req, res) => {
  if (handlePreflight(req, res)) return;
  setInternalCors(req, res);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
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
    key: `instagram-recompute-tone:${user.id}`,
    limit: 5,
    windowSeconds: 60 * 60,
  });
  if (limited) return;

  // 1. Look up the active connection
  const { data: conn, error: connErr } = await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .select('id, ig_business_account_id, access_token, status')
    .eq('restaurant_id', user.restaurant_id)
    .eq('status', 'active')
    .maybeSingle();

  if (connErr) {
    logger.error('connection lookup failed', { err: connErr.message });
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
  if (!conn) {
    return res.status(404).json({ ok: false, error: 'No active Instagram connection. Connect first.' });
  }

  // 2. Fetch recent posts
  let media;
  try {
    media = await fetchRecentMedia({
      igBusinessAccountId: conn.ig_business_account_id,
      accessToken: conn.access_token,
      limit: 30,
    });
  } catch (err) {
    if (err instanceof TokenInvalidError) {
      // Mark the connection expired so the UI prompts a reconnect rather
      // than retrying indefinitely.
      await supabaseAdmin
        .schema('restaurant')
        .from('instagram_connections')
        .update({ status: 'expired', last_error: err.message, updated_at: new Date().toISOString() })
        .eq('id', conn.id);
      logger.warn('IG token invalid — marked expired', { restaurantId: user.restaurant_id });
      return res.status(401).json({ ok: false, error: 'Instagram token expired. Reconnect required.' });
    }
    // Other Graph API failures: log + bubble to user with the upstream message.
    await supabaseAdmin
      .schema('restaurant')
      .from('instagram_connections')
      .update({ last_error: String(err.message).slice(0, 500), updated_at: new Date().toISOString() })
      .eq('id', conn.id);
    logger.error('media fetch failed', { err: err.message });
    return res.status(502).json({ ok: false, error: `Instagram API: ${err.message}` });
  }

  const captions = media.map((m) => m.caption).filter(Boolean);

  // 3. Run the LLM extractor
  let profile;
  try {
    profile = await extractToneProfile(captions);
  } catch (err) {
    logger.error('tone extraction failed', { err: err.message });
    return res.status(500).json({ ok: false, error: 'Tone extraction failed' });
  }

  if (!profile) {
    return res.status(422).json({
      ok: false,
      error: captions.length < 3
        ? 'Not enough captioned posts to compute a tone profile yet. Post a few more and try again.'
        : 'Could not extract a valid tone profile from your recent captions.',
    });
  }

  // 4. Persist + bump last_sync_at on the connection
  const { error: updErr } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({ instagram_tone_profile: profile, updated_at: new Date().toISOString() })
    .eq('id', user.restaurant_id);

  if (updErr) {
    logger.error('profile persist failed', { err: updErr.message });
    return res.status(500).json({ ok: false, error: 'Could not save tone profile' });
  }

  await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .update({
      last_sync_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conn.id);

  logger.info('tone profile recomputed', { restaurantId: user.restaurant_id, postCount: captions.length });
  return res.status(200).json({ ok: true, profile });
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '4kb' } },
};
