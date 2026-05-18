/**
 * POST /api/restaurant-learning/research
 *
 * Triggers restaurant intelligence gathering and creates an interview session.
 * Body: { restaurant_name, city, country, website? }
 * Response: { session_id, research_results, initial_ai_message }
 *
 * Requires authentication (verifyAuth pattern).
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { verifyAuth } = require('../_lib/auth');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { isUrlSafe } = require('../services/restaurantIntelligence');
const { startOrResumeInterview } = require('../services/learningInterview');
const crypto = require('crypto');

const logger = createSecureLogger('RestaurantResearch');

module.exports = async (req, res) => {
  // CORS headers
  const allowedOrigin = process.env.CLIENT_URL;
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting (chat tier - expensive AI operations)
  const blocked = await checkAndApplyRateLimit(req, res, 'chat');
  if (blocked) return;

  // Require authentication
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  if (!restaurantId) {
    return res.status(400).json({ error: 'No restaurant associated with this account' });
  }

  try {
    const { restaurant_name, city, country, website } = req.body;

    if (!restaurant_name || !city || !country) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['restaurant_name', 'city', 'country']
      });
    }

    // Type validation
    if (typeof restaurant_name !== 'string' || typeof city !== 'string' || typeof country !== 'string') {
      return res.status(400).json({ error: 'Invalid input types' });
    }

    // Input length validation
    if (restaurant_name.length > 200 || city.length > 100 || country.length > 100) {
      return res.status(400).json({ error: 'Input fields exceed maximum length' });
    }

    // SSRF protection: validate website URL if provided
    if (website) {
      if (typeof website !== 'string' || website.length > 2000 || !isUrlSafe(website)) {
        return res.status(400).json({ error: 'Invalid or disallowed website URL' });
      }
    }

    logger.info('Starting restaurant research:', { restaurant_name, city, country });

    // Update learning status (best-effort, doesn't block on failure).
    if (supabaseAdmin) {
      try {
        await supabaseAdmin
          .schema('restaurant')
          .from('restaurant_config')
          .update({ learning_status: 'scraping' })
          .eq('id', restaurantId);
      } catch (e) {
        logger.warn('learning_status=scraping update failed (non-fatal):', e?.message);
      }
    }

    // Intelligence gathering DEFERRED. The synchronous gather chained 3
    // parallel tiers (Google Places + website scrape + Custom Search) and
    // could chain to ~96s of wall time on a 60s Vercel lambda. Even a
    // fire-and-forget version crashed the lambda post-response because
    // Vercel kills detached promises on serverless. Backfill should be a
    // separate cron / on-demand /refresh-intelligence endpoint that the
    // dashboard can hit. The interview's 12 questions don't actually need
    // pre-gathered context — they ask the same things regardless.
    const intelligenceResults = {
      restaurant_name,
      google_places: null,
      website_extraction: null,
      search_results: null,
      summary: {
        rating: null, review_count: 0, price_level: null,
        cuisine_type: null, atmosphere: null, description: null,
        signature_dishes: [], address: null, website: null
      },
      tiers_completed: { google_places: false, website_extraction: false, google_search: false },
      gathered_at: new Date().toISOString(),
      _deferred: true
    };
    // NO fire-and-forget gather here. The previous attempt to defer it (d96bdc87)
    // still crashed the lambda with FUNCTION_INVOCATION_FAILED: Vercel kills the
    // serverless function once res.json() returns, and the detached promise gets
    // aborted mid-flight, raising an unhandled rejection that the runtime reports
    // as a function failure. Intelligence backfill should be a separate cron or
    // a /refresh-intelligence endpoint that the dashboard can hit on demand.

    // Update learning status (best-effort).
    if (supabaseAdmin) {
      try {
        await supabaseAdmin
          .schema('restaurant')
          .from('restaurant_config')
          .update({ learning_status: 'scraped' })
          .eq('id', restaurantId);
      } catch (e) {
        logger.warn('learning_status=scraped update failed (non-fatal):', e?.message);
      }
    }

    // Create interview session. Isolated try/catch so the actual Postgres
    // error (FK / RLS / permission) shows up in the response and Vercel logs
    // instead of being swallowed as a generic 500. Audit 2026-05-18 used this
    // surfacing to identify a missing GRANT on restaurant.learning_interviews;
    // the structured logger entry stays as a permanent diagnostic aid.
    const sessionId = crypto.randomUUID();
    let interviewState;
    try {
      interviewState = await startOrResumeInterview(
        sessionId,
        restaurantId,
        intelligenceResults
      );
    } catch (startErr) {
      logger.error('startOrResumeInterview threw', {
        message: startErr?.message,
        name: startErr?.name,
        code: startErr?.code,
        stack: startErr?.stack?.split('\n').slice(0, 5).join(' | '),
      });
      return res.status(500).json({
        error: startErr?.message || 'Could not start interview session',
      });
    }

    // Update learning status
    if (supabaseAdmin) {
      try {
        await supabaseAdmin
          .schema('restaurant')
          .from('restaurant_config')
          .update({ learning_status: 'interviewing' })
          .eq('id', restaurantId);
      } catch (e) {
        logger.warn('learning_status=interviewing update failed (non-fatal):', e?.message);
      }
    }

    logger.info('Research complete, interview started:', {
      session_id: sessionId,
      tiers_completed: intelligenceResults.tiers_completed
    });

    return res.status(200).json({
      success: true,
      session_id: sessionId,
      research_results: {
        summary: intelligenceResults.summary,
        tiers_completed: intelligenceResults.tiers_completed
      },
      initial_ai_message: interviewState.ai_message,
      topics_covered: []
    });
  } catch (error) {
    // Stringify the full error shape so it actually shows up in Vercel logs
    // (otherwise `error` prints as "[object Object]"). The audit 2026-05-18
    // hit a `FUNCTION_INVOCATION_FAILED` here that gave us zero signal.
    logger.error('Research endpoint error', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
      stack: error?.stack?.split('\n').slice(0, 6).join('\n'),
    });

    // Reset learning status so user can retry. Best-effort — schema fixed in
    // 20260518_restaurant_learning_tables migration, but if the column is
    // still missing we don't want the cleanup itself to mask the real error.
    if (supabaseAdmin && restaurantId) {
      await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .update({ learning_status: 'pending' })
        .eq('id', restaurantId)
        .catch(cleanupErr => logger.error('Failed to reset learning_status:', cleanupErr));
    }

    // Surface the actual error message to the client. The frontend's
    // extractErrorMessage() already only renders strings, and this string
    // helps diagnose 500s without needing Vercel log access. Stack is NOT
    // included — only the user-safe message.
    return res.status(500).json({
      error: error?.message || 'Failed to complete restaurant research'
    });
  }
};
