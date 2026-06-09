/**
 * Restaurant Settings API - Enhanced with Profile Management
 * Handles restaurant settings including language preferences and metric profiles
 */

const { verifyAuth } = require('./_lib/auth');
const { supabaseAdmin: supabase } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { triggerKbSync } = require('./_lib/kb-sync-trigger');
const logger = createSecureLogger('RestaurantSettings');

// Fields that, when changed, should propagate to the live ElevenLabs voice
// agent's knowledge base. Things like business_hours, restaurant_name,
// reservation_settings — Sofia needs to know them on her next call.
const KB_RELEVANT_FIELDS = new Set([
  'business_hours',
  'restaurant_name',
  'reservation_settings',
  'phone',
  'email',
  'city',
  'country',
  'timezone',
  'language',
]);

const ALLOWED_LANGUAGES = ['en', 'es', 'pt', 'pt-BR', 'fr', 'it'];

function getDefaultMetricProfile(language = 'en') {
  return {
    template: 'simple',
    restaurant_type: 'traditional',
    size: 'medium',
    location_type: 'residential',
    primary_concerns: ['no_shows', 'regular_customers'],
    visible_metrics: ['tables_available', 'todays_reservations', 'priority_actions', 'current_occupancy', 'next_arrivals'],
    hidden_metrics: ['ml_confidence', 'model_version', 'roc_auc', 'feature_importance', 'training_metrics'],
    customizations: {
      risk_display: 'simple',
      time_format: '24h',
      currency: 'BRL',
      show_technical_details: false,
      font_size: 'large',
      language: language,
      color_scheme: 'default',
      notification_level: 'essential'
    }
  };
}

function validateMetricProfile(profile) {
  const errors = [];
  const validTemplates = ['simple', 'balanced', 'advanced'];
  const validTypes = ['traditional', 'modern', 'fast-casual', 'fine-dining'];
  const validSizes = ['small', 'medium', 'large'];
  const validLocations = ['tourist', 'residential', 'business', 'town_center'];

  if (!profile.template || !validTemplates.includes(profile.template)) {
    errors.push('Invalid template');
  }
  if (!profile.restaurant_type || !validTypes.includes(profile.restaurant_type)) {
    errors.push('Invalid restaurant_type');
  }
  if (!profile.size || !validSizes.includes(profile.size)) {
    errors.push('Invalid size');
  }
  if (!profile.location_type || !validLocations.includes(profile.location_type)) {
    errors.push('Invalid location_type');
  }
  if (!Array.isArray(profile.primary_concerns)) {
    errors.push('primary_concerns must be an array');
  }
  if (!Array.isArray(profile.visible_metrics)) {
    errors.push('visible_metrics must be an array');
  }
  if (!Array.isArray(profile.hidden_metrics)) {
    errors.push('hidden_metrics must be an array');
  }
  if (!profile.customizations || typeof profile.customizations !== 'object') {
    errors.push('customizations must be an object');
  }

  return { isValid: errors.length === 0, errors };
}

function recommendProfile(characteristics) {
  const { restaurant_type, size, location_type, primary_concerns } = characteristics;

  let template = 'balanced';
  if (restaurant_type === 'traditional') template = 'simple';
  else if (restaurant_type === 'modern' || restaurant_type === 'fast-casual') template = 'advanced';

  const visibleMetrics = ['tables_available', 'todays_reservations', 'priority_actions', 'current_occupancy', 'next_arrivals'];
  const hiddenMetrics = ['ml_confidence', 'model_version', 'roc_auc', 'feature_importance', 'training_metrics'];

  if (primary_concerns.includes('revenue')) {
    visibleMetrics.push('revenue_today', 'average_party_size');
  }
  if (primary_concerns.includes('table_turnover')) {
    visibleMetrics.push('table_turnover_rate', 'seating_efficiency');
  }
  if (primary_concerns.includes('waitlist')) {
    visibleMetrics.push('waitlist_count', 'average_wait_time');
  }
  if (primary_concerns.includes('no_shows')) {
    visibleMetrics.push('no_show_rate', 'cancellation_rate');
  }

  const customizations = {
    risk_display: template === 'simple' ? 'simple' : template === 'balanced' ? 'detailed' : 'technical',
    time_format: '24h',
    currency: 'USD',
    show_technical_details: template === 'advanced',
    font_size: template === 'simple' ? 'large' : 'medium',
    language: 'en',
    color_scheme: 'default',
    notification_level: template === 'simple' ? 'essential' : 'all'
  };

  return {
    template,
    restaurant_type,
    size,
    location_type,
    primary_concerns,
    visible_metrics: [...new Set(visibleMetrics)],
    hidden_metrics: template === 'advanced' ? [] : hiddenMetrics,
    customizations
  };
}

module.exports = async function handler(req, res) {
  setInternalCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  try {
    const { method } = req;
    const path = req.url.split('?')[0];

    // Verify authentication
    const authResult = await verifyAuth(req, { required: true });
    if (authResult.error) {
      return res.status(authResult.status || 401).json({
        success: false,
        error: authResult.error,
      });
    }

    const restaurantId = authResult.user.restaurant_id;
    if (!restaurantId) {
      return res.status(400).json({ success: false, error: 'Restaurant ID is required' });
    }

    // GET /profile
    // metric_profile and language live on restaurant_info, not restaurant_config
    if (method === 'GET' && path.includes('/profile')) {
      const { data: restaurant, error } = await supabase
        .schema('restaurant')
        .from('restaurant_info')
        .select('metric_profile, language')
        .eq('id', restaurantId)
        .single();

      if (error) {
        // Fall back to restaurant_config.agent_language if restaurant_info doesn't exist
        const { data: configData } = await supabase
          .schema('restaurant')
          .from('restaurant_config')
          .select('agent_language')
          .eq('id', restaurantId)
          .single();

        if (!configData) {
          logger.error('Error fetching profile:', error);
          return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
        }

        const profile = getDefaultMetricProfile(configData.agent_language || 'en');
        return res.status(200).json({ success: true, data: profile });
      }

      if (!restaurant) {
        return res.status(404).json({ success: false, error: 'Restaurant not found' });
      }

      const profile = restaurant.metric_profile || getDefaultMetricProfile(restaurant.language);
      return res.status(200).json({ success: true, data: profile });
    }

    // PUT /profile
    // metric_profile lives on restaurant_info, not restaurant_config
    if (method === 'PUT' && path.includes('/profile')) {
      const { metric_profile } = req.body;

      if (!metric_profile) {
        return res.status(400).json({ success: false, error: 'metric_profile is required' });
      }

      const validation = validateMetricProfile(metric_profile);
      if (!validation.isValid) {
        return res.status(400).json({ success: false, error: 'Invalid metric profile', details: validation.errors });
      }

      const { data, error } = await supabase
        .schema('restaurant')
        .from('restaurant_info')
        .update({ metric_profile })
        .eq('id', restaurantId)
        .select('metric_profile')
        .single();

      if (error) {
        logger.error('Error updating profile:', error);
        return res.status(500).json({ success: false, error: 'Failed to update profile' });
      }

      return res.status(200).json({ success: true, message: 'Profile updated successfully', data: data.metric_profile });
    }

    // POST /profile/recommend
    if (method === 'POST' && path.includes('/profile/recommend')) {
      const { restaurant_type, size, location_type, primary_concerns } = req.body;

      if (!restaurant_type || !size || !location_type || !primary_concerns) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const recommendedProfile = recommendProfile({ restaurant_type, size, location_type, primary_concerns });
      const reasoning = `Based on your ${restaurant_type} restaurant with ${size} capacity in a ${location_type} area, we recommend the ${recommendedProfile.template} dashboard template.`;

      return res.status(200).json({ success: true, data: { recommended_profile: recommendedProfile, reasoning } });
    }

    // GET / - Basic settings
    // restaurant_config uses agent_language (not language) as the column name
    if (method === 'GET' && !path.includes('/profile')) {
      // cover_image_url ships in migration 20260609 — try the full select,
      // fall back to the legacy column list pre-migration so settings never
      // 500 on a schema race.
      const SETTINGS_COLS = 'agent_language, restaurant_name, city, country, phone, email, business_hours, timezone, reservation_settings';
      let { data: restaurant, error } = await supabase
        .schema('restaurant')
        .from('restaurant_config')
        .select(`${SETTINGS_COLS}, cover_image_url`)
        .eq('id', restaurantId)
        .single();

      if (error && /cover_image_url|column .* does not exist/i.test(error.message || '')) {
        ({ data: restaurant, error } = await supabase
          .schema('restaurant')
          .from('restaurant_config')
          .select(SETTINGS_COLS)
          .eq('id', restaurantId)
          .single());
      }

      if (error) {
        logger.error('Error fetching restaurant settings:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch restaurant settings' });
      }

      if (!restaurant) {
        return res.status(404).json({ success: false, error: 'Restaurant not found' });
      }

      return res.status(200).json({
        success: true,
        data: {
          language: restaurant.agent_language || 'en',
          restaurant_name: restaurant.restaurant_name,
          city: restaurant.city,
          country: restaurant.country,
          phone: restaurant.phone || '',
          email: restaurant.email || '',
          business_hours: restaurant.business_hours || null,
          timezone: restaurant.timezone || 'America/Sao_Paulo',
          reservation_settings: restaurant.reservation_settings || null,
          cover_image_url: restaurant.cover_image_url || null,
        },
      });
    }

    // PUT / - Update settings
    // restaurant_config uses agent_language (not language), so we map the field name
    if (method === 'PUT' && !path.includes('/profile')) {
      const ALLOWED_FIELDS = ['language', 'restaurant_name', 'city', 'country', 'phone', 'email', 'business_hours', 'timezone', 'reservation_settings'];
      const { language } = req.body;

      if (language && !ALLOWED_LANGUAGES.includes(language)) {
        return res.status(400).json({ success: false, error: `Invalid language. Allowed values: ${ALLOWED_LANGUAGES.join(', ')}` });
      }

      const updates = {};
      for (const field of ALLOWED_FIELDS) {
        if (req.body[field] !== undefined) {
          if (field === 'language') {
            // Map 'language' from the API to 'agent_language' column in restaurant_config
            updates.agent_language = req.body[field];
          } else {
            updates[field] = req.body[field];
          }
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'No updates provided' });
      }

      const { data, error } = await supabase
        .schema('restaurant')
        .from('restaurant_config')
        .update(updates)
        .eq('id', restaurantId)
        .select('agent_language, restaurant_name')
        .single();

      if (error) {
        logger.error('Error updating restaurant settings:', error);
        return res.status(500).json({ success: false, error: 'Failed to update restaurant settings' });
      }

      // Sync KB to ElevenLabs if the changed fields affect what Sofia knows.
      const touchedKbFields = Object.keys(req.body).some(f => KB_RELEVANT_FIELDS.has(f));
      let kbSynced = null;
      if (touchedKbFields) {
        const result = await triggerKbSync(restaurantId, { reason: 'restaurant_settings' });
        kbSynced = result.success;
      }

      return res.status(200).json({
        success: true,
        message: 'Settings updated successfully',
        data: { language: data.agent_language, restaurant_name: data.restaurant_name },
        kb_synced: kbSynced,
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    logger.error('Restaurant settings API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error', details: 'Something went wrong. Please try again.' });
  }
}
