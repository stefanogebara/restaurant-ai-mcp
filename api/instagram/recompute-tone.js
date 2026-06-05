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
const { fetchProfile } = require('./_lib/fetch-profile');
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

  // 1. Look up the active connection (incl. cached bio for the case where
  // the profile refetch in step 2 fails — we still want to feed SOMETHING
  // to the extractor rather than degrading to captions-only).
  const { data: conn, error: connErr } = await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .select('id, ig_business_account_id, access_token, status, biography')
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

  // 2a. Refresh profile fields (bio, website, name, followers, picture)
  // first. They might have changed since the last sync, and the bio is
  // the most concentrated voice signal we feed to the extractor.
  // Non-fatal if it fails — we fall back to the cached bio on the row.
  let profile = null;
  try {
    profile = await fetchProfile({
      igBusinessAccountId: conn.ig_business_account_id,
      accessToken: conn.access_token,
    });
  } catch (err) {
    if (err instanceof TokenInvalidError) {
      await supabaseAdmin
        .schema('restaurant')
        .from('instagram_connections')
        .update({ status: 'expired', last_error: err.message, updated_at: new Date().toISOString() })
        .eq('id', conn.id);
      logger.warn('IG token invalid on profile fetch — marked expired', { restaurantId: user.restaurant_id });
      return res.status(401).json({ ok: false, error: 'Instagram token expired. Reconnect required.' });
    }
    // Non-token failure: log + carry on with cached values from `conn`.
    logger.warn('profile refresh failed — proceeding with cached bio', { err: err.message });
  }

  // 2b. Fetch recent posts
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
  const bio = profile?.biography || conn.biography || null;

  // 3. Run the LLM extractor
  let toneProfile;
  try {
    toneProfile = await extractToneProfile(captions, bio);
  } catch (err) {
    logger.error('tone extraction failed', { err: err.message });
    return res.status(500).json({ ok: false, error: 'Tone extraction failed' });
  }

  if (!toneProfile) {
    return res.status(422).json({
      ok: false,
      error: (captions.length < 3 && !bio)
        ? 'Not enough captioned posts to compute a tone profile yet. Post a few more and try again.'
        : 'Could not extract a valid tone profile from your recent captions.',
    });
  }

  // 4a. Persist tone profile to restaurant_config (consumed by drafter)
  const { error: updErr } = await supabaseAdmin
    .schema('restaurant')
    .from('restaurant_config')
    .update({ instagram_tone_profile: toneProfile, updated_at: new Date().toISOString() })
    .eq('id', user.restaurant_id);

  if (updErr) {
    logger.error('profile persist failed', { err: updErr.message });
    return res.status(500).json({ ok: false, error: 'Could not save tone profile' });
  }

  // 4b. Refresh the cached profile fields on the connection row (bio,
  // website, name, followers, picture) so the status endpoint + the
  // drafter both see current values without another Graph call.
  const connUpdate = {
    last_sync_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  // Only overwrite cached profile fields when the live fetch succeeded.
  // If profile is null (Graph hiccup), keep whatever we had cached.
  if (profile) {
    connUpdate.biography = profile.biography || null;
    connUpdate.website = profile.website || null;
    connUpdate.display_name = profile.name || null;
    connUpdate.ig_username = profile.username || conn.ig_username;
    connUpdate.ig_profile_picture_url = profile.profile_picture_url || null;
    if (typeof profile.followers_count === 'number') {
      connUpdate.ig_followers_count = profile.followers_count;
    }
  }

  await supabaseAdmin
    .schema('restaurant')
    .from('instagram_connections')
    .update(connUpdate)
    .eq('id', conn.id);

  logger.info('tone profile recomputed', { restaurantId: user.restaurant_id, postCount: captions.length, language: toneProfile.language });
  return res.status(200).json({ ok: true, profile: toneProfile });
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '4kb' } },
};
