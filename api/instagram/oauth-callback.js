/**
 * GET /api/instagram/oauth-callback
 *
 * Meta redirects the user here after they authorize the app. We:
 *   1. Verify the state param (base64url(restaurant_id:nonce))
 *   2. Exchange the auth code for a SHORT-lived user access token
 *   3. Exchange the short-lived token for a LONG-lived one (60 days)
 *   4. List the user's FB Pages → find the one with an Instagram Business
 *      Account attached
 *   5. Fetch IG profile metadata (username, profile picture, follower count)
 *   6. Upsert into restaurant.instagram_connections
 *   7. Redirect the user back to the dashboard with ?instagram_connect=ok|err
 *
 * On any failure we redirect with a specific reason so the dashboard UI
 * can surface "no IG account on any of your Pages" vs "Meta returned an
 * error" instead of a single generic "something broke".
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');

const logger = createSecureLogger('instagram-oauth-callback');

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || 'https://seatable.one';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

function redirectWithStatus(res, reason) {
  const dest = `${CLIENT_URL}/host-dashboard/voice-settings?instagram_connect=${encodeURIComponent(reason)}#tab=instagram`;
  res.setHeader('Location', dest);
  return res.status(302).end();
}

module.exports = async (req, res) => {
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  if (!META_APP_ID || !META_APP_SECRET) {
    logger.error('Meta app credentials missing');
    return redirectWithStatus(res, 'not_configured');
  }

  const { code, state, error: oauthErr } = req.query;
  if (oauthErr) {
    logger.warn('Meta returned OAuth error', { error: oauthErr });
    return redirectWithStatus(res, 'denied');
  }
  if (!code || !state) {
    return redirectWithStatus(res, 'missing_params');
  }

  // 1. Decode + validate state
  let restaurantId;
  try {
    const decoded = Buffer.from(String(state), 'base64url').toString('utf-8');
    const [rid, nonce] = decoded.split(':');
    if (!rid || !nonce || nonce.length < 8) throw new Error('malformed state');
    restaurantId = rid;
  } catch (err) {
    logger.warn('Invalid state param', { err: err.message });
    return redirectWithStatus(res, 'invalid_state');
  }

  try {
    // 2. Exchange code → short-lived user access token
    const redirectUri = `${CLIENT_URL}/api/instagram/oauth-callback`;
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', META_APP_ID);
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', String(code));

    const shortResp = await fetch(tokenUrl.toString());
    const shortBody = await shortResp.json();
    if (!shortResp.ok || !shortBody.access_token) {
      logger.error('Short-lived token exchange failed', { status: shortResp.status, body: shortBody?.error });
      return redirectWithStatus(res, 'token_exchange_failed');
    }
    const shortToken = shortBody.access_token;

    // 3. Exchange short-lived → long-lived token (60 days)
    const longUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', META_APP_ID);
    longUrl.searchParams.set('client_secret', META_APP_SECRET);
    longUrl.searchParams.set('fb_exchange_token', shortToken);

    const longResp = await fetch(longUrl.toString());
    const longBody = await longResp.json();
    if (!longResp.ok || !longBody.access_token) {
      logger.error('Long-lived token exchange failed', { status: longResp.status });
      return redirectWithStatus(res, 'long_token_exchange_failed');
    }
    const longToken = longBody.access_token;
    const expiresInSec = Number(longBody.expires_in) || 60 * 24 * 60 * 60;
    const tokenExpiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

    // 4. List FB Pages, find one with an IG Business Account attached
    const pagesResp = await fetch(
      `${GRAPH_BASE}/me/accounts?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(longToken)}`,
    );
    const pagesBody = await pagesResp.json();
    if (!pagesResp.ok) {
      logger.error('me/accounts fetch failed', { status: pagesResp.status });
      return redirectWithStatus(res, 'pages_fetch_failed');
    }
    const pages = Array.isArray(pagesBody.data) ? pagesBody.data : [];
    const pageWithIg = pages.find((p) => p.instagram_business_account?.id);
    if (!pageWithIg) {
      logger.info('No FB Page with Instagram Business Account found', { restaurantId, pageCount: pages.length });
      return redirectWithStatus(res, 'no_ig_account');
    }

    // 5. Fetch IG profile metadata
    const igId = pageWithIg.instagram_business_account.id;
    const igResp = await fetch(
      `${GRAPH_BASE}/${igId}?fields=id,username,profile_picture_url,followers_count&access_token=${encodeURIComponent(longToken)}`,
    );
    const igBody = await igResp.json();
    if (!igResp.ok) {
      logger.warn('ig profile fetch failed (non-fatal — will retry on first sync)', {
        status: igResp.status,
      });
    }

    // 6. Upsert into instagram_connections. If a previous active/restricted
    // connection exists for this restaurant we update it; otherwise insert.
    const { data: existing } = await supabaseAdmin
      .schema('restaurant')
      .from('instagram_connections')
      .select('id, status')
      .eq('restaurant_id', restaurantId)
      .in('status', ['active', 'restricted', 'expired'])
      .maybeSingle();

    const row = {
      restaurant_id: restaurantId,
      fb_page_id: pageWithIg.id,
      fb_page_name: pageWithIg.name || null,
      ig_business_account_id: igId,
      ig_username: igBody?.username || null,
      ig_profile_picture_url: igBody?.profile_picture_url || null,
      ig_followers_count: typeof igBody?.followers_count === 'number' ? igBody.followers_count : null,
      access_token: longToken,
      token_expires_at: tokenExpiresAt,
      status: 'active',
      last_sync_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabaseAdmin
        .schema('restaurant')
        .from('instagram_connections')
        .update(row)
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .schema('restaurant')
        .from('instagram_connections')
        .insert(row);
      if (error) throw error;
    }

    logger.info('Instagram connected', { restaurantId, igUsername: igBody?.username });
    return redirectWithStatus(res, 'ok');
  } catch (err) {
    logger.error('Instagram OAuth callback failed', { err: err.message });
    return redirectWithStatus(res, 'server_error');
  }
};
