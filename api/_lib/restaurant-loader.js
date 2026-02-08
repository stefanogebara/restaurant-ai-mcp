/**
 * Restaurant Configuration Loader
 *
 * Loads restaurant-specific configuration based on incoming phone number
 * Used by ElevenLabs webhook to route calls to correct restaurant
 */

const { query } = require('./supabase');

/**
 * Get restaurant configuration by phone number
 * @param {string} phoneNumber - The phone number that was called (from ElevenLabs)
 * @returns {Promise<Object>} Restaurant configuration including voice, greeting, hours, etc.
 */
async function getRestaurantByPhone(phoneNumber) {
  if (!phoneNumber) {
    throw new Error('Phone number is required for restaurant lookup');
  }

  // Normalize phone number (remove spaces, dashes, etc.)
  const normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');

  console.log(`[RestaurantLoader] Looking up restaurant for phone: ${phoneNumber} (normalized: ${normalizedPhone})`);

  try {
    // Query restaurant_config by phone number
    const result = await query
      .from('restaurant_config')
      .select('*')
      .eq('phone', phoneNumber)
      .eq('is_active', true)
      .eq('onboarding_completed', true)
      .single();

    if (result.error) {
      console.error('[RestaurantLoader] Database error:', result.error);
      throw new Error(`Restaurant not found for phone number: ${phoneNumber}`);
    }

    const restaurant = result.data;

    console.log(`[RestaurantLoader] Found restaurant: ${restaurant.restaurant_name} (${restaurant.city}, ${restaurant.country})`);

    // Return formatted configuration for AI agent
    return {
      id: restaurant.id,
      name: restaurant.restaurant_name,
      restaurant_name: restaurant.restaurant_name,
      city: restaurant.city,
      country: restaurant.country,
      phone: restaurant.phone,
      email: restaurant.email,
      website: restaurant.website,

      // Voice configuration
      voice_id: restaurant.voice_id,

      // AI configuration
      ai_config: restaurant.ai_config,
      language: restaurant.ai_config?.language || 'en-US',
      greeting_message: restaurant.ai_config?.greeting_message,
      farewell_message: restaurant.ai_config?.farewell_message,

      // Business hours
      business_hours: restaurant.business_hours,
      average_dining_duration_minutes: restaurant.average_dining_duration_minutes || 90,

      // Table configuration
      table_configuration: restaurant.table_configuration,

      // Reservation settings
      reservation_settings: restaurant.reservation_settings,

      // Team members (if any)
      team_members: restaurant.team_members || []
    };
  } catch (error) {
    console.error('[RestaurantLoader] Error loading restaurant:', error);
    throw error;
  }
}

/**
 * Get restaurant configuration by ID
 * @param {string} restaurantId - UUID of the restaurant
 * @returns {Promise<Object>} Restaurant configuration
 */
async function getRestaurantById(restaurantId) {
  console.log(`[RestaurantLoader] Looking up restaurant by ID: ${restaurantId}`);

  try {
    // Try restaurant_config first (onboarded restaurants)
    const result = await query
      .from('restaurant_config')
      .select('*')
      .eq('id', restaurantId)
      .eq('is_active', true)
      .single();

    if (!result.error && result.data) {
      const restaurant = result.data;
      console.log(`[RestaurantLoader] Found restaurant in config: ${restaurant.restaurant_name}`);

      return {
        id: restaurant.id,
        name: restaurant.restaurant_name,
        restaurant_name: restaurant.restaurant_name,
        city: restaurant.city,
        country: restaurant.country,
        phone: restaurant.phone,
        email: restaurant.email,
        website: restaurant.website,
        voice_id: restaurant.voice_id,
        ai_config: restaurant.ai_config,
        language: restaurant.ai_config?.language || 'en-US',
        greeting_message: restaurant.ai_config?.greeting_message,
        farewell_message: restaurant.ai_config?.farewell_message,
        business_hours: restaurant.business_hours,
        average_dining_duration_minutes: restaurant.average_dining_duration_minutes || 90,
        table_configuration: restaurant.table_configuration,
        reservation_settings: restaurant.reservation_settings,
        team_members: restaurant.team_members || []
      };
    }

    // Fallback to restaurant_info table
    console.log(`[RestaurantLoader] Not found in restaurant_config, trying restaurant_info`);
    const infoResult = await query
      .from('restaurant_info')
      .select('*')
      .eq('id', restaurantId)
      .single();

    if (infoResult.error || !infoResult.data) {
      console.error('[RestaurantLoader] Not found in either table:', infoResult.error);
      throw new Error(`Restaurant not found with ID: ${restaurantId}`);
    }

    const restaurant = infoResult.data;
    console.log(`[RestaurantLoader] Found restaurant in info: ${restaurant.restaurant_name}`);

    return {
      id: restaurant.id,
      name: restaurant.restaurant_name,
      restaurant_name: restaurant.restaurant_name,
      phone: restaurant.phone,
      email: restaurant.email,
      language: restaurant.language || 'en',
      business_hours: restaurant.business_hours || {},
      average_dining_duration_minutes: restaurant.avg_dining_duration_minutes || 90,
      timezone: restaurant.timezone || 'Europe/Madrid',
      table_configuration: [],
      reservation_settings: {},
      team_members: []
    };
  } catch (error) {
    console.error('[RestaurantLoader] Error loading restaurant:', error);
    throw error;
  }
}

/**
 * List all active restaurants
 * @returns {Promise<Array>} List of active restaurants
 */
async function getAllRestaurants() {
  console.log('[RestaurantLoader] Fetching all active restaurants');

  try {
    const result = await query
      .from('restaurant_config')
      .select('id, restaurant_name, phone, city, country, voice_id, ai_config')
      .eq('is_active', true)
      .eq('onboarding_completed', true)
      .order('created_at', { ascending: false });

    if (result.error) {
      console.error('[RestaurantLoader] Database error:', result.error);
      throw new Error('Failed to fetch restaurants');
    }

    console.log(`[RestaurantLoader] Found ${result.data.length} active restaurants`);

    return result.data.map(r => ({
      id: r.id,
      name: r.restaurant_name,
      phone: r.phone,
      city: r.city,
      country: r.country,
      voice_id: r.voice_id,
      language: r.ai_config?.language || 'en-US'
    }));
  } catch (error) {
    console.error('[RestaurantLoader] Error listing restaurants:', error);
    throw error;
  }
}

module.exports = {
  getRestaurantByPhone,
  getRestaurantById,
  getAllRestaurants
};
