/**
 * Restaurant Registry Service
 *
 * CRUD operations for the restaurant registry.
 * Handles restaurant name matching with exact and fuzzy matching capabilities.
 */

const { centralSupabase, isCentralConfigured } = require('./central-supabase');

/**
 * Get a restaurant by exact name match (case-insensitive)
 * @param {string} name - Restaurant name to search for
 * @returns {Promise<object>} Match result with confidence score
 */
async function getRestaurantByName(name) {
  if (!isCentralConfigured()) {
    console.error('[RestaurantRegistry] Central Supabase not configured');
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
      .select('*')
      .ilike('restaurant_name', searchName)
      .eq('is_active', true)
      .single();

    if (exact && !exactError) {
      console.log(`[RestaurantRegistry] Exact match found: ${exact.restaurant_name}`);
      return { match: exact, confidence: 1.0 };
    }

    // Try fuzzy match using the PostgreSQL function
    const { data: fuzzyResults, error: fuzzyError } = await centralSupabase
      .rpc('fuzzy_match_restaurant', { search_name: searchName });

    if (fuzzyError) {
      console.error('[RestaurantRegistry] Fuzzy match error:', fuzzyError);
      return { match: null, confidence: 0, error: fuzzyError.message };
    }

    if (!fuzzyResults || fuzzyResults.length === 0) {
      console.log(`[RestaurantRegistry] No matches found for: ${searchName}`);
      return { match: null, confidence: 0 };
    }

    // Single high-confidence match
    if (fuzzyResults.length === 1 && fuzzyResults[0].similarity > 0.6) {
      console.log(`[RestaurantRegistry] High-confidence fuzzy match: ${fuzzyResults[0].restaurant_name} (${fuzzyResults[0].similarity})`);
      return {
        match: fuzzyResults[0],
        confidence: fuzzyResults[0].similarity
      };
    }

    // Multiple potential matches - needs disambiguation
    console.log(`[RestaurantRegistry] Multiple matches found for: ${searchName}`, fuzzyResults.map(r => r.restaurant_name));
    return {
      matches: fuzzyResults,
      confidence: 0,
      needsDisambiguation: true
    };

  } catch (error) {
    console.error('[RestaurantRegistry] Error searching for restaurant:', error);
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
    console.error('[RestaurantRegistry] Central Supabase not configured');
    return null;
  }

  try {
    const { data, error } = await centralSupabase
      .from('restaurant_registry')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .single();

    if (error) {
      console.error('[RestaurantRegistry] Error fetching restaurant by ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[RestaurantRegistry] Error:', error);
    return null;
  }
}

/**
 * Get all active restaurants
 * @returns {Promise<array>} List of active restaurants (name and ID only)
 */
async function getAllActiveRestaurants() {
  if (!isCentralConfigured()) {
    console.error('[RestaurantRegistry] Central Supabase not configured');
    return [];
  }

  try {
    const { data, error } = await centralSupabase
      .from('restaurant_registry')
      .select('id, restaurant_name, restaurant_aliases, language')
      .eq('is_active', true)
      .order('restaurant_name');

    if (error) {
      console.error('[RestaurantRegistry] Error fetching restaurants:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[RestaurantRegistry] Error:', error);
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
      console.error('[RestaurantRegistry] Error registering restaurant:', error);
      return { data: null, error: error.message };
    }

    console.log(`[RestaurantRegistry] Registered restaurant: ${data.restaurant_name}`);
    return { data, error: null };
  } catch (error) {
    console.error('[RestaurantRegistry] Error:', error);
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
      console.error('[RestaurantRegistry] Error updating restaurant:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    console.error('[RestaurantRegistry] Error:', error);
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
      .select('*')
      .eq('customer_email', email)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[RestaurantRegistry] Error fetching by email:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('[RestaurantRegistry] Error:', error);
    return [];
  }
}

module.exports = {
  getRestaurantByName,
  getRestaurantById,
  getAllActiveRestaurants,
  registerRestaurant,
  updateRestaurant,
  deactivateRestaurant,
  getRestaurantsByEmail
};
