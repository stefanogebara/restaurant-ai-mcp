/**
 * Identify Restaurant API
 *
 * Identifies which restaurant the customer wants to book at by name.
 * Used by the multi-tenant AI agent as the first step in the reservation flow.
 *
 * SECURITY: This endpoint does NOT enumerate the full restaurant list. The
 * previous behaviour (returning every active restaurant when no name was
 * supplied) leaked tenant inventory to anyone hitting the endpoint cold.
 * Now: a name is required, and we never return the "available restaurants"
 * list as a fallback. We only return the single match (or a small set of
 * fuzzy matches when the input is ambiguous).
 *
 * Rate limited as `public_enumeration` (20 req/min/IP) to slow brute-force
 * name-guessing attacks.
 */

const { getRestaurantByName } = require('./_lib/restaurant-registry');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const logger = createSecureLogger('IdentifyRestaurant');

module.exports = async (req, res) => {
  // Enable CORS
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Rate limit: tight limit on public enumeration endpoint (20 req/min per IP)
  if (await checkAndApplyRateLimit(req, res, 'public_enumeration')) return;

  try {
    const { restaurant_name } = req.method === 'POST' ? req.body : req.query;

    // Require a search term — no "tell me everything" mode. This is the
    // primary defence against tenant enumeration via this endpoint.
    if (!restaurant_name || typeof restaurant_name !== 'string' || restaurant_name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'restaurant_name_required',
        message: 'Please specify the restaurant name you want to book at.',
      });
    }

    logger.info(`[IdentifyRestaurant] Searching for: ${restaurant_name}`);

    // Search for the restaurant
    const result = await getRestaurantByName(restaurant_name);

    // Handle exact or high-confidence match
    if (result.match && result.confidence >= 0.6) {
      logger.info(`[IdentifyRestaurant] Found: ${result.match.restaurant_name} (confidence: ${result.confidence})`);

      return res.status(200).json({
        success: true,
        found: true,
        message: `Found ${result.match.restaurant_name}. I'll help you make a reservation there.`,
        restaurant: {
          id: result.match.id,
          name: result.match.restaurant_name,
          language: result.match.language || 'en'
        },
        confidence: result.confidence,
        session_context: {
          restaurant_id: result.match.id,
          restaurant_name: result.match.restaurant_name
        }
      });
    }

    // Handle multiple potential matches (disambiguation needed)
    if (result.needsDisambiguation && result.matches) {
      logger.info(`[IdentifyRestaurant] Multiple matches found, disambiguation needed`);

      return res.status(200).json({
        success: true,
        found: false,
        needs_clarification: true,
        message: `I found several restaurants that match "${restaurant_name}". Which one did you mean?`,
        options: result.matches.map(r => ({
          id: r.id,
          name: r.restaurant_name,
          similarity: r.similarity
        }))
      });
    }

    // No match found — do NOT include a list of other restaurants here.
    // That was the enumeration vector. Just say we couldn't find it and
    // ask the caller to clarify.
    logger.info(`[IdentifyRestaurant] No match found for: ${restaurant_name}`);

    return res.status(200).json({
      success: true,
      found: false,
      message: `I couldn't find a restaurant called "${restaurant_name}". Could you double-check the name and try again?`,
    });

  } catch (error) {
    logger.error('[IdentifyRestaurant] Error:', error);
    return res.status(500).json({
      success: false,
      error: true,
      message: 'Unable to identify the restaurant at this time. Please try again.'
    });
  }
};
