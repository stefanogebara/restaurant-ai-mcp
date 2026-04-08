/**
 * Restaurant Configuration Loader
 *
 * Loads restaurant-specific configuration based on incoming phone number
 * Used by ElevenLabs webhook to route calls to correct restaurant
 */

const { supabaseAdmin: query } = require('./supabase');
const { createSecureLogger } = require('./secure-logger');
const logger = createSecureLogger('RestaurantLoader');

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

  logger.info(`[RestaurantLoader] Looking up restaurant for phone: ${phoneNumber} (normalized: ${normalizedPhone})`);

  try {
    // Query restaurant_config by phone number
    const result = await query
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name, city, country, phone, email, website, voice_id, voice_engine, voice_engine_status, openai_voice_id, persona_prompt_override, voice_ws_endpoint, ai_config, business_hours, timezone, average_dining_duration_minutes, table_configuration, reservation_settings, team_members')
      .eq('phone', phoneNumber)
      .eq('is_active', true)
      .eq('onboarding_completed', true)
      .single();

    if (result.error) {
      logger.error('[RestaurantLoader] Database error:', result.error);
      throw new Error(`Restaurant not found for phone number: ${phoneNumber}`);
    }

    const restaurant = result.data;

    logger.info(`[RestaurantLoader] Found restaurant: ${restaurant.restaurant_name} (${restaurant.city}, ${restaurant.country})`);

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

      // Voice engine configuration
      voice_engine: restaurant.voice_engine || 'elevenlabs',
      voice_engine_status: restaurant.voice_engine_status || 'active',
      openai_voice_id: restaurant.openai_voice_id || 'alloy',
      persona_prompt_override: restaurant.persona_prompt_override || null,
      voice_ws_endpoint: restaurant.voice_ws_endpoint || null,

      // AI configuration
      ai_config: restaurant.ai_config,
      language: restaurant.ai_config?.language || 'en-US',
      greeting_message: restaurant.ai_config?.greeting_message,
      farewell_message: restaurant.ai_config?.farewell_message,

      // Business hours & timezone
      business_hours: restaurant.business_hours,
      timezone: restaurant.timezone || 'UTC',
      average_dining_duration_minutes: restaurant.average_dining_duration_minutes || 90,

      // Table configuration
      table_configuration: restaurant.table_configuration,

      // Reservation settings
      reservation_settings: restaurant.reservation_settings,

      // Team members (if any)
      team_members: restaurant.team_members || []
    };
  } catch (error) {
    logger.error('[RestaurantLoader] Error loading restaurant:', error);
    throw error;
  }
}

/**
 * Get restaurant configuration by ID
 * @param {string} restaurantId - UUID of the restaurant
 * @returns {Promise<Object>} Restaurant configuration
 */
async function getRestaurantById(restaurantId) {
  logger.info(`[RestaurantLoader] Looking up restaurant by ID: ${restaurantId}`);

  try {
    // Try restaurant_config first (onboarded restaurants)
    const result = await query
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name, city, country, phone, email, website, voice_id, voice_engine, voice_engine_status, openai_voice_id, persona_prompt_override, voice_ws_endpoint, ai_config, business_hours, timezone, average_dining_duration_minutes, table_configuration, reservation_settings, team_members')
      .eq('id', restaurantId)
      .eq('is_active', true)
      .single();

    if (!result.error && result.data) {
      const restaurant = result.data;
      logger.info(`[RestaurantLoader] Found restaurant in config: ${restaurant.restaurant_name}`);

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
        voice_engine: restaurant.voice_engine || 'elevenlabs',
        voice_engine_status: restaurant.voice_engine_status || 'active',
        openai_voice_id: restaurant.openai_voice_id || 'alloy',
        persona_prompt_override: restaurant.persona_prompt_override || null,
        voice_ws_endpoint: restaurant.voice_ws_endpoint || null,
        ai_config: restaurant.ai_config,
        language: restaurant.ai_config?.language || 'en-US',
        greeting_message: restaurant.ai_config?.greeting_message,
        farewell_message: restaurant.ai_config?.farewell_message,
        business_hours: restaurant.business_hours,
        timezone: restaurant.timezone || 'UTC',
        average_dining_duration_minutes: restaurant.average_dining_duration_minutes || 90,
        table_configuration: restaurant.table_configuration,
        reservation_settings: restaurant.reservation_settings,
        team_members: restaurant.team_members || []
      };
    }

    // Fallback to restaurant_info table
    logger.info(`[RestaurantLoader] Not found in restaurant_config, trying restaurant_info`);
    const infoResult = await query
      .schema('restaurant')
      .from('restaurant_info')
      .select('id, restaurant_name, phone, email, language, business_hours, avg_dining_duration_minutes, timezone')
      .eq('id', restaurantId)
      .single();

    if (infoResult.error || !infoResult.data) {
      logger.error('[RestaurantLoader] Not found in either table:', infoResult.error);
      throw new Error(`Restaurant not found with ID: ${restaurantId}`);
    }

    const restaurant = infoResult.data;
    logger.info(`[RestaurantLoader] Found restaurant in info: ${restaurant.restaurant_name}`);

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
    logger.error('[RestaurantLoader] Error loading restaurant:', error);
    throw error;
  }
}

/**
 * List all active restaurants
 * @returns {Promise<Array>} List of active restaurants
 */
async function getAllRestaurants() {
  logger.info('[RestaurantLoader] Fetching all active restaurants');

  try {
    const result = await query
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name, phone, city, country, voice_id, ai_config')
      .eq('is_active', true)
      .eq('onboarding_completed', true)
      .order('created_at', { ascending: false });

    if (result.error) {
      logger.error('[RestaurantLoader] Database error:', result.error);
      throw new Error('Failed to fetch restaurants');
    }

    logger.info(`[RestaurantLoader] Found ${result.data.length} active restaurants`);

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
    logger.error('[RestaurantLoader] Error listing restaurants:', error);
    throw error;
  }
}

/**
 * Get restaurant configuration by ElevenLabs agent ID
 * Used for routing webhooks from per-restaurant agents
 * @param {string} agentId - ElevenLabs agent ID
 * @returns {Promise<Object>} Restaurant configuration
 */
async function getRestaurantByAgentId(agentId) {
  if (!agentId) {
    throw new Error('Agent ID is required for restaurant lookup');
  }

  logger.info(`[RestaurantLoader] Looking up restaurant by agent_id: ${agentId}`);

  try {
    const result = await query
      .schema('restaurant')
      .from('restaurant_config')
      .select('id, restaurant_name, city, country, phone, email, website, voice_id, voice_engine, voice_engine_status, openai_voice_id, persona_prompt_override, voice_ws_endpoint, ai_config, business_hours, timezone, average_dining_duration_minutes, table_configuration, reservation_settings, team_members, elevenlabs_agent_id')
      .eq('elevenlabs_agent_id', agentId)
      .eq('is_active', true)
      .single();

    if (result.error || !result.data) {
      throw new Error(`Restaurant not found for agent_id: ${agentId}`);
    }

    const restaurant = result.data;
    logger.info(`[RestaurantLoader] Found restaurant by agent_id: ${restaurant.restaurant_name}`);

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
      voice_engine: restaurant.voice_engine || 'elevenlabs',
      voice_engine_status: restaurant.voice_engine_status || 'active',
      openai_voice_id: restaurant.openai_voice_id || 'alloy',
      persona_prompt_override: restaurant.persona_prompt_override || null,
      voice_ws_endpoint: restaurant.voice_ws_endpoint || null,
      ai_config: restaurant.ai_config,
      language: restaurant.ai_config?.language || 'en-US',
      greeting_message: restaurant.ai_config?.greeting_message,
      farewell_message: restaurant.ai_config?.farewell_message,
      business_hours: restaurant.business_hours,
      timezone: restaurant.timezone || 'UTC',
      average_dining_duration_minutes: restaurant.average_dining_duration_minutes || 90,
      table_configuration: restaurant.table_configuration,
      reservation_settings: restaurant.reservation_settings,
      team_members: restaurant.team_members || []
    };
  } catch (error) {
    logger.error('[RestaurantLoader] Error loading restaurant by agent_id:', error);
    throw error;
  }
}

module.exports = {
  getRestaurantByPhone,
  getRestaurantById,
  getRestaurantByAgentId,
  getAllRestaurants
};
