/**
 * Restaurant Registry Service
 *
 * CRUD operations for the restaurant registry.
 * Handles restaurant name matching with exact and fuzzy matching capabilities.
 */

const { centralSupabase, isCentralConfigured } = require('./central-supabase');
const { supabaseAdmin } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('RestaurantRegistry');

/**
 * Get a restaurant by exact name match (case-insensitive)
 * @param {string} name - Restaurant name to search for
 * @returns {Promise<object>} Match result with confidence score
 */
async function getRestaurantByName(name) {
  if (!isCentralConfigured()) {
    logger.error('[RestaurantRegistry] Central Supabase not configured');
    return { match: null, confidence: 0, error: 'Database not configured' };
  }

  if (!name || typeof name !== 'string') {
    return { match: null, confidence: 0, error: 'Invalid restaurant name' };
  }

  const searchName = name.trim();

  try {
    // First try exact match (case-insensitive)
    const { data: exact, error: exactError } = await centralSupabase
      .from('restaurant_registry')
      .select('id, restaurant_name, restaurant_aliases, supabase_url, supabase_anon_key, supabase_service_role_key, customer_email, subscription_status, plan_name, language, voice_id, is_active, created_at, updated_at')
      .ilike('restaurant_name', searchName)
      .eq('is_active', true)
      .single();

    if (exact && !exactError) {
      logger.info(`[RestaurantRegistry] Exact match found: ${exact.restaurant_name}`);
      return { match: exact, confidence: 1.0 };
    }

    // Try fuzzy match using the PostgreSQL function
    const { data: fuzzyResults, error: fuzzyError } = await centralSupabase
      .rpc('fuzzy_match_restaurant', { search_name: searchName });

    if (fuzzyError) {
      logger.error('[RestaurantRegistry] Fuzzy match error:', fuzzyError);
      return { match: null, confidence: 0, error: fuzzyError.message };
    }

    if (!fuzzyResults || fuzzyResults.length === 0) {
      logger.info(`[RestaurantRegistry] No matches found for: ${searchName}`);
      return { match: null, confidence: 0 };
    }

    // Single high-confidence match
    if (fuzzyResults.length === 1 && fuzzyResults[0].similarity > 0.6) {
      logger.info(`[RestaurantRegistry] High-confidence fuzzy match: ${fuzzyResults[0].restaurant_name} (${fuzzyResults[0].similarity})`);
      return {
        match: fuzzyResults[0],
        confidence: fuzzyResults[0].similarity
      };
    }

    // Multiple potential matches - needs disambiguation
    logger.info(`[RestaurantRegistry] Multiple matches found for: ${searchName}`, fuzzyResults.map(r => r.restaurant_name));
    return {
      matches: fuzzyResults,
      confidence: 0,
      needsDisambiguation: true
    };

  } catch (error) {
    logger.error('[RestaurantRegistry] Error searching for restaurant:', error);
    return { match: null, confidence: 0, error: error.message };
  }
}

/**
 * Get restaurant by ID
 * @param {string} id - Restaurant UUID
 * @returns {Promise<object|null>} Restaurant record or null
 */
async function getRestaurantById(id) {
  if (!isCentralConfigured()) {
    logger.error('[RestaurantRegistry] Central Supabase not configured');
    return null;
  }

  try {
    const { data, error } = await centralSupabase
      .from('restaurant_registry')
      .select('id, restaurant_name, restaurant_aliases, supabase_url, supabase_anon_key, supabase_service_role_key, customer_email, subscription_status, plan_name, language, voice_id, is_active, created_at, updated_at')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) {
      logger.error('[RestaurantRegistry] Error fetching restaurant by ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    logger.error('[RestaurantRegistry] Error:', error);
    return null;
  }
}

/**
 * Get all active restaurants
 * @returns {Promise<array>} List of active restaurants (name and ID only)
 */
async function getAllActiveRestaurants() {
  if (!isCentralConfigured()) {
    logger.error('[RestaurantRegistry] Central Supabase not configured');
    return [];
  }

  try {
    const { data, error } = await centralSupabase
      .from('restaurant_registry')
      .select('id, restaurant_name, restaurant_aliases, language')
      .eq('is_active', true)
      .order('restaurant_name');

    if (error) {
      logger.error('[RestaurantRegistry] Error fetching restaurants:', error);
      return [];
    }

    const restaurants = data || [];

    // Enrich with restaurant_type and city from restaurant.restaurant_config
    if (restaurants.length > 0) {
      try {
        const ids = restaurants.map(r => r.id);
        const { data: configs, error: configError } = await supabaseAdmin
          .schema('restaurant')
          .from('restaurant_config')
          .select('id, restaurant_type, city')
          .in('id', ids);

        if (!configError && configs) {
          const configMap = Object.fromEntries(configs.map(c => [c.id, c]));
          return restaurants.map(r => ({
            ...r,
            restaurant_type: configMap[r.id]?.restaurant_type || null,
            city: configMap[r.id]?.city || null,
          }));
        }
      } catch (configErr) {
        logger.warn('[RestaurantRegistry] Failed to enrich with config data (non-fatal):', configErr.message);
      }
    }

    return restaurants;
  } catch (error) {
    logger.error('[RestaurantRegistry] Error:', error);
    return [];
  }
}

/**
 * Register a new restaurant in the central registry
 * @param {object} restaurantData - Restaurant registration data
 * @returns {Promise<object>} Result with data or error
 */
async function registerRestaurant(restaurantData) {
  if (!isCentralConfigured()) {
    return { data: null, error: 'Central Supabase not configured' };
  }

  try {
    const { data, error } = await centralSupabase
      .from('restaurant_registry')
      .insert({
        restaurant_name: restaurantData.restaurant_name,
        restaurant_aliases: restaurantData.restaurant_aliases || [],
        supabase_url: restaurantData.supabase_url,
        supabase_anon_key: restaurantData.supabase_anon_key,
        supabase_service_role_key: restaurantData.supabase_service_role_key,
        customer_email: restaurantData.customer_email,
        subscription_status: restaurantData.subscription_status || 'active',
        plan_name: restaurantData.plan_name,
        language: restaurantData.language || 'en',
        voice_id: restaurantData.voice_id,
        is_active: restaurantData.is_active !== undefined ? restaurantData.is_active : true
      })
      .select()
      .single();

    if (error) {
      logger.error('[RestaurantRegistry] Error registering restaurant:', error);
      return { data: null, error: error.message };
    }

    logger.info(`[RestaurantRegistry] Registered restaurant: ${data.restaurant_name}`);
    return { data, error: null };
  } catch (error) {
    logger.error('[RestaurantRegistry] Error:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Update restaurant registration
 * @param {string} id - Restaurant UUID
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Result with data or error
 */
async function updateRestaurant(id, updates) {
  if (!isCentralConfigured()) {
    return { data: null, error: 'Central Supabase not configured' };
  }

  try {
    const { data, error } = await centralSupabase
      .from('restaurant_registry')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('[RestaurantRegistry] Error updating restaurant:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    logger.error('[RestaurantRegistry] Error:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Upsert a restaurant in the registry by ID (insert or update on conflict)
 * @param {string} id - Restaurant UUID (same as restaurant_config.id)
 * @param {object} restaurantData - Fields to set
 * @returns {Promise<object>} Result with data or error
 */
async function upsertRestaurant(id, restaurantData) {
  if (!isCentralConfigured()) {
    return { data: null, error: 'Central Supabase not configured' };
  }

  try {
    const { data, error } = await centralSupabase
      .from('restaurant_registry')
      .upsert({
        id,
        restaurant_name: restaurantData.restaurant_name,
        restaurant_aliases: restaurantData.restaurant_aliases || [],
        language: restaurantData.language || 'en',
        is_active: restaurantData.is_active !== undefined ? restaurantData.is_active : true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      logger.error('[RestaurantRegistry] Error upserting restaurant:', error);
      return { data: null, error: error.message };
    }

    logger.info(`[RestaurantRegistry] Upserted restaurant: ${restaurantData.restaurant_name}`);
    return { data, error: null };
  } catch (error) {
    logger.error('[RestaurantRegistry] Error:', error);
    return { data: null, error: error.message };
  }
}

/**
 * Deactivate a restaurant (soft delete)
 * @param {string} id - Restaurant UUID
 * @returns {Promise<boolean>} Success status
 */
async function deactivateRestaurant(id) {
  const result = await updateRestaurant(id, { is_active: false });
  return !result.error;
}

/**
 * Get restaurant by customer email
 * @param {string} email - Customer email
 * @returns {Promise<array>} List of restaurants for this customer
 */
async function getRestaurantsByEmail(email) {
  if (!isCentralConfigured()) {
    return [];
  }

  try {
    const { data, error } = await centralSupabase
      .from('restaurant_registry')
      .select('id, restaurant_name, restaurant_aliases, supabase_url, supabase_anon_key, supabase_service_role_key, customer_email, subscription_status, plan_name, language, voice_id, is_active, created_at, updated_at')
      .eq('customer_email', email)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('[RestaurantRegistry] Error fetching by email:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('[RestaurantRegistry] Error:', error);
    return [];
  }
}

module.exports = {
  getRestaurantByName,
  getRestaurantById,
  getAllActiveRestaurants,
  registerRestaurant,
  updateRestaurant,
  upsertRestaurant,
  deactivateRestaurant,
  getRestaurantsByEmail
};
