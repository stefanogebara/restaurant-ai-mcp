/**
 * Restaurant Settings API - Enhanced with Profile Management
 * Handles restaurant settings including language preferences and metric profiles
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const ALLOWED_LANGUAGES = ['en', 'es', 'pt', 'fr', 'it'];

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
      currency: 'EUR',
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
    currency: 'EUR',
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Restaurant-ID');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { method } = req;
    const restaurantId = req.headers['x-restaurant-id'] || req.query.restaurant_id;
    const path = req.url.split('?')[0];

    if (!restaurantId && !path.includes('/profile/recommend')) {
      return res.status(400).json({ success: false, error: 'Restaurant ID is required' });
    }

    // GET /profile
    if (method === 'GET' && path.includes('/profile')) {
      const { data: restaurant, error } = await supabase
        .from('restaurant_info')
        .select('metric_profile, language')
        .eq('id', restaurantId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch profile' });
      }

      if (!restaurant) {
        return res.status(404).json({ success: false, error: 'Restaurant not found' });
      }

      const profile = restaurant.metric_profile || getDefaultMetricProfile(restaurant.language);
      return res.status(200).json({ success: true, data: profile });
    }

    // PUT /profile
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
        .from('restaurant_info')
        .update({ metric_profile })
        .eq('id', restaurantId)
        .select('metric_profile')
        .single();

      if (error) {
        console.error('Error updating profile:', error);
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
    if (method === 'GET' && !path.includes('/profile')) {
      const { data: restaurant, error } = await supabase
        .from('restaurant_info')
        .select('language, restaurant_name, city, country')
        .eq('id', restaurantId)
        .single();

      if (error) {
        console.error('Error fetching restaurant settings:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch restaurant settings' });
      }

      if (!restaurant) {
        return res.status(404).json({ success: false, error: 'Restaurant not found' });
      }

      return res.status(200).json({
        success: true,
        data: {
          language: restaurant.language || 'en',
          restaurant_name: restaurant.restaurant_name,
          city: restaurant.city,
          country: restaurant.country,
        },
      });
    }

    // PUT / - Update settings
    if (method === 'PUT' && !path.includes('/profile')) {
      const ALLOWED_FIELDS = ['language', 'restaurant_name', 'city', 'country', 'phone', 'email', 'business_hours', 'timezone'];
      const { language } = req.body;

      if (language && !ALLOWED_LANGUAGES.includes(language)) {
        return res.status(400).json({ success: false, error: `Invalid language. Allowed values: ${ALLOWED_LANGUAGES.join(', ')}` });
      }

      const updates = {};
      for (const field of ALLOWED_FIELDS) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'No updates provided' });
      }

      const { data, error } = await supabase
        .from('restaurant_info')
        .update(updates)
        .eq('id', restaurantId)
        .select('language, restaurant_name')
        .single();

      if (error) {
        console.error('Error updating restaurant settings:', error);
        return res.status(500).json({ success: false, error: 'Failed to update restaurant settings' });
      }

      return res.status(200).json({
        success: true,
        message: 'Settings updated successfully',
        data: { language: data.language, restaurant_name: data.restaurant_name },
      });
    }

    return res.status(405).json({ success: false, error: `Method ${method} not allowed for path ${path}` });
  } catch (error) {
    console.error('Restaurant settings API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error', details: error.message });
  }
}
