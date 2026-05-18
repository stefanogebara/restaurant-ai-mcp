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
const { gatherRestaurantIntelligence, isUrlSafe } = require('../services/restaurantIntelligence');
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

    // Update learning status
    if (supabaseAdmin) {
      await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .update({ learning_status: 'scraping' })
        .eq('id', restaurantId);
    }

    // Gather intelligence (all 3 tiers in parallel). The tiers' own internal
    // timeouts can chain to ~96s worst case (Tier 2 fetch + extraction + Tier 2
    // retry after Tier 1 discovers a website), past Vercel's 60s lambda budget.
    // Hit during 2026-05-18 audit: every fresh account 500'd with
    // FUNCTION_INVOCATION_FAILED. Wrap in a hard 45s race so we always have
    // time to insert the interview session + return a 201 — the interview
    // can start with a generic greeting if intelligence times out; the user
    // can still answer the 12 topics, and a cron later can backfill the
    // restaurant_intelligence row.
    const INTELLIGENCE_BUDGET_MS = 45000;
    const intelligenceResults = await Promise.race([
      gatherRestaurantIntelligence({
        restaurant_name,
        city,
        country,
        website,
        restaurant_config_id: restaurantId
      }),
      new Promise((resolve) => setTimeout(() => {
        logger.warn('Intelligence gathering exceeded 45s budget; proceeding with empty profile', {
          restaurantId,
          restaurant_name
        });
        // Return the shape synthesizeProfile would produce when all 3 tiers
        // return null — keeps downstream code (startOrResumeInterview's
        // buildIntelligenceContext) safe to call without null checks.
        resolve({
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
          _timed_out: true
        });
      }, INTELLIGENCE_BUDGET_MS)),
    ]);

    // Update learning status
    if (supabaseAdmin) {
      await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .update({ learning_status: 'scraped' })
        .eq('id', restaurantId);
    }

    // Create interview session
    const sessionId = crypto.randomUUID();
    const interviewState = await startOrResumeInterview(
      sessionId,
      restaurantId,
      intelligenceResults
    );

    // Update learning status
    if (supabaseAdmin) {
      await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .update({ learning_status: 'interviewing' })
        .eq('id', restaurantId);
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
