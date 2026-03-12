/**
 * Identify Restaurant API
 *
 * Identifies which restaurant the customer wants to book at.
 * Used by the multi-tenant AI agent as the first step in the reservation flow.
 */

const { getRestaurantByName, getAllActiveRestaurants } = require('./_lib/restaurant-registry');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const logger = createSecureLogger('IdentifyRestaurant');

module.exports = async (req, res) => {
  // Enable CORS
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ success: true });
  }

  // Rate limit (60 req/min)
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  try {
    const { restaurant_name } = req.method === 'POST' ? req.body : req.query;

    if (!restaurant_name) {
      // If no restaurant name provided, return list of available restaurants
      const restaurants = await getAllActiveRestaurants();

      if (restaurants.length === 0) {
        return res.status(200).json({
          success: false,
          message: 'No restaurants are currently available. Please try again later.'
        });
      }

      return res.status(200).json({
        success: false,
        message: 'Which restaurant would you like to book at? We have the following options:',
        available_restaurants: restaurants.map(r => ({
          name: r.restaurant_name,
          id: r.id
        }))
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

    // No match found
    logger.info(`[IdentifyRestaurant] No match found for: ${restaurant_name}`);

    // Get available restaurants to suggest
    const restaurants = await getAllActiveRestaurants();

    return res.status(200).json({
      success: true,
      found: false,
      message: `I couldn't find a restaurant called "${restaurant_name}". Could you please clarify which restaurant you'd like to book at?`,
      available_restaurants: restaurants.slice(0, 5).map(r => ({
        name: r.restaurant_name,
        id: r.id
      }))
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
