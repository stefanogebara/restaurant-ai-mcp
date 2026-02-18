/**
 * Restaurant Intelligence Service
 *
 * Web intelligence gathering with 3-tier approach:
 *   Tier 1: Google Places API (Text Search v2) - rating, reviews, address, hours, price_level
 *   Tier 2: Website fetch + Claude Haiku extraction - menu, description, atmosphere
 *   Tier 3: Google Custom Search - supplementary data
 *
 * Stores results in restaurant.restaurant_intelligence table.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('RestaurantIntelligence');

// Singleton Anthropic client (reuses connections, enables SDK retry/pooling)
let _anthropicClient = null;
function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey });
  }
  return _anthropicClient;
}

// Max response body size for website fetches (2MB)
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

// ============ URL Safety (SSRF Protection) ============

/**
 * Validate that a URL is safe for server-side fetching.
 * Blocks private IPs, localhost, metadata endpoints, and non-HTTP(S) protocols.
 * @param {string} inputUrl - URL to validate
 * @returns {boolean} True if safe
 */
function isUrlSafe(inputUrl) {
  try {
    const parsed = new URL(inputUrl);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost and loopback (IPv4 + IPv6)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
    if (hostname === '0.0.0.0' || hostname === '[::]') return false;

    // Block private IP ranges (RFC 1918)
    if (hostname.startsWith('10.')) return false;
    if (hostname.startsWith('192.168.')) return false;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return false;

    // Block link-local (IPv4 + IPv6)
    if (hostname.startsWith('169.254.')) return false;
    if (hostname.startsWith('fe80')) return false;

    // Block IPv6 private ranges
    if (hostname.startsWith('fc') || hostname.startsWith('fd')) return false; // Unique Local (fc00::/7)
    if (hostname.startsWith('::ffff:')) return false; // IPv4-mapped IPv6
    if (hostname === '::' || hostname === '[::1]') return false;

    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254') return false;
    if (hostname === 'metadata.google.internal') return false;

    // Block internal/local domains
    if (hostname.endsWith('.internal') || hostname.endsWith('.local') || hostname.endsWith('.localhost')) return false;

    // Block non-standard ports commonly used for internal services
    if (parsed.port && !['80', '443', ''].includes(parsed.port)) return false;

    // Block bracket-wrapped IPv6 that might bypass other checks
    if (hostname.startsWith('[')) return false;

    return true;
  } catch {
    return false;
  }
}

// ============ Tier 1: Google Places API ============

/**
 * Fetch restaurant data from Google Places Text Search v2
 * @param {string} restaurantName - Name of the restaurant
 * @param {string} city - City name
 * @param {string} country - Country name
 * @returns {object|null} Places data or null
 */
async function fetchGooglePlacesData(restaurantName, city, country) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    logger.warn('GOOGLE_PLACES_API_KEY not configured, skipping Tier 1');
    return null;
  }

  try {
    const query = `${restaurantName} restaurant ${city} ${country}`;
    const url = 'https://places.googleapis.com/v1/places:searchText';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.priceLevel,places.regularOpeningHours,places.websiteUri,places.types,places.reviews,places.editorialSummary,places.googleMapsUri'
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        languageCode: 'en'
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn('Google Places API error:', { status: response.status });
      return null;
    }

    const data = await response.json();
    const place = data.places?.[0];
    if (!place) {
      logger.info('No Google Places results found for:', query);
      return null;
    }

    const topReviews = (place.reviews || []).slice(0, 5).map(review => ({
      text: review.text?.text || '',
      rating: review.rating,
      author: review.authorAttribution?.displayName || 'Anonymous',
      time: review.relativePublishTimeDescription || ''
    }));

    return {
      source: 'google_places',
      name: place.displayName?.text || restaurantName,
      address: place.formattedAddress || null,
      rating: place.rating || null,
      review_count: place.userRatingCount || 0,
      price_level: place.priceLevel || null,
      opening_hours: place.regularOpeningHours?.weekdayDescriptions || null,
      website: place.websiteUri || null,
      types: place.types || [],
      editorial_summary: place.editorialSummary?.text || null,
      google_maps_url: place.googleMapsUri || null,
      top_reviews: topReviews,
      fetched_at: new Date().toISOString()
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      logger.warn('Google Places API request timed out');
    } else {
      logger.error('Google Places fetch error:', error);
    }
    return null;
  }
}

// ============ Tier 2: Website + Claude Extraction ============

/**
 * Fetch a website and extract structured data using Claude Haiku
 * @param {string} websiteUrl - URL to fetch
 * @param {string} restaurantName - Restaurant name for context
 * @returns {object|null} Extracted data or null
 */
async function fetchAndExtractWebsite(websiteUrl, restaurantName) {
  if (!websiteUrl) {
    logger.info('No website URL provided, skipping Tier 2');
    return null;
  }

  // SSRF protection
  if (!isUrlSafe(websiteUrl)) {
    logger.warn('Website URL blocked by SSRF protection:', { url: websiteUrl });
    return null;
  }

  try {
    // Fetch website content with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(websiteUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SeutableBot/1.0 (restaurant-intelligence)',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'manual' // Prevent redirect-chain SSRF bypass
    });
    clearTimeout(timeout);

    // Handle redirects manually with SSRF validation
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const redirectUrl = response.headers.get('location');
      if (!redirectUrl || !isUrlSafe(new URL(redirectUrl, websiteUrl).href)) {
        logger.warn('Redirect blocked by SSRF protection:', { redirect: redirectUrl });
        return null;
      }
      // Follow one redirect only (no chains)
      const redirectController = new AbortController();
      const redirectTimeout = setTimeout(() => redirectController.abort(), 8000);
      const redirectResponse = await fetch(new URL(redirectUrl, websiteUrl).href, {
        signal: redirectController.signal,
        headers: { 'User-Agent': 'SeutableBot/1.0', 'Accept': 'text/html' },
        redirect: 'manual'
      });
      clearTimeout(redirectTimeout);
      if (!redirectResponse.ok) {
        logger.warn('Redirect target fetch failed:', { status: redirectResponse.status });
        return null;
      }
      // Check content-length to prevent huge responses
      const redirectLength = parseInt(redirectResponse.headers.get('content-length') || '0', 10);
      if (redirectLength > MAX_RESPONSE_BYTES) {
        logger.warn('Redirect response too large:', { size: redirectLength });
        return null;
      }
      var html = await redirectResponse.text();
    } else if (!response.ok) {
      logger.warn('Website fetch failed:', { status: response.status });
      return null;
    } else {
      // Check content-length to prevent huge responses
      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      if (contentLength > MAX_RESPONSE_BYTES) {
        logger.warn('Response too large, skipping:', { size: contentLength });
        return null;
      }
      var html = await response.text();
      // Enforce size limit even without content-length header
      if (html.length > MAX_RESPONSE_BYTES) {
        logger.warn('Response body exceeded size limit');
        html = html.slice(0, MAX_RESPONSE_BYTES);
      }
    }

    // Strip HTML to plain text (basic cleanup)
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000); // Limit to ~8K chars for Claude

    if (textContent.length < 50) {
      logger.info('Website content too short, skipping extraction');
      return null;
    }

    // Use Claude Haiku to extract structured data
    const anthropic = getAnthropicClient();
    if (!anthropic) {
      logger.warn('ANTHROPIC_API_KEY not configured, skipping website extraction');
      return null;
    }

    const extractionController = new AbortController();
    const extractionTimeout = setTimeout(() => extractionController.abort(), 30000);

    const extraction = await anthropic.messages.create({
      model: 'claude-haiku-4-20250414',
      max_tokens: 1500,
      signal: extractionController.signal,
      messages: [{
        role: 'user',
        content: `Extract restaurant information from this website text for a restaurant. Return JSON only with these fields (use null for missing data):

{
  "description": "Brief restaurant description (2-3 sentences)",
  "cuisine_type": "Primary cuisine type",
  "atmosphere": "Description of atmosphere/vibe",
  "signature_dishes": ["List of notable dishes mentioned"],
  "menu_highlights": ["Key menu categories or sections"],
  "price_range": "Budget/Moderate/Upscale/Fine Dining",
  "special_features": ["e.g., outdoor seating, private dining, live music"],
  "chef_info": "Chef name or background if mentioned",
  "awards_press": ["Any awards or press mentions"]
}

Website text:
${textContent}`
      }]
    });

    clearTimeout(extractionTimeout);

    const responseText = extraction.content[0]?.text || '';

    // Parse JSON from Claude response (with safety)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('Could not parse JSON from Claude extraction');
      return null;
    }

    let extracted;
    try {
      extracted = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      logger.warn('Invalid JSON from Claude extraction');
      return null;
    }

    return {
      source: 'website_extraction',
      website_url: websiteUrl,
      ...extracted,
      fetched_at: new Date().toISOString()
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      logger.warn('Website fetch timed out:', { url: websiteUrl });
    } else {
      logger.error('Website extraction error:', error);
    }
    return null;
  }
}

// ============ Tier 3: Google Custom Search ============

/**
 * Fetch supplementary data from Google Custom Search
 * @param {string} restaurantName - Restaurant name
 * @param {string} city - City name
 * @returns {object|null} Search results or null
 */
async function fetchSearchResults(restaurantName, city) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    logger.info('Google Custom Search not configured, skipping Tier 3');
    return null;
  }

  try {
    const query = `${restaurantName} ${city} restaurant reviews awards`;
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(searchEngineId)}&q=${encodeURIComponent(query)}&num=5`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn('Google Custom Search error:', { status: response.status });
      return null;
    }

    const data = await response.json();
    const results = (data.items || []).map(item => ({
      title: item.title,
      snippet: item.snippet,
      link: item.link
    }));

    return {
      source: 'google_search',
      query,
      results,
      fetched_at: new Date().toISOString()
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      logger.warn('Google Custom Search request timed out');
    } else {
      logger.error('Google Custom Search error:', error);
    }
    return null;
  }
}

// ============ Synthesis ============

/**
 * Synthesize all intelligence tiers into a unified profile
 * @param {object} placesData - Tier 1 data
 * @param {object} websiteData - Tier 2 data
 * @param {object} searchData - Tier 3 data
 * @param {string} restaurantName - Restaurant name
 * @returns {object} Synthesized profile
 */
function synthesizeProfile(placesData, websiteData, searchData, restaurantName) {
  return {
    restaurant_name: restaurantName,
    google_places: placesData,
    website_extraction: websiteData,
    search_results: searchData,
    summary: {
      rating: placesData?.rating || null,
      review_count: placesData?.review_count || 0,
      price_level: placesData?.price_level || websiteData?.price_range || null,
      cuisine_type: websiteData?.cuisine_type || null,
      atmosphere: websiteData?.atmosphere || null,
      description: websiteData?.description || placesData?.editorial_summary || null,
      signature_dishes: websiteData?.signature_dishes || [],
      address: placesData?.address || null,
      website: placesData?.website || null
    },
    tiers_completed: {
      google_places: !!placesData,
      website_extraction: !!websiteData,
      google_search: !!searchData
    },
    gathered_at: new Date().toISOString()
  };
}

// ============ Main Entry Point ============

/**
 * Gather all restaurant intelligence across 3 tiers
 * @param {object} params - Search parameters
 * @param {string} params.restaurant_name - Restaurant name
 * @param {string} params.city - City
 * @param {string} params.country - Country
 * @param {string} [params.website] - Optional website URL
 * @param {string} [params.restaurant_config_id] - Restaurant config ID for storage
 * @returns {object} Intelligence results
 */
async function gatherRestaurantIntelligence({ restaurant_name, city, country, website, restaurant_config_id }) {
  logger.info('Gathering intelligence for:', { restaurant_name, city, country });

  // Run all three tiers in parallel
  const [placesData, websiteData, searchData] = await Promise.all([
    fetchGooglePlacesData(restaurant_name, city, country),
    fetchAndExtractWebsite(website || null, restaurant_name),
    fetchSearchResults(restaurant_name, city)
  ]);

  // If Tier 2 had no website but Tier 1 found one, try again
  let finalWebsiteData = websiteData;
  if (!websiteData && !website && placesData?.website) {
    logger.info('Tier 1 found website, running Tier 2 with discovered URL');
    finalWebsiteData = await fetchAndExtractWebsite(placesData.website, restaurant_name);
  }

  const profile = synthesizeProfile(placesData, finalWebsiteData, searchData, restaurant_name);

  // Store intelligence in database if restaurant_config_id provided
  if (restaurant_config_id && supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_intelligence')
        .upsert({
          restaurant_config_id,
          intelligence_data: profile,
          google_places_data: placesData,
          website_extraction_data: finalWebsiteData,
          search_data: searchData,
          last_gathered_at: new Date().toISOString()
        }, { onConflict: 'restaurant_config_id' });

      if (error) {
        logger.error('Failed to store intelligence:', error);
      } else {
        logger.info('Intelligence stored for restaurant:', restaurant_config_id);
      }
    } catch (dbError) {
      logger.error('Database error storing intelligence:', dbError);
    }
  }

  return profile;
}

module.exports = {
  gatherRestaurantIntelligence,
  fetchGooglePlacesData,
  fetchAndExtractWebsite,
  fetchSearchResults,
  synthesizeProfile,
  isUrlSafe,
  getAnthropicClient
};
